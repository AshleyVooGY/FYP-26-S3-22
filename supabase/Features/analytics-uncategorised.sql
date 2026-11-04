-- Fix Feature 6 analytics coverage for published articles without a category.
-- Apply after feature-06-news-analytics.sql. Safe to re-run.
-- Replaces only reporting functions; does not change articles or counters.
-- Uncategorised has a NULL category_id and is not an additional real category.
begin;

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
  if not coalesce(public.is_system_admin(), false) then
    raise exception 'Access restricted to System Admins';
  end if;

  return query
  select
    a.id,
    a.title,
    coalesce(c.name, 'Uncategorised'),
    c.id,
    a.published_at,
    a.view_count,
    a.reaction_count
  from public.articles a
  left join public.categories c
    on c.id = a.category_id
  where a.status = 'published'
  order by
    case when p_sort = 'views_desc' then a.view_count end desc,
    case when p_sort = 'views_asc' then a.view_count end asc,
    case when p_sort = 'recent' then a.published_at end desc,
    case when p_sort = 'oldest' then a.published_at end asc,
    a.published_at desc,
    a.id desc
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
  if not coalesce(public.is_system_admin(), false) then
    raise exception 'Access restricted to System Admins';
  end if;

  return query
  select
    a.id,
    a.title,
    coalesce(c.name, 'Uncategorised'),
    a.published_at,
    a.view_count,
    a.reaction_count,
    count(*) filter (where av.viewer_identifier like 'user:%'),
    count(*) filter (where av.viewer_identifier like 'guest:%')
  from public.articles a
  left join public.categories c
    on c.id = a.category_id
  left join public.article_views av
    on av.article_id = a.id
  where a.id = p_article_id
    and a.status = 'published'
  group by a.id, a.title, c.name, a.published_at, a.view_count, a.reaction_count;
end;
$$;

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
  if not coalesce(public.is_system_admin(), false) then
    raise exception 'Access restricted to System Admins';
  end if;

  return query
  select ranked.*
  from (
    -- Keep real categories, including those without published articles.
    select
      c.id as category_id,
      c.name as category_name,
      count(a.id) as article_count,
      coalesce(sum(a.view_count), 0) as total_views,
      coalesce(sum(a.reaction_count), 0) as total_reactions,
      coalesce(round(avg(a.view_count), 1), 0) as avg_views
    from public.categories c
    left join public.articles a
      on a.category_id = c.id
      and a.status = 'published'
    group by c.id, c.name

    union all

    -- A display-only group, not a new classification or a data rewrite.
    -- Include it only when at least one published article lacks a category.
    select
      null::bigint,
      'Uncategorised'::text,
      count(a.id),
      coalesce(sum(a.view_count), 0),
      coalesce(sum(a.reaction_count), 0),
      coalesce(round(avg(a.view_count), 1), 0)
    from public.articles a
    left join public.categories c on c.id = a.category_id
    where a.status = 'published' and c.id is null
    having count(a.id) > 0
  ) ranked
  order by ranked.total_views desc, ranked.category_name, ranked.category_id nulls last;
end;
$$;

revoke all on function public.get_article_view_stats(text, integer) from public, anon;
revoke all on function public.get_article_analytics_summary(bigint) from public, anon;
revoke all on function public.get_category_popularity() from public, anon;
grant execute on function public.get_article_view_stats(text, integer) to authenticated;
grant execute on function public.get_article_analytics_summary(bigint) to authenticated;
grant execute on function public.get_category_popularity() to authenticated;

commit;
