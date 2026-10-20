-- Requires feature-07-user-preferences.sql, existing article/category/tag
-- tables, and subscription-tiers.sql (is_premium_subscriber()).
-- Additive migration: existing scripts and saved category preferences stay intact.
begin;
create table if not exists public.user_tag_preferences (
 user_id uuid not null references auth.users(id) on delete cascade,
 tag_id bigint not null references public.tags(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(user_id,tag_id)
);
alter table public.user_tag_preferences enable row level security;
drop policy if exists "Read own tag preferences" on public.user_tag_preferences;
create policy "Read own tag preferences" on public.user_tag_preferences for select to authenticated using(auth.uid()=user_id);
drop policy if exists "Insert own tag preferences" on public.user_tag_preferences;
create policy "Insert own tag preferences" on public.user_tag_preferences for insert to authenticated with check(auth.uid()=user_id);
drop policy if exists "Delete own tag preferences" on public.user_tag_preferences;
create policy "Delete own tag preferences" on public.user_tag_preferences for delete to authenticated using(auth.uid()=user_id);
revoke all on public.user_tag_preferences from public,anon,authenticated;
grant select,insert,delete on public.user_tag_preferences to authenticated;

create table if not exists public.user_feed_settings (
 user_id uuid primary key references auth.users(id) on delete cascade,
 use_activity boolean not null default true
);
alter table public.user_feed_settings enable row level security;
drop policy if exists "Own feed settings" on public.user_feed_settings;
create policy "Own feed settings" on public.user_feed_settings for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
revoke all on public.user_feed_settings from public,anon,authenticated;
grant select,insert,update on public.user_feed_settings to authenticated;
-- Private, short-lived ordering snapshots keep pagination stable as activity changes.
create table if not exists public.news_feed_sessions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 preference_version text not null,
 article_ids bigint[] not null,
 feed_type text not null check(feed_type in('personalized','discover'))
);
alter table public.news_feed_sessions enable row level security;
drop policy if exists "Own feed sessions" on public.news_feed_sessions;
create policy "Own feed sessions" on public.news_feed_sessions for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
revoke all on public.news_feed_sessions from public,anon,authenticated;
grant select,insert,delete on public.news_feed_sessions to authenticated;
create index if not exists news_feed_sessions_owner_created on public.news_feed_sessions(user_id,created_at);

create or replace function public.set_my_news_preferences(p_category_ids bigint[],p_tag_ids bigint[],p_use_activity boolean default true)
returns void language plpgsql security definer set search_path=public as $$
declare viewer uuid:=auth.uid();
begin
 if viewer is null then raise exception 'Sign in to save preferences' using errcode='42501'; end if;
 if p_use_activity is null then raise exception 'Invalid activity setting'; end if;
 if p_category_ids is null or p_tag_ids is null or cardinality(p_category_ids)>200 or cardinality(p_tag_ids)>200
  or array_position(p_category_ids,null) is not null or array_position(p_tag_ids,null) is not null
 then raise exception 'Invalid preference selection' using errcode='22023'; end if;
 -- Serialize replacements for this account, including concurrent browser tabs.
 perform pg_advisory_xact_lock(hashtextextended(viewer::text,0));
 delete from public.user_preferences where user_id=viewer;
 insert into public.user_preferences(user_id,category_id) select viewer,id from (select distinct unnest(p_category_ids) id) c;
 delete from public.user_tag_preferences where user_id=viewer;
 insert into public.user_tag_preferences(user_id,tag_id) select viewer,id from (select distinct unnest(p_tag_ids) id) t;
 insert into public.user_feed_settings(user_id,use_activity) values(viewer,p_use_activity)
 on conflict(user_id) do update set use_activity=excluded.use_activity;
 -- A bad foreign key rolls back BOTH replacements, retaining all old preferences.
end $$;
revoke all on function public.set_my_news_preferences(bigint[],bigint[],boolean) from public,anon;
grant execute on function public.set_my_news_preferences(bigint[],bigint[],boolean) to authenticated;

create or replace function public.get_my_news_feed(p_cursor jsonb default null,p_limit integer default 24)
returns jsonb language plpgsql volatile security invoker set search_path=public as $$
declare
 viewer uuid:=auth.uid(); version text; page_size integer:=greatest(1,least(coalesce(p_limit,24),24));
 activity boolean; saved boolean; session public.news_feed_sessions%rowtype; last_position bigint:=0; ordered_ids bigint[];
 personalized boolean; result jsonb;
begin
 if viewer is null then raise exception 'Sign in to view For You' using errcode='42501'; end if;
 if not public.is_premium_subscriber() then
  raise exception 'The For You feed is a Premium feature. Upgrade your plan to see personalized recommendations.';
 end if;
 if p_cursor='null'::jsonb then p_cursor:=null; end if;
 select coalesce((select use_activity from public.user_feed_settings where user_id=viewer),true) into activity;
 select exists(select 1 from public.user_preferences where user_id=viewer) or exists(select 1 from public.user_tag_preferences where user_id=viewer) into saved;
 select md5(viewer::text||':'||activity::text||':'||
 coalesce((select string_agg(category_id::text,',' order by category_id) from public.user_preferences where user_id=viewer),'')||':'||
 coalesce((select string_agg(tag_id::text,',' order by tag_id) from public.user_tag_preferences where user_id=viewer),'')) into version;
 if p_cursor is not null then
  if jsonb_typeof(p_cursor)<>'object' then raise exception 'Invalid feed cursor' using errcode='22023'; end if;
  last_position:=(p_cursor->>'position')::bigint;
  select * into session from public.news_feed_sessions where id=(p_cursor->>'session')::uuid and user_id=viewer;
  if not found or session.created_at<now()-interval '30 minutes' then raise exception 'Your feed has expired. Refresh recommendations.' using errcode='22023'; end if;
  if session.preference_version<>version then raise exception 'Preferences changed. Refresh recommendations.' using errcode='22023'; end if;
  if last_position is null or last_position<0 or last_position>cardinality(session.article_ids) then raise exception 'Invalid feed position'; end if;
 else
  delete from public.news_feed_sessions where user_id=viewer and created_at<now()-interval '30 minutes';
  with signals as (
   -- One weak signal per distinct recently viewed article; repeat clicks cannot amplify it.
   select article_id,0.25::numeric as weight from public.article_views
    where activity and viewer_identifier='user:'||viewer::text and viewed_at>=now()-interval '7 days' group by article_id
   union all
   select article_id,3::numeric from public.bookmarks where activity and user_id=viewer and created_at>=now()-interval '30 days'
   union all
   select article_id,2::numeric from public.reactions where activity and user_id=viewer
    and created_at>=now()-interval '30 days' and reaction_type in('like','love')
  ), category_affinity as (
   select a.category_id,least(4,sum(s.weight)) as weight from signals s join public.articles a on a.id=s.article_id
    where a.status='published' and a.category_id is not null group by a.category_id
  ), tag_affinity as (
   select atg.tag_id,least(3,sum(s.weight)) as weight from signals s join public.articles a on a.id=s.article_id
    join public.article_tags atg on atg.article_id=a.id where a.status='published' group by atg.tag_id
  ), scored as (
   select a.id,a.category_id,a.published_at,coalesce(a.view_count,0) as views,
    (case when exists(select 1 from public.user_preferences where user_id=viewer and category_id=a.category_id) then 8 else 0 end)+
    (case when exists(select 1 from public.article_tags atg join public.user_tag_preferences utp on utp.tag_id=atg.tag_id
      where utp.user_id=viewer and atg.article_id=a.id) then 7 else 0 end)+
    coalesce((select weight from category_affinity ca where ca.category_id=a.category_id),0)+
    coalesce((select max(ta.weight) from public.article_tags atg join tag_affinity ta on ta.tag_id=atg.tag_id where atg.article_id=a.id),0) as score
   from public.articles a where a.status='published'
    -- Avoid immediately recommending an article the reader just opened.
    and not exists(select 1 from public.article_views av where activity and av.viewer_identifier='user:'||viewer::text and av.article_id=a.id and av.viewed_at>=now()-interval '24 hours')
  ), diverse as (
   select *,row_number() over(partition by category_id,(score>0) order by score desc,published_at desc nulls last,id desc) as category_position from scored
  ), pools as (
   select *,row_number() over(partition by (score>0) order by
    case when score>0 then (category_position-1)/2 else 0 end,score desc,published_at desc nulls last,views desc,id desc) as pool_position from diverse
  ), interleaved as (
   -- Four interest-based slots followed by one discovery slot when both pools exist.
   select *,case when score>0 then pool_position+(pool_position-1)/4 else pool_position*5 end as feed_position from pools
  ), candidates as (
   select * from interleaved order by feed_position,score desc,published_at desc nulls last,id desc limit 1000
  )
  select coalesce(array_agg(id order by feed_position,score desc,published_at desc nulls last,id desc),'{}'::bigint[]),coalesce(bool_or(score>0),false)
   into ordered_ids,personalized from candidates;
  insert into public.news_feed_sessions(user_id,preference_version,article_ids,feed_type)
   values(viewer,version,ordered_ids,case when personalized then 'personalized' else 'discover' end) returning * into session;
 end if;
 with page as (
  select a.id,a.title,left(a.content,180) as excerpt,a.featured_image_url,a.published_at,a.view_count,a.reaction_count,c.name as category_name,ids.pos
  from unnest(session.article_ids) with ordinality as ids(id,pos)
  join public.articles a on a.id=ids.id and a.status='published' left join public.categories c on c.id=a.category_id
  where ids.pos>last_position order by ids.pos limit page_size+1
 ), numbered as (select *,row_number() over(order by pos) as n from page)
 select jsonb_build_object('has_preferences',saved,'feed_type',session.feed_type,
  'articles',coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'content',excerpt,'featured_image_url',featured_image_url,
    'published_at',published_at,'view_count',view_count,'reaction_count',reaction_count,'category_name',category_name) order by n) from numbered where n<=page_size),'[]'::jsonb),
  'next_cursor',case when (select count(*) from page)>page_size then
   (select jsonb_build_object('session',session.id,'position',pos) from numbered where n=page_size) else null end
 ) into result;
 return result;
end $$;
revoke all on function public.get_my_news_feed(jsonb,integer) from public,anon;
grant execute on function public.get_my_news_feed(jsonb,integer) to authenticated;
commit;
