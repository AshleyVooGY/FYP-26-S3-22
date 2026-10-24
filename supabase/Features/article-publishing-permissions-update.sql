-- Review and deploy after schema.sql, policies.sql and Features 01, 06, 08.
-- The credibility Edge Function must issue receipts using its service-role client.
begin;

-- Ordinary users may edit their display name, but not their role or identity.
-- Preserve existing clients, but enforce role changes independently of permissive RLS.
create or replace function public.guard_profile_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
 if new.id is distinct from old.id then raise exception 'Profile identity cannot be changed'; end if;
 if new.role is distinct from old.role and auth.uid() is not null then
  if not public.is_system_admin() then raise exception 'Only System Admins can change roles'; end if;
  if old.id = auth.uid() then raise exception 'You cannot change your own role'; end if;
 end if;
 return new;
end $$;
drop trigger if exists guard_profile_role_change on public.profiles;
create trigger guard_profile_role_change before update on public.profiles for each row execute function public.guard_profile_role_change();
create or replace function public.set_user_role(p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_system_admin() then raise exception 'System Admin access required'; end if;
  if p_user_id = auth.uid() then raise exception 'You cannot change your own role'; end if;
  if p_role not in ('system_admin','registered_user') or p_role is null then raise exception 'Invalid role'; end if;
  update public.profiles set role = p_role where id = p_user_id;
  if not found then raise exception 'User not found'; end if;
end;
$$;
revoke all on function public.set_user_role(uuid,text) from public, anon;
grant execute on function public.set_user_role(uuid,text) to authenticated;

-- Receipts contain a trusted server assessment of one exact article snapshot.
create table if not exists public.article_credibility_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  snapshot jsonb not null,
  score numeric not null check(score between 0 and 100),
  critical_issue boolean not null,
  expires_at timestamptz not null default now() + interval '30 minutes',
  used_at timestamptz
);
alter table public.article_credibility_receipts enable row level security;
revoke all on public.article_credibility_receipts from anon, authenticated;
create or replace function public.article_review_snapshot(p_title text,p_content text,p_category_ids bigint[],p_tag_ids bigint[])
returns jsonb language sql immutable set search_path = public as $$
select jsonb_build_object('title',btrim(p_title),'content',btrim(p_content),
 'primary_category_id',p_category_ids[1],
 'category_ids',coalesce((select jsonb_agg(id order by id) from (select distinct unnest(p_category_ids) id) c),'[]'::jsonb),
 'tag_ids',coalesce((select jsonb_agg(id order by id) from (select distinct unnest(p_tag_ids) id) t),'[]'::jsonb));
$$;
create or replace function public.issue_article_credibility_receipt(
 p_user_id uuid,p_title text,p_content text,p_category_ids bigint[],p_tag_ids bigint[],p_score numeric,p_critical_issue boolean
) returns uuid language plpgsql security definer set search_path = public as $$
declare receipt uuid;
begin
 insert into public.article_credibility_receipts(user_id,snapshot,score,critical_issue)
 values(p_user_id,public.article_review_snapshot(p_title,p_content,p_category_ids,p_tag_ids),p_score,p_critical_issue)
 returning id into receipt;
 return receipt;
end;
$$;
revoke all on function public.issue_article_credibility_receipt(uuid,text,text,bigint[],bigint[],numeric,boolean) from public,anon,authenticated;
grant execute on function public.issue_article_credibility_receipt(uuid,text,text,bigint[],bigint[],numeric,boolean) to service_role;

-- Direct API publication and published-content edits must also have a trusted review.
create or replace function public.enforce_article_credibility()
returns trigger language plpgsql security definer set search_path = public as $$
declare categories bigint[]; tags bigint[]; receipt uuid;
begin
 if new.status <> 'published' then return new; end if;
 if tg_op = 'UPDATE' then
   if old.status = 'published' and new.title is not distinct from old.title
    and new.content is not distinct from old.content and new.category_id is not distinct from old.category_id
    and new.author_id is not distinct from old.author_id and new.published_at is not distinct from old.published_at then return new; end if;
 end if;
 select array_agg(category_id order by (category_id = new.category_id) desc, category_id)
 into categories from public.article_categories where article_id = new.id;
 select array_agg(tag_id order by tag_id) into tags from public.article_tags where article_id = new.id;
 if new.category_id is null or not (new.category_id = any(coalesce(categories,'{}'::bigint[]))) then
  raise exception 'A linked primary category is required';
 end if;
 select id into receipt from public.article_credibility_receipts
 where user_id = auth.uid() and user_id = new.author_id and score >= 80 and critical_issue = false
 and used_at is null and expires_at > now()
 and snapshot = public.article_review_snapshot(new.title,new.content,categories,tags)
 order by expires_at desc limit 1 for update;
 if receipt is null then
  -- Backward compatibility for the currently deployed frontend and Edge Function.
  update internal.article_content_approvals set used_at=now()
  where user_id=new.author_id and content_hash=md5(new.title || chr(31) || new.content || chr(31) || coalesce(new.category_id::text,''))
  and score>=80 and used_at is null;
  if not found then raise exception 'A current server-verified credibility review is required'; end if;
  return new;
 end if;
 update public.article_credibility_receipts set used_at = now() where id = receipt;
 return new;
end;
$$;
-- Existing enforce_credibility_before_publish trigger now uses the updated function.

create or replace function public.save_my_article_workspace(
 p_article_id bigint,p_title text,p_content text,p_category_ids bigint[],p_tag_ids bigint[],p_publish boolean default false,p_receipt_id uuid default null
) returns bigint language plpgsql security definer set search_path = public as $$
declare article_id_value bigint; owner uuid; existing_status text; current_receipt public.article_credibility_receipts%rowtype;
begin
 if auth.uid() is null then raise exception 'Sign in to save articles'; end if;
 if nullif(btrim(p_title),'') is null or nullif(btrim(p_content),'') is null then raise exception 'Title and content are required'; end if;
 if p_article_id is not null then
  select author_id,status into owner,existing_status from public.articles where id = p_article_id for update;
  if not found or owner is distinct from auth.uid() then raise exception 'Article unavailable or not owned by you'; end if;
  if existing_status = 'published' and not p_publish then raise exception 'Published changes require a new review'; end if;
 end if;
 if p_publish then
  if coalesce(cardinality(p_category_ids),0) = 0 then raise exception 'Select a primary category'; end if;
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
insert into public.article_categories(article_id,category_id)
select id,category_id from public.articles where category_id is not null on conflict do nothing;
-- Keep legacy article writes available during rollout. Existing RLS and the
-- publication trigger continue to apply to direct API requests.
create or replace function public.guard_published_classification_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare target bigint;
begin
 target := case when tg_op='DELETE' then old.article_id else new.article_id end;
 if exists(select 1 from public.articles where id=target and status='published')
 and coalesce(current_setting('app.workspace_article',true),'') <> target::text
 and not public.is_system_admin() then
  raise exception 'Use the reviewed workspace save to change published article classifications';
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end $$;
drop trigger if exists guard_published_classification_change on public.article_categories;
create trigger guard_published_classification_change before insert or update or delete on public.article_categories
for each row execute function public.guard_published_classification_change();
drop trigger if exists guard_published_classification_change on public.article_tags;
create trigger guard_published_classification_change before insert or update or delete on public.article_tags
for each row execute function public.guard_published_classification_change();
-- Existing primary categories must be discoverable through the junction table.

-- Feature 2: News Search and Filtering

create or replace function public.search_news_articles(
    p_keyword text default null,
    p_category_id bigint default null,
    p_start_date date default null,
    p_end_date date default null,
    p_sort text default 'latest'
)
returns table (
    id bigint,
    title text,
    content text,
    featured_image_url text,
    published_at timestamptz,
    view_count integer,
    reaction_count integer
)
language sql
stable
security invoker
set search_path = public
as $$
    select
        a.id,
        a.title,
        a.content,
        a.featured_image_url,
        a.published_at,
        a.view_count,
        a.reaction_count

    from public.articles a

    where
        -- Only published articles appear in search
        a.status = 'published'

        -- Keyword search
        and (
            p_keyword is null
            or trim(p_keyword) = ''

            -- Search article title
            or a.title ilike '%' || trim(p_keyword) || '%'

            -- Search article content
            or a.content ilike '%' || trim(p_keyword) || '%'

            -- Primary category is retained for legacy articles.
            or exists (select 1 from public.categories c where c.id = a.category_id and c.name ilike '%' || trim(p_keyword) || '%')
            -- Search category names
            or exists (
                select 1
                from public.article_categories ac
                join public.categories c
                    on c.id = ac.category_id
                where ac.article_id = a.id
                  and c.name ilike '%' || trim(p_keyword) || '%'
            )

            -- Search tag names
            or exists (
                select 1
                from public.article_tags atg
                join public.tags t
                    on t.id = atg.tag_id
                where atg.article_id = a.id
                  and t.name ilike '%' || trim(p_keyword) || '%'
            )
        )

        -- Category filter
        and (
            p_category_id is null
            or a.category_id = p_category_id
            or exists (
                select 1
                from public.article_categories ac
                where ac.article_id = a.id
                  and ac.category_id = p_category_id
            )
        )

        -- Start date filter
        and (
            p_start_date is null
            or a.published_at >= p_start_date::timestamptz
        )

        -- End date filter
        and (
            p_end_date is null
            or a.published_at < (p_end_date + 1)::timestamptz
        )

    order by

        -- Latest first
        case
            when p_sort = 'latest'
            then a.published_at
        end desc nulls last,

        -- Oldest first
        case
            when p_sort = 'oldest'
            then a.published_at
        end asc nulls last,

        -- Most popular first
        case
            when p_sort = 'popularity'
            then a.view_count
        end desc nulls last,

        -- Default/fallback ordering
        a.published_at desc;
$$;


-- Allow Guests and Registered Users to use search
grant execute
on function public.search_news_articles(
    text,
    bigint,
    date,
    date,
    text
)
to anon, authenticated;
commit;
