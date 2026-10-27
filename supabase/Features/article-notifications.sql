-- Deploy AFTER article-comments.sql and Feature 4 reactions.
-- New interactions only. Existing reactions/comments are not backfilled.
-- Bookmarks remain private and do not produce notifications.
begin;
create table if not exists public.article_notifications (
 id bigint generated always as identity primary key,
 recipient_id uuid not null references public.profiles(id) on delete cascade,
 actor_id uuid not null references public.profiles(id) on delete cascade,
 article_id bigint not null references public.articles(id) on delete cascade,
 kind text not null check(kind in ('reaction','comment')),
 reaction_type text,
 comment_id bigint references public.article_comments(id) on delete cascade,
 created_at timestamptz not null default clock_timestamp(),
 read_at timestamptz,
 check(recipient_id<>actor_id),
 check((kind='reaction' and reaction_type is not null and reaction_type in ('like','love','haha','wow','sad','angry') and comment_id is null)
    or (kind='comment' and reaction_type is null and comment_id is not null))
);
create unique index if not exists article_notification_reaction_once
 on public.article_notifications(recipient_id,actor_id,article_id) where kind='reaction';
create unique index if not exists article_notification_comment_once
 on public.article_notifications(comment_id) where kind='comment';
create index if not exists article_notifications_recipient_page on public.article_notifications(recipient_id,id desc);
create index if not exists article_notifications_unread on public.article_notifications(recipient_id) where read_at is null;
alter table public.article_notifications enable row level security;
revoke all on public.article_notifications from public,anon,authenticated;
grant select on public.article_notifications to authenticated;
drop policy if exists "Read own published article notifications" on public.article_notifications;
create policy "Read own published article notifications" on public.article_notifications for select to authenticated
 using(recipient_id=(select auth.uid()) and exists(select 1 from public.articles a where a.id=article_id and a.status='published'));

create or replace function public.notify_article_interaction()
returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare recipient uuid; actor uuid; target bigint;
begin
 if tg_table_name='reactions' then
  if tg_op='DELETE' or (tg_op='UPDATE' and (old.article_id<>new.article_id or old.user_id<>new.user_id)) then
   delete from public.article_notifications where kind='reaction' and actor_id=old.user_id and article_id=old.article_id;
  end if;
  if tg_op='DELETE' then return old; end if;
  actor:=new.user_id; target:=new.article_id;
 else
  actor:=new.user_id; target:=new.article_id;
 end if;
 select a.author_id into recipient from public.articles a where a.id=target and a.status='published';
 -- Missing legacy author/profile must not break the underlying interaction.
 if recipient is null or recipient=actor or not exists(select 1 from public.profiles where id=actor) then return new; end if;
 if tg_table_name='reactions' then
  insert into public.article_notifications(recipient_id,actor_id,article_id,kind,reaction_type)
   values(recipient,actor,target,'reaction',new.reaction_type)
   on conflict (recipient_id,actor_id,article_id) where kind='reaction'
   do update set reaction_type=excluded.reaction_type;
  -- Changing the reaction updates the same record; it does not create another
  -- unread alert or reset an already-read notification.
 else
  insert into public.article_notifications(recipient_id,actor_id,article_id,kind,comment_id)
   values(recipient,actor,target,'comment',new.id)
   on conflict (comment_id) where kind='comment' do nothing;
 end if;
 return new;
end;
$$;
revoke all on function public.notify_article_interaction() from public,anon,authenticated;
drop trigger if exists notify_article_reaction on public.reactions;
create trigger notify_article_reaction after insert or update or delete on public.reactions
 for each row execute function public.notify_article_interaction();
drop trigger if exists notify_article_comment on public.article_comments;
create trigger notify_article_comment after insert on public.article_comments
 for each row execute function public.notify_article_interaction();
-- Deleted comments cascade their notifications. Removed reactions retract
-- theirs, preventing a link to an interaction that no longer exists.

create or replace function public.get_article_notification_count()
returns bigint language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare total bigint;
begin
 if auth.uid() is null then raise exception 'Sign in to view notifications'; end if;
 select count(*) into total from public.article_notifications n join public.articles a on a.id=n.article_id
 where n.recipient_id=auth.uid() and n.read_at is null and a.status='published';
 return total;
end;
$$;
create or replace function public.get_article_notifications(p_before_id bigint default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in to view notifications'; end if;
 if p_before_id is not null and p_before_id<=0 then raise exception 'Invalid notification page'; end if;
 with page as (
  select n.id,n.article_id,n.kind,n.reaction_type,n.created_at,n.read_at,
   coalesce(p.display_name,'A reader') as actor_name,a.title as article_title
  from public.article_notifications n join public.articles a on a.id=n.article_id
  left join public.profiles p on p.id=n.actor_id
  where n.recipient_id=auth.uid() and a.status='published' and (p_before_id is null or n.id<p_before_id)
  order by n.id desc limit 21
 ), visible as(select * from page order by id desc limit 20)
 select jsonb_build_object('notifications',coalesce((select jsonb_agg(to_jsonb(v) order by v.id desc) from visible v),'[]'::jsonb),
  'next_cursor',case when (select count(*) from page)>20 then (select min(id) from visible) else null end,
  'unread_count',public.get_article_notification_count()) into result;
 return result;
end;
$$;
create or replace function public.mark_article_notifications_read(p_ids bigint[] default null)
returns bigint language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if auth.uid() is null then raise exception 'Sign in to update notifications'; end if;
 if p_ids is not null and (cardinality(p_ids)>1000 or exists(select 1 from unnest(p_ids) x where x is null or x<=0)) then
  raise exception 'Invalid notification selection';
 end if;
 update public.article_notifications n set read_at=clock_timestamp()
 where n.recipient_id=auth.uid() and n.read_at is null and (p_ids is null or n.id=any(p_ids))
  and exists(select 1 from public.articles a where a.id=n.article_id and a.status='published');
 return public.get_article_notification_count();
end;
$$;
revoke all on function public.get_article_notification_count() from public,anon;
revoke all on function public.get_article_notifications(bigint) from public,anon;
revoke all on function public.mark_article_notifications_read(bigint[]) from public,anon;
grant execute on function public.get_article_notification_count() to authenticated;
grant execute on function public.get_article_notifications(bigint) to authenticated;
grant execute on function public.mark_article_notifications_read(bigint[]) to authenticated;
commit;
