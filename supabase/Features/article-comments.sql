-- Additive article comments. Deploy after profiles, articles and is_system_admin().
-- Plain text, authenticated readers/authors, owner/admin deletion. Comments
-- never grant access to drafts, profile emails or other private account fields.
begin;
create table if not exists public.article_comments (
 id bigint generated always as identity primary key,
 article_id bigint not null references public.articles(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 body text not null check(char_length(btrim(body)) between 1 and 1000),
 client_request_id uuid not null,
 created_at timestamptz not null default clock_timestamp(),
 unique(user_id,client_request_id)
);
create index if not exists article_comments_article_page on public.article_comments(article_id,id desc);
create index if not exists article_comments_user_time on public.article_comments(user_id,created_at desc);
alter table public.article_comments enable row level security;
revoke all on public.article_comments from public,anon,authenticated;
-- Writes go through the checked RPCs; RLS also protects direct reads.
grant select on public.article_comments to authenticated;
drop policy if exists "Read published article comments" on public.article_comments;
create policy "Read published article comments" on public.article_comments for select to authenticated
 using(exists(select 1 from public.articles a where a.id=article_id and a.status='published'));
drop policy if exists "Create own article comments" on public.article_comments;
create policy "Create own article comments" on public.article_comments for insert to authenticated
 with check(user_id=(select auth.uid()) and exists(select 1 from public.articles a where a.id=article_id and a.status='published'));
drop policy if exists "Delete own or moderate comments" on public.article_comments;
create policy "Delete own or moderate comments" on public.article_comments for delete to authenticated
 using(user_id=(select auth.uid()) or public.is_system_admin());

create or replace function public.get_article_comments(p_article_id bigint,p_before_id bigint default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare result jsonb; viewer uuid:=auth.uid(); moderator boolean;
begin
 if viewer is null then raise exception 'Sign in to read comments'; end if;
 if p_before_id is not null and p_before_id<=0 then raise exception 'Invalid comment page'; end if;
 if not exists(select 1 from public.articles where id=p_article_id and status='published') then raise exception 'Published article unavailable'; end if;
 moderator:=public.is_system_admin();
 with page as (
  select c.id,c.body,c.created_at,coalesce(p.display_name,'User') as author_name,
   (c.user_id=viewer or moderator) as can_delete
  from public.article_comments c left join public.profiles p on p.id=c.user_id
  where c.article_id=p_article_id and (p_before_id is null or c.id<p_before_id)
  order by c.id desc limit 21
 ), visible as (select * from page order by id desc limit 20)
 select jsonb_build_object('comments',coalesce((select jsonb_agg(to_jsonb(v) order by v.id desc) from visible v),'[]'::jsonb),
 'next_cursor',case when (select count(*) from page)>20 then (select min(id) from visible) else null end) into result;
 return result;
end;
$$;

create or replace function public.create_article_comment(p_article_id bigint,p_body text,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare viewer uuid:=auth.uid(); saved public.article_comments%rowtype; content text:=regexp_replace(p_body,'^[[:space:]]+|[[:space:]]+$','','g');
begin
 if viewer is null then raise exception 'Sign in to post a comment'; end if;
 if content is null or char_length(content) not between 1 and 1000 then raise exception 'Write a comment of 1 to 1000 characters'; end if;
 if p_request_id is null then raise exception 'A comment request ID is required'; end if;
 -- Serialize this account's writes for rate limiting and safe network retries.
 perform pg_advisory_xact_lock(hashtextextended('article-comments:'||viewer::text,0));
 -- Lock the article while checking publication, preventing a race with unpublishing.
 perform 1 from public.articles where id=p_article_id and status='published' for share;
 if not found then raise exception 'Published article unavailable'; end if;
 select * into saved from public.article_comments where user_id=viewer and client_request_id=p_request_id;
 if found then
  if saved.article_id<>p_article_id or saved.body<>content then raise exception 'This request ID was already used for a different comment'; end if;
 else
  if (select count(*) from public.article_comments where user_id=viewer and created_at>clock_timestamp()-interval '1 minute')>=20 then
   raise exception 'Too many comments. Please wait a minute and try again';
  end if;
  insert into public.article_comments(article_id,user_id,body,client_request_id)
   values(p_article_id,viewer,content,p_request_id) returning * into saved;
 end if;
 return jsonb_build_object('id',saved.id,'body',saved.body,'created_at',saved.created_at,
  'author_name',coalesce((select display_name from public.profiles where id=viewer),'User'),'can_delete',true);
end;
$$;

create or replace function public.delete_article_comment(p_comment_id bigint)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if auth.uid() is null then raise exception 'Sign in to delete a comment'; end if;
 delete from public.article_comments where id=p_comment_id and (user_id=auth.uid() or public.is_system_admin());
 if not found then raise exception 'Comment unavailable or you do not have permission to delete it'; end if;
end;
$$;
revoke all on function public.get_article_comments(bigint,bigint) from public,anon;
revoke all on function public.create_article_comment(bigint,text,uuid) from public,anon;
revoke all on function public.delete_article_comment(bigint) from public,anon;
grant execute on function public.get_article_comments(bigint,bigint) to authenticated;
grant execute on function public.create_article_comment(bigint,text,uuid) to authenticated;
grant execute on function public.delete_article_comment(bigint) to authenticated;
commit;
