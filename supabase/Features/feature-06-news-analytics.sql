-- Feature 6: News Analytics and View Tracking
--
-- Builds entirely on tables that already exist (articles,
-- categories, article_views) - no new tables are required.
-- Every function below is System Admin only, gated with the
-- is_system_admin() helper Feature 1 defined for RLS.


-- 1. Article view statistics
-- Powers the System Admin article list. Returns every published
-- article with its view/reaction counts; the admin list page does
-- its own client-side search/category filtering over this (it's a
-- small dataset - result_limit caps at 200), so sort is the only
-- filter handled server-side.

create or replace function public.get_article_view_stats(
  p_sort text default 'views_desc',
  result_limit integer default 50
)
returns table (
  id bigint,
  title text,
  category text,
  category_id bigint,
  published_at timestamptz,
  view_count integer,
  reaction_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_system_admin() then
    raise exception 'Access restricted to System Admins';
  end if;

  return query
  select
    a.id,
    a.title,
    c.name,
    c.id,
    a.published_at,
    a.view_count,
    a.reaction_count
  from public.articles a
  join public.categories c
    on c.id = a.category_id
  where a.status = 'published'
  order by
    case when p_sort = 'views_desc' then a.view_count end desc,
    case when p_sort = 'views_asc' then a.view_count end asc,
    case when p_sort = 'recent' then a.published_at end desc,
    case when p_sort = 'oldest' then a.published_at end asc,
    a.published_at desc
  limit least(greatest(result_limit, 1), 200);
end;
$$;


-- 2. Single-article analytics summary
-- Total views, reaction count, and a registered-vs-guest split
-- (derived from article_views.viewer_identifier, which Feature 5
-- already prefixes with "user:" or "guest:").

create or replace function public.get_article_analytics_summary(
  p_article_id bigint
)
returns table (
  id bigint,
  title text,
  category text,
  published_at timestamptz,
  view_count integer,
  reaction_count integer,
  registered_views bigint,
  guest_views bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_system_admin() then
    raise exception 'Access restricted to System Admins';
  end if;

  return query
  select
    a.id,
    a.title,
    c.name,
    a.published_at,
    a.view_count,
    a.reaction_count,
    count(*) filter (where av.viewer_identifier like 'user:%'),
    count(*) filter (where av.viewer_identifier like 'guest:%')
  from public.articles a
  join public.categories c
    on c.id = a.category_id
  left join public.article_views av
    on av.article_id = a.id
  where a.id = p_article_id
    and a.status = 'published'
  group by a.id, a.title, c.name, a.published_at, a.view_count, a.reaction_count;
end;
$$;


-- 3. Daily view trend for a single article
-- Zero-filled via generate_series so the chart has a continuous
-- date range even on days with no recorded views.

create or replace function public.get_article_view_trend(
  p_article_id bigint,
  p_days integer default 14
)
returns table (
  view_date date,
  view_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_system_admin() then
    raise exception 'Access restricted to System Admins';
  end if;

  return query
  select
    gs::date,
    count(av.article_id)
  from generate_series(
    (current_date - (least(greatest(p_days, 1), 90) - 1))::timestamp,
    current_date::timestamp,
    interval '1 day'
  ) as gs
  left join public.article_views av
    on av.article_id = p_article_id
    and av.viewed_on = gs::date
  group by gs::date
  order by gs::date;
end;
$$;


-- 4. Category popularity
-- Ranks every category by total views across its published
-- articles, for the System Admin category-performance screen.

create or replace function public.get_category_popularity()
returns table (
  category_id bigint,
  category_name text,
  article_count bigint,
  total_views bigint,
  total_reactions bigint,
  avg_views numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_system_admin() then
    raise exception 'Access restricted to System Admins';
  end if;

  return query
  select
    c.id,
    c.name,
    count(a.id),
    coalesce(sum(a.view_count), 0),
    coalesce(sum(a.reaction_count), 0),
    coalesce(round(avg(a.view_count), 1), 0)
  from public.categories c
  left join public.articles a
    on a.category_id = c.id
    and a.status = 'published'
  group by c.id, c.name
  order by coalesce(sum(a.view_count), 0) desc;
end;
$$;


-- 5. Analytics overview
-- Platform-wide summary numbers for the System Admin dashboard.
-- Deliberately does not duplicate the top-articles/top-categories
-- queries above - the dashboard calls get_article_view_stats() and
-- get_category_popularity() directly for those.

create or replace function public.get_analytics_overview()
returns table (
  total_views bigint,
  total_articles bigint,
  avg_views_per_article numeric,
  total_categories bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_system_admin() then
    raise exception 'Access restricted to System Admins';
  end if;

  return query
  select
    coalesce(sum(a.view_count), 0),
    count(a.id),
    coalesce(round(avg(a.view_count), 1), 0),
    (select count(*) from public.categories)
  from public.articles a
  where a.status = 'published';
end;
$$;


-- 6. Function permissions
-- Granted to authenticated (not anon) since Feature 6 is System
-- Admin only; each function still performs its own is_system_admin()
-- check internally, so a signed-in non-admin gets an exception
-- rather than data - the same convention Feature 1 uses for its
-- admin-only RLS policies.

revoke all on function public.get_article_view_stats(text, integer) from public;
revoke all on function public.get_article_analytics_summary(bigint) from public;
revoke all on function public.get_article_view_trend(bigint, integer) from public;
revoke all on function public.get_category_popularity() from public;
revoke all on function public.get_analytics_overview() from public;

grant execute on function public.get_article_view_stats(text, integer) to authenticated;
grant execute on function public.get_article_analytics_summary(bigint) to authenticated;
grant execute on function public.get_article_view_trend(bigint, integer) to authenticated;
grant execute on function public.get_category_popularity() to authenticated;
grant execute on function public.get_analytics_overview() to authenticated;
