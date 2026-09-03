-- Feature 5: Trending and Popular News


-- 1. Retrieve popular published articles across all dates

create or replace function public.get_popular_articles(
  result_limit integer default 10
)
returns table (
  id bigint,
  title text,
  category text,
  featured_image_url text,
  view_count integer,
  reaction_count integer,
  published_at timestamptz,
  popularity_score integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    a.id,
    a.title,
    c.name,
    a.featured_image_url,
    a.view_count,
    a.reaction_count,
    a.published_at,
    a.view_count + (a.reaction_count * 2)
  from public.articles a
  join public.categories c
    on c.id = a.category_id
  where a.status = 'published'
  order by
    a.view_count + (a.reaction_count * 2) desc,
    a.published_at desc
  limit least(greatest(result_limit, 1), 50);
$$;


-- 2. Retrieve trending articles from the past seven days

create or replace function public.get_trending_articles(
  result_limit integer default 10
)
returns table (
  id bigint,
  title text,
  category text,
  featured_image_url text,
  view_count integer,
  reaction_count integer,
  published_at timestamptz,
  popularity_score integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    a.id,
    a.title,
    c.name,
    a.featured_image_url,
    a.view_count,
    a.reaction_count,
    a.published_at,
    a.view_count + (a.reaction_count * 2)
  from public.articles a
  join public.categories c
    on c.id = a.category_id
  where a.status = 'published'
    and a.published_at >= now() - interval '7 days'
  order by
    a.view_count + (a.reaction_count * 2) desc,
    a.published_at desc
  limit least(greatest(result_limit, 1), 50);
$$;


-- 3. Record one view per viewer, per article, per day


create or replace function public.record_article_view(
  p_article_id bigint,
  p_guest_session_id uuid default null
)
returns table (
  view_counted boolean,
  updated_view_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer_identifier text;
  v_rows_inserted integer;
begin
  -- Reject missing, unpublished or draft articles
  if not exists (
    select 1
    from public.articles
    where id = p_article_id
      and status = 'published'
  ) then
    raise exception 'Published article not found';
  end if;

  -- Logged-in users are identified by their account ID
  if auth.uid() is not null then
    v_viewer_identifier := 'user:' || auth.uid()::text;

  -- Guests are identified by a persistent browser UUID
  elsif p_guest_session_id is not null then
    v_viewer_identifier := 'guest:' || p_guest_session_id::text;

  else
    raise exception 'A guest session ID is required';
  end if;

  -- Ignore another view from the same viewer on the same day
  insert into public.article_views (
    article_id,
    viewer_identifier
  )
  values (
    p_article_id,
    v_viewer_identifier
  )
  on conflict do nothing;

  get diagnostics v_rows_inserted = row_count;

  -- Increase the total only when a new view was accepted
  if v_rows_inserted = 1 then
    update public.articles
    set view_count = view_count + 1
    where id = p_article_id;
  end if;

  return query
  select
    v_rows_inserted = 1,
    articles.view_count
  from public.articles
  where articles.id = p_article_id;
end;
$$;



-- 4. Function permissions


revoke all on function public.record_article_view(bigint, uuid)
from public;

grant execute on function public.get_popular_articles(integer)
to anon, authenticated;

grant execute on function public.get_trending_articles(integer)
to anon, authenticated;

grant execute on function public.record_article_view(bigint, uuid)
to anon, authenticated;