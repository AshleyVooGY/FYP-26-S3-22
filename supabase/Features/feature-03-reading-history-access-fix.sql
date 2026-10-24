-- Additive repair: preserve the existing Feature 3 script.
begin;
alter table public.article_views enable row level security;
-- Browser clients must not insert, modify, truncate or inspect others' view logs.
-- All view recording stays behind record_article_view().
revoke all on public.article_views from anon, authenticated;
grant select on public.article_views to authenticated;
drop policy if exists "Users can read own article views" on public.article_views;
create policy "Users can read own article views" on public.article_views
for select to authenticated
using (viewer_identifier = 'user:' || (select auth.uid())::text);

create or replace function public.get_reading_history()
returns table(article_id bigint, title text, viewed_at timestamptz)
language sql stable security invoker set search_path = public as $$
 select a.id, a.title, max(av.viewed_at) as viewed_at
 from public.article_views av
 join public.articles a on a.id = av.article_id
 where av.viewer_identifier = 'user:' || (select auth.uid())::text
   and a.status = 'published'
 group by a.id,a.title
 order by max(av.viewed_at) desc,a.id desc;
$$;
revoke all on function public.get_reading_history() from public,anon;
grant execute on function public.get_reading_history() to authenticated;

create or replace function public.record_article_view(p_article_id bigint,p_guest_session_id uuid default null)
returns table(view_counted boolean,updated_view_count integer)
language plpgsql security definer set search_path = public as $$
declare viewer text; inserted integer;
begin
 if not exists(select 1 from public.articles where id=p_article_id and status='published') then
  raise exception 'Published article not found';
 end if;
 if auth.uid() is not null then viewer := 'user:' || auth.uid()::text;
 elsif p_guest_session_id is not null then viewer := 'guest:' || p_guest_session_id::text;
 else raise exception 'A guest session ID is required'; end if;
 insert into public.article_views(article_id,viewer_identifier)
 values(p_article_id,viewer) on conflict do nothing;
 get diagnostics inserted = row_count;
 if inserted=1 then
  update public.articles set view_count=view_count+1 where id=p_article_id;
 else
  update public.article_views set viewed_at=clock_timestamp()
  where article_id=p_article_id and viewer_identifier=viewer and viewed_on=current_date;
 end if;
 return query select inserted=1,a.view_count from public.articles a where a.id=p_article_id;
end;
$$;
revoke all on function public.record_article_view(bigint,uuid) from public;
grant execute on function public.record_article_view(bigint,uuid) to anon,authenticated;
commit;
