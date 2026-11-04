-- Deploy after the reading-history access fix and Feature 4 reactions.
-- Back up the original counts before calibrating to retained event records.
-- One view = one retained article/viewer/day row. One reaction = one active
-- user/article reaction. The backup is private and contains no article body.
begin;
set local lock_timeout = '10s';
lock table public.article_views, public.reactions, public.articles in share row exclusive mode;
create schema if not exists internal;
create table if not exists internal.article_activity_count_backup (
  migration_key text not null,
  article_id bigint not null,
  view_count integer not null,
  reaction_count integer not null,
  recorded_views bigint not null,
  recorded_reactions bigint not null,
  backed_up_at timestamptz not null default now(),
  primary key (migration_key, article_id)
);
alter table internal.article_activity_count_backup enable row level security;
revoke all on internal.article_activity_count_backup from public, anon, authenticated;
insert into internal.article_activity_count_backup
(migration_key,article_id,view_count,reaction_count,recorded_views,recorded_reactions)
select 'activity-counts-20261027',a.id,a.view_count,a.reaction_count,
 (select count(*) from public.article_views v where v.article_id=a.id),
 (select count(*) from public.reactions r where r.article_id=a.id)
from public.articles a on conflict do nothing;

-- Re-running the migration preserves the first backup and is safe.
drop trigger if exists guard_derived_activity_counts on public.articles;
update public.articles a set
 view_count=(select count(*)::integer from public.article_views v where v.article_id=a.id),
 reaction_count=(select count(*)::integer from public.reactions r where r.article_id=a.id);

-- Atomic deltas serialize on the article row, avoiding lost concurrent
-- increments. Updating a reaction's type does not change the total.
create or replace function public.sync_article_activity_counts()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare old_id bigint; new_id bigint; target bigint; delta integer;
begin
 if tg_op <> 'INSERT' then old_id:=old.article_id; end if;
 if tg_op <> 'DELETE' then new_id:=new.article_id; end if;
 for target in select distinct x from unnest(array[old_id,new_id]) x where x is not null order by x loop
  delta:=(case when new_id=target then 1 else 0 end)-(case when old_id=target then 1 else 0 end);
  if delta=0 then continue; end if;
  if tg_table_name='article_views' then
   update public.articles set view_count=view_count+delta where id=target;
  else
   update public.articles set reaction_count=reaction_count+delta where id=target;
  end if;
 end loop;
 if tg_op='DELETE' then return old; end if;
 return new;
end;
$$;
revoke all on function public.sync_article_activity_counts() from public,anon,authenticated;
drop trigger if exists sync_view_activity_counts on public.article_views;
create trigger sync_view_activity_counts after insert or update or delete on public.article_views
 for each row execute function public.sync_article_activity_counts();
drop trigger if exists sync_reaction_activity_counts on public.reactions;
create trigger sync_reaction_activity_counts after insert or update or delete on public.reactions
 for each row execute function public.sync_article_activity_counts();

create or replace function public.guard_derived_activity_counts()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
 if tg_op='INSERT' then
  new.view_count:=0; new.reaction_count:=0;
 elsif (new.view_count is distinct from old.view_count or new.reaction_count is distinct from old.reaction_count)
  and pg_trigger_depth() < 2 then
  raise exception 'Article counts are derived from recorded activity and cannot be edited directly';
 end if;
 return new;
end;
$$;
revoke all on function public.guard_derived_activity_counts() from public,anon,authenticated;
create trigger guard_derived_activity_counts before insert or update on public.articles
 for each row execute function public.guard_derived_activity_counts();

-- The view trigger now increments counts. Do not also increment them here.
create or replace function public.record_article_view(p_article_id bigint,p_guest_session_id uuid default null)
returns table(view_counted boolean,updated_view_count integer)
language plpgsql security definer set search_path=public as $$
declare viewer text; inserted integer;
begin
 if not exists(select 1 from public.articles where id=p_article_id and status='published') then
  raise exception 'Published article not found';
 end if;
 if auth.uid() is not null then viewer:='user:'||auth.uid()::text;
 elsif p_guest_session_id is not null then viewer:='guest:'||p_guest_session_id::text;
 else raise exception 'A guest session ID is required'; end if;
 insert into public.article_views(article_id,viewer_identifier) values(p_article_id,viewer) on conflict do nothing;
 get diagnostics inserted=row_count;
 if inserted=0 then
  update public.article_views set viewed_at=clock_timestamp()
  where article_id=p_article_id and viewer_identifier=viewer and viewed_on=current_date;
 end if;
 return query select inserted=1,a.view_count from public.articles a where a.id=p_article_id;
end;
$$;
revoke all on function public.record_article_view(bigint,uuid) from public;
grant execute on function public.record_article_view(bigint,uuid) to anon,authenticated;
-- No RLS grants/policies are broadened. All existing readers consume the
-- same articles counters (cards, search, feed and admin analytics).
commit;
