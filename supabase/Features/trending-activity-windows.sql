-- Deploy AFTER article-activity-statistics.sql and Feature 5.
-- Future view timestamps remain immutable even when History updates viewed_at.
-- Historical rows only retained viewed_at (last seen), so that is the best
-- available backfill; exact earlier event times cannot be reconstructed.
begin;
set local lock_timeout = '10s';
alter table public.article_views add column if not exists counted_at timestamptz;
update public.article_views set counted_at=viewed_at where counted_at is null;
alter table public.article_views alter column counted_at set default clock_timestamp();
alter table public.article_views alter column counted_at set not null;
alter table public.reactions add column if not exists reacted_at timestamptz;
update public.reactions set reacted_at=coalesce(created_at,now()) where reacted_at is null;
alter table public.reactions alter column reacted_at set default clock_timestamp();
alter table public.reactions alter column reacted_at set not null;
create or replace function public.stamp_article_activity_time()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
 if tg_table_name='article_views' then
  if tg_op='INSERT' then new.counted_at:=clock_timestamp(); else new.counted_at:=old.counted_at; end if;
 else
  if tg_op='INSERT' or new.reaction_type is distinct from old.reaction_type or new.article_id is distinct from old.article_id
   or new.user_id is distinct from old.user_id then new.reacted_at:=clock_timestamp();
  else new.reacted_at:=old.reacted_at; end if;
 end if;
 return new;
end;
$$;
revoke all on function public.stamp_article_activity_time() from public,anon,authenticated;
drop trigger if exists stamp_view_activity_time on public.article_views;
create trigger stamp_view_activity_time before insert or update on public.article_views
 for each row execute function public.stamp_article_activity_time();
drop trigger if exists stamp_reaction_activity_time on public.reactions;
create trigger stamp_reaction_activity_time before insert or update on public.reactions
 for each row execute function public.stamp_article_activity_time();
create index if not exists article_views_counted_at_article on public.article_views(counted_at,article_id);
create index if not exists reactions_reacted_at_article on public.reactions(reacted_at,article_id);

-- Return lifetime card counts plus a period-specific ranking score. Active
-- reactions are counted once per user/article, weighted twice a valid view.
create or replace function public.get_trending_articles_by_window(p_window text default '24h',result_limit integer default 10)
returns table(id bigint,title text,category text,featured_image_url text,view_count integer,reaction_count integer,published_at timestamptz,popularity_score bigint)
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare since_at timestamptz;
begin
 if p_window not in ('24h','7d','30d') or p_window is null then raise exception 'Invalid trending window'; end if;
 since_at:=now()-case p_window when '24h' then interval '24 hours' when '7d' then interval '7 days' else interval '30 days' end;
 return query with recent_views as (
  select v.article_id,count(*) as total from public.article_views v where v.counted_at>=since_at and v.counted_at<=now() group by v.article_id
 ), recent_reactions as (
  select r.article_id,count(*) as total from public.reactions r where r.reacted_at>=since_at and r.reacted_at<=now() group by r.article_id
 )
 select a.id,a.title,c.name,a.featured_image_url,a.view_count,a.reaction_count,a.published_at,
  coalesce(v.total,0)+2*coalesce(r.total,0)
 from public.articles a left join public.categories c on c.id=a.category_id
 left join recent_views v on v.article_id=a.id left join recent_reactions r on r.article_id=a.id
 where a.status='published' and coalesce(v.total,0)+2*coalesce(r.total,0)>0
 order by coalesce(v.total,0)+2*coalesce(r.total,0) desc,a.published_at desc nulls last,a.id desc
 limit least(greatest(coalesce(result_limit,10),1),50);
end;
$$;
revoke all on function public.get_trending_articles_by_window(text,integer) from public;
grant execute on function public.get_trending_articles_by_window(text,integer) to anon,authenticated;
-- Legacy callers (including the public landing page) share Trending Now.
-- Preserve the existing function signature, integer score and permissions.
create or replace function public.get_trending_articles(result_limit integer default 10)
returns table(id bigint,title text,category text,featured_image_url text,view_count integer,reaction_count integer,published_at timestamptz,popularity_score integer)
language sql stable security invoker set search_path=public as $$
 select t.id,t.title,t.category,t.featured_image_url,t.view_count,t.reaction_count,t.published_at,
 least(t.popularity_score,2147483647)::integer
 from public.get_trending_articles_by_window('24h',result_limit) t;
$$;
commit;
