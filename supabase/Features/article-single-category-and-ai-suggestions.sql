-- Deploy AFTER article-publishing-permissions-update.sql and subscription-tiers.sql.
-- Existing primary categories are retained. Extra legacy links are backed up
-- privately before removal. Ambiguous articles abort the whole migration.
begin;
lock table public.articles, public.article_categories in share row exclusive mode;

do $$
begin
 if exists(select 1 from public.articles a where a.category_id is null
   and exists(select 1 from public.article_categories ac where ac.article_id=a.id)) then
  raise exception 'Some linked articles have no primary category. Choose their category explicitly before deploying this migration.';
 end if;
end $$;

create table if not exists internal.single_category_link_backup (
 article_id bigint not null,
 category_id bigint not null,
 created_at timestamptz,
 backed_up_at timestamptz not null default now(),
 primary key(article_id,category_id)
);
alter table internal.single_category_link_backup enable row level security;
revoke all on internal.single_category_link_backup from public,anon,authenticated;
insert into internal.single_category_link_backup(article_id,category_id,created_at)
select ac.article_id,ac.category_id,ac.created_at from public.article_categories ac
join public.articles a on a.id=ac.article_id where ac.category_id is distinct from a.category_id
on conflict do nothing;

do $$
declare article_record record;
begin
 for article_record in select id,category_id from public.articles where category_id is not null loop
  perform set_config('app.workspace_article',article_record.id::text,true);
  delete from public.article_categories where article_id=article_record.id and category_id<>article_record.category_id;
  insert into public.article_categories(article_id,category_id) values(article_record.id,article_record.category_id) on conflict do nothing;
 end loop;
 perform set_config('app.workspace_article','',true);
 if not exists(select 1 from pg_constraint where conrelid='public.article_categories'::regclass and conname='article_categories_one_category_per_article') then
  alter table public.article_categories add constraint article_categories_one_category_per_article unique(article_id);
 end if;
end $$;

-- Deferred checks let the existing workspace RPC change both representations
-- atomically. Direct API writes must leave them consistent too.
create or replace function public.assert_single_article_category(p_article_id bigint)
returns void language plpgsql security definer set search_path=public as $$
declare chosen bigint; linked bigint; link_count integer;
begin
 select category_id into chosen from public.articles where id=p_article_id for update;
 if not found then return; end if;
 select count(*),min(category_id) into link_count,linked from public.article_categories where article_id=p_article_id;
 if (chosen is null and link_count<>0) or (chosen is not null and (link_count<>1 or linked is distinct from chosen)) then
  raise exception 'An article must have one consistent category. Save through the article workspace.';
 end if;
end $$;
revoke all on function public.assert_single_article_category(bigint) from public,anon,authenticated;
create or replace function public.check_single_article_category()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if tg_table_name='articles' then
  perform public.assert_single_article_category(new.id);
 else
  if tg_op<>'INSERT' then perform public.assert_single_article_category(old.article_id); end if;
  if tg_op<>'DELETE' then perform public.assert_single_article_category(new.article_id); end if;
 end if;
 return null;
end $$;
revoke all on function public.check_single_article_category() from public,anon,authenticated;
drop trigger if exists check_single_category_article on public.articles;
create constraint trigger check_single_category_article after insert or update on public.articles
 deferrable initially deferred for each row execute function public.check_single_article_category();
drop trigger if exists check_single_category_link on public.article_categories;
create constraint trigger check_single_category_link after insert or update or delete on public.article_categories
 deferrable initially deferred for each row execute function public.check_single_article_category();

create or replace function public.save_my_article_workspace(
 p_article_id bigint,p_title text,p_content text,p_category_ids bigint[],p_tag_ids bigint[],p_publish boolean default false,p_receipt_id uuid default null
) returns bigint language plpgsql security definer set search_path = public as $$
declare article_id_value bigint; owner uuid; existing_status text; current_receipt public.article_credibility_receipts%rowtype;
begin
 if auth.uid() is null then raise exception 'Sign in to save articles'; end if;
 if coalesce(cardinality(p_category_ids),0) > 1 then raise exception 'Choose only one category for this article'; end if;
 if exists(select 1 from unnest(p_category_ids) id where id is null or id <= 0) then raise exception 'Invalid article category'; end if;
 if nullif(btrim(p_title),'') is null or nullif(btrim(p_content),'') is null then raise exception 'Title and content are required'; end if;
 if p_article_id is not null then
  select author_id,status into owner,existing_status from public.articles where id = p_article_id for update;
  if not found or owner is distinct from auth.uid() then raise exception 'Article unavailable or not owned by you'; end if;
  if existing_status = 'published' and not p_publish then raise exception 'Published changes require a new review'; end if;
 end if;
 if p_publish then
  if coalesce(cardinality(p_category_ids),0) <> 1 then raise exception 'Select a category before publishing'; end if;
  select * into current_receipt from public.article_credibility_receipts where id = p_receipt_id for update;
  if not found or current_receipt.user_id <> auth.uid() or current_receipt.score < 80 or current_receipt.critical_issue
   or current_receipt.used_at is not null or current_receipt.expires_at <= now()
   or current_receipt.snapshot <> public.article_review_snapshot(p_title,p_content,p_category_ids,p_tag_ids)
  then raise exception 'The review is missing, expired, or does not match this article. Run the check again.'; end if;
 end if;
 if p_article_id is null then
  insert into public.articles(title,content,category_id,author_id,status)
  values(btrim(p_title),btrim(p_content),p_category_ids[1],auth.uid(),'draft') returning id into article_id_value;
 else article_id_value := p_article_id;
 end if;
 perform set_config('app.workspace_article',article_id_value::text,true);
 delete from public.article_categories where article_id = article_id_value;
 insert into public.article_categories(article_id,category_id)
 select article_id_value,id from (select distinct unnest(p_category_ids) id) c;
 delete from public.article_tags where article_id = article_id_value;
 insert into public.article_tags(article_id,tag_id)
 select article_id_value,id from (select distinct unnest(p_tag_ids) id) t;
 update public.articles set title=btrim(p_title),content=btrim(p_content),category_id=p_category_ids[1],
 status=case when p_publish then 'published' else 'draft' end,
 published_at=case when p_publish then coalesce(published_at,now()) else null end
 where id=article_id_value;
 -- The publication trigger consumes a receipt when content/status changes.
 -- For a no-op re-save, still consume the explicitly supplied receipt.
 if p_publish then update public.article_credibility_receipts set used_at=coalesce(used_at,now()) where id=p_receipt_id; end if;
 perform set_config('app.workspace_article','',true);
 return article_id_value;
end;
$$;
revoke all on function public.save_my_article_workspace(bigint,text,text,bigint[],bigint[],boolean,uuid) from public,anon;
grant execute on function public.save_my_article_workspace(bigint,text,text,bigint[],bigint[],boolean,uuid) to authenticated;

-- AI category suggestions are a Premium feature. Limit optional model
-- requests independently of any writing-assistant plan.
create table if not exists internal.category_suggestion_usage (
 user_id uuid not null references auth.users(id) on delete cascade,
 window_start timestamptz not null,
 request_count integer not null check(request_count between 1 and 20),
 primary key(user_id,window_start)
);
alter table internal.category_suggestion_usage enable row level security;
revoke all on internal.category_suggestion_usage from public,anon,authenticated;
create or replace function public.claim_category_suggestion_request()
returns boolean language plpgsql security definer set search_path=public as $$
declare allowed boolean;
begin
 if auth.uid() is null then raise exception 'Sign in to check article categories'; end if;
 if not public.is_premium_subscriber() then
  raise exception 'Category suggestions are a Premium feature. Upgrade to use AI category suggestions.';
 end if;
 insert into internal.category_suggestion_usage(user_id,window_start,request_count)
 values(auth.uid(),date_trunc('hour',now()),1)
 on conflict(user_id,window_start) do update set request_count=internal.category_suggestion_usage.request_count+1
 where internal.category_suggestion_usage.request_count<20 returning true into allowed;
 return coalesce(allowed,false);
end $$;
revoke all on function public.claim_category_suggestion_request() from public,anon;
grant execute on function public.claim_category_suggestion_request() to authenticated;
commit;
