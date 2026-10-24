-- Deploy after article-single-category-and-ai-suggestions.sql and the publishing receipt migration.
-- Required category validation is available to all authenticated users.
-- Existing articles are retained; only new publication/content changes are gated.
begin;
create table public.article_category_reviews (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 article_id bigint references public.articles(id) on delete cascade,
 snapshot jsonb not null,
 suggested_category_id bigint references public.categories(id) on delete set null,
 ai_reason text not null check(length(ai_reason) between 1 and 1000),
 status text not null check(status in ('ai_passed','needs_review','pending','approved','rejected','superseded')),
 author_reason text check(length(author_reason) between 20 and 2000),
 reviewed_by uuid references public.profiles(id) on delete set null,
 review_note text check(length(review_note) between 1 and 2000),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '7 days',
 reviewed_at timestamptz
);
alter table public.article_category_reviews enable row level security;
create policy "Own or admin category reviews" on public.article_category_reviews for select to authenticated
 using(user_id=auth.uid() or public.is_system_admin());
revoke all on public.article_category_reviews from public,anon,authenticated;
grant select on public.article_category_reviews to authenticated;
create index article_category_review_owner_snapshot on public.article_category_reviews(user_id,created_at);
create index article_category_review_pending on public.article_category_reviews(created_at,id) where status='pending';
alter table public.article_credibility_receipts add column category_review_id uuid references public.article_category_reviews(id) on delete set null;

-- The model runs once for credibility and category; only the trusted Edge Function may issue this receipt.
create function public.issue_article_publish_review(
 p_user_id uuid,p_title text,p_content text,p_category_ids bigint[],p_tag_ids bigint[],
 p_score numeric,p_critical_issue boolean,p_suggested_category_id bigint,p_category_reason text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare snap jsonb; category_review public.article_category_reviews%rowtype; receipt uuid; expiry timestamptz;
begin
 if coalesce(cardinality(p_category_ids),0)<>1 or p_category_ids[1] is null or p_score is null or p_score<0 or p_score>100
 or p_critical_issue is null or nullif(btrim(p_title),'') is null or nullif(btrim(p_content),'') is null
 then raise exception 'Invalid publishing assessment'; end if;
 snap:=public.article_review_snapshot(p_title,p_content,p_category_ids,p_tag_ids);
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||snap::text,0));
 select * into category_review from public.article_category_reviews
 where user_id=p_user_id and snapshot=snap and status='approved' and expires_at>now()
 order by reviewed_at desc limit 1 for update;
 if not found then
  if p_suggested_category_id=p_category_ids[1] then
   update public.article_category_reviews set status='superseded' where user_id=p_user_id and snapshot=snap and status='pending';
   insert into public.article_category_reviews(user_id,snapshot,suggested_category_id,ai_reason,status)
   values(p_user_id,snap,p_suggested_category_id,btrim(p_category_reason),'ai_passed') returning * into category_review;
  else
   select * into category_review from public.article_category_reviews where user_id=p_user_id and snapshot=snap
    and status='pending' and expires_at>now() order by created_at desc limit 1 for update;
   if not found then
    insert into public.article_category_reviews(user_id,snapshot,suggested_category_id,ai_reason,status)
    values(p_user_id,snap,p_suggested_category_id,btrim(p_category_reason),'needs_review') returning * into category_review;
   end if;
  end if;
 end if;
 insert into public.article_credibility_receipts(user_id,snapshot,score,critical_issue,category_review_id)
 values(p_user_id,snap,p_score,p_critical_issue,category_review.id) returning id,expires_at into receipt,expiry;
 return jsonb_build_object('receipt_id',receipt,'expires_at',expiry,'category_review',jsonb_build_object(
  'id',category_review.id,'status',category_review.status,'suggested_category_id',category_review.suggested_category_id,
  'reason',category_review.ai_reason,'review_note',category_review.review_note,'expires_at',category_review.expires_at));
end $$;
revoke all on function public.issue_article_publish_review(uuid,text,text,bigint[],bigint[],numeric,boolean,bigint,text) from public,anon,authenticated;
grant execute on function public.issue_article_publish_review(uuid,text,text,bigint[],bigint[],numeric,boolean,bigint,text) to service_role;

create function public.request_article_category_review(p_review_id uuid,p_reason text,p_article_id bigint)
returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then raise exception 'Sign in to request a review' using errcode='42501'; end if;
 if length(btrim(p_reason)) not between 20 and 2000 or p_reason is null then raise exception 'Explain your category choice in 20 to 2000 characters'; end if;
 if not exists(select 1 from public.articles where id=p_article_id and author_id=auth.uid()) then raise exception 'Save your own draft before requesting a category review'; end if;
 update public.article_category_reviews set author_reason=btrim(p_reason),status='pending',article_id=p_article_id
 where id=p_review_id and user_id=auth.uid() and status='needs_review' and expires_at>now();
 if not found then raise exception 'This category result changed or expired. Run the publishing check again.'; end if;
end $$;
revoke all on function public.request_article_category_review(uuid,text,bigint) from public,anon;
grant execute on function public.request_article_category_review(uuid,text,bigint) to authenticated;

create function public.decide_article_category_review(p_review_id uuid,p_approve boolean,p_note text)
returns void language plpgsql security definer set search_path=public as $$
declare target public.article_category_reviews%rowtype;
begin
 if auth.uid() is null or not public.is_system_admin() then raise exception 'System Admin access required' using errcode='42501'; end if;
 if p_approve is null or nullif(btrim(p_note),'') is null or length(btrim(p_note))>2000 then raise exception 'Add a review note (up to 2000 characters)'; end if;
 select * into target from public.article_category_reviews where id=p_review_id for update;
 if not found or target.status<>'pending' or target.expires_at<=now() then raise exception 'This review is no longer pending. Refresh the list.'; end if;
 if target.user_id=auth.uid() then raise exception 'Another administrator must review your own category request'; end if;
 update public.article_category_reviews set status=case when p_approve then 'approved' else 'rejected' end,
 reviewed_by=auth.uid(),review_note=btrim(p_note),reviewed_at=now(),expires_at=now()+interval '7 days' where id=target.id;
end $$;
revoke all on function public.decide_article_category_review(uuid,boolean,text) from public,anon;
grant execute on function public.decide_article_category_review(uuid,boolean,text) to authenticated;

-- Publication guard applies to direct API writes as well as the workspace RPC.
create function public.assert_category_publish_review(p_receipt_id uuid,p_user_id uuid,p_snapshot jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from public.article_credibility_receipts receipt join public.article_category_reviews review on review.id=receipt.category_review_id
 where receipt.id=p_receipt_id and receipt.user_id=p_user_id and review.user_id=p_user_id
 and receipt.snapshot=p_snapshot and review.snapshot=p_snapshot and receipt.used_at is null and receipt.expires_at>now()
 and review.expires_at>now() and review.status in ('ai_passed','approved')) then
  raise exception 'A current category check or administrator approval is required. Run Check before publishing.';
 end if;
end $$;
revoke all on function public.assert_category_publish_review(uuid,uuid,jsonb) from public,anon,authenticated;
create function public.enforce_article_category_publish_review()
returns trigger language plpgsql security definer set search_path=public as $$
declare category_ids bigint[]; tag_ids bigint[]; receipt uuid; snap jsonb;
begin
 if new.status<>'published' then return new; end if;
 if tg_op='UPDATE' and old.status='published' and new.title is not distinct from old.title and new.content is not distinct from old.content
 and new.category_id is not distinct from old.category_id and new.author_id is not distinct from old.author_id
 and new.published_at is not distinct from old.published_at
 and coalesce(current_setting('app.workspace_article',true),'')<>new.id::text then return new; end if;
 select array_agg(category_id order by category_id) into category_ids from public.article_categories where article_id=new.id;
 select array_agg(tag_id order by tag_id) into tag_ids from public.article_tags where article_id=new.id;
 snap:=public.article_review_snapshot(new.title,new.content,category_ids,tag_ids);
 select id into receipt from public.article_credibility_receipts where user_id=auth.uid() and user_id=new.author_id
 and snapshot=snap and used_at is null and expires_at>now() and category_review_id is not null order by expires_at desc limit 1;
 perform public.assert_category_publish_review(receipt,new.author_id,snap);
 return new;
end $$;
revoke all on function public.enforce_article_category_publish_review() from public,anon,authenticated;
create trigger enforce_category_before_publish before insert or update on public.articles
 for each row execute function public.enforce_article_category_publish_review();

-- Published tags/category links must be saved through the reviewed workspace, including for admins.
create or replace function public.guard_published_classification_change()
returns trigger language plpgsql security definer set search_path=public as $$
declare target bigint; targets bigint[];
begin
 if tg_op='INSERT' then targets:=array[new.article_id];
 elsif tg_op='DELETE' then targets:=array[old.article_id];
 else targets:=array[old.article_id,new.article_id]; end if;
 foreach target in array targets loop
  if exists(select 1 from public.articles where id=target and status='published')
   and coalesce(current_setting('app.workspace_article',true),'')<>target::text then
   raise exception 'Use Check before publishing and the reviewed workspace to change published classifications';
  end if;
 end loop;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
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
  perform public.assert_category_publish_review(p_receipt_id,auth.uid(),public.article_review_snapshot(p_title,p_content,p_category_ids,p_tag_ids));
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


-- All users share a bounded quota for the required combined check; no Premium gate.
create table internal.publish_review_usage (
 user_id uuid not null references auth.users(id) on delete cascade,
 window_start timestamptz not null,request_count integer not null check(request_count between 1 and 20),
 primary key(user_id,window_start)
);
alter table internal.publish_review_usage enable row level security;
revoke all on internal.publish_review_usage from public,anon,authenticated;
create function public.claim_publish_review_request()
returns boolean language plpgsql security definer set search_path=public as $$
declare allowed boolean;
begin
 if auth.uid() is null then raise exception 'Sign in to check articles' using errcode='42501'; end if;
 insert into internal.publish_review_usage values(auth.uid(),date_trunc('hour',now()),1)
 on conflict(user_id,window_start) do update set request_count=internal.publish_review_usage.request_count+1
 where internal.publish_review_usage.request_count<20 returning true into allowed;
 return coalesce(allowed,false);
end $$;
revoke all on function public.claim_publish_review_request() from public,anon;
grant execute on function public.claim_publish_review_request() to authenticated;
create function public.get_article_category_review_queue(p_after uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare cursor_time timestamptz; result jsonb;
begin
 if auth.uid() is null or not public.is_system_admin() then raise exception 'System Admin access required' using errcode='42501'; end if;
 if p_after is not null then
  select created_at into cursor_time from public.article_category_reviews where id=p_after;
  if not found then raise exception 'Review cursor expired. Refresh the queue.'; end if;
 end if;
 with page as (
  select review.*,p.display_name as author_name,row_number() over(order by review.created_at,review.id) as n
  from public.article_category_reviews review join public.profiles p on p.id=review.user_id
  where status='pending' and expires_at>now() and (p_after is null or (review.created_at,review.id)>(cursor_time,p_after))
  order by review.created_at,review.id limit 25
 ) select jsonb_build_object('reviews',coalesce((select jsonb_agg(to_jsonb(page)-'n' order by n) from page where n<=24),'[]'::jsonb),
 'next_cursor',case when (select count(*) from page)>24 then (select id from page where n=24) else null end) into result;
 return result;
end $$;
revoke all on function public.get_article_category_review_queue(uuid) from public,anon;
grant execute on function public.get_article_category_review_queue(uuid) to authenticated;
commit;
