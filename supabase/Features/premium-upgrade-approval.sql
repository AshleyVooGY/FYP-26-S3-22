-- Apply AFTER subscription-tiers.sql and auth.sql. Existing plans are preserved.
begin;

create table if not exists public.premium_upgrade_requests (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default clock_timestamp(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null
);
alter table public.premium_upgrade_requests enable row level security;
revoke all on public.premium_upgrade_requests from public, anon, authenticated;
grant select on public.premium_upgrade_requests to authenticated;
drop policy if exists read_premium_requests on public.premium_upgrade_requests;
create policy read_premium_requests on public.premium_upgrade_requests for select to authenticated
using (user_id = auth.uid() or public.is_system_admin());

-- Enforce the same restriction for direct table writes, including inserts.
-- Trusted database/service operations without an end-user JWT remain possible.
create or replace function public.guard_profile_tier_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare changed boolean;
begin
  if tg_op = 'INSERT' then changed := new.subscription_tier <> 'free';
  else changed := new.subscription_tier is distinct from old.subscription_tier;
  end if;
  if changed and auth.uid() is not null and not public.is_system_admin() then
    raise exception 'Only System Admins can change subscription tiers' using errcode='42501';
  end if;
  if changed then
    update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('subscription_tier', new.subscription_tier) where id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists guard_profile_tier_change on public.profiles;
create trigger guard_profile_tier_change before insert or update on public.profiles
for each row execute function public.guard_profile_tier_change();

-- Both old and new registration clients now create Free accounts. Selecting
-- Premium records a request atomically, including email-confirmation signups.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, display_name, subscription_tier)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', 'User'), 'free');
  update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('subscription_tier', 'free') where id = new.id;
  if new.raw_user_meta_data ->> 'requested_tier' = 'premium' then
    insert into public.premium_upgrade_requests(user_id, status) values (new.id, 'pending');
  end if;
  return new;
end $$;

create or replace function public.get_my_premium_status()
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to view your plan' using errcode='42501'; end if;
  select jsonb_build_object('tier', p.subscription_tier, 'status', coalesce(r.status, 'none'),
    'requested_at', r.requested_at, 'reviewed_at', r.reviewed_at) into result
  from public.profiles p left join public.premium_upgrade_requests r on r.user_id=p.id where p.id=auth.uid();
  if result is null then raise exception 'Your account profile is unavailable'; end if;
  return result;
end $$;

create or replace function public.request_premium_upgrade()
returns jsonb language plpgsql security definer set search_path = public as $$
declare viewer uuid := auth.uid(); plan text;
begin
  if viewer is null then raise exception 'Sign in to request Premium' using errcode='42501'; end if;
  -- Every request/review locks the profile first, serialising concurrent clicks.
  select subscription_tier into plan from public.profiles where id=viewer for update;
  if not found then raise exception 'Your account profile is unavailable'; end if;
  if plan='premium' then return public.get_my_premium_status(); end if;
  insert into public.premium_upgrade_requests(user_id, status) values(viewer, 'pending')
  on conflict (user_id) do update set status='pending', requested_at=clock_timestamp(),
    reviewed_at=null, reviewed_by=null where premium_upgrade_requests.status <> 'pending';
  return public.get_my_premium_status();
end $$;

-- Existing admin plan controls remain available. Granting Premium also resolves
-- a pending request so it cannot be approved a second time from a stale screen.
create or replace function public.set_user_subscription_tier(p_user_id uuid, p_tier text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_system_admin() then
    raise exception 'System Admin access required' using errcode='42501';
  end if;
  if p_tier is null or p_tier not in ('free','premium') then raise exception 'Invalid subscription tier'; end if;
  update public.profiles set subscription_tier=p_tier where id=p_user_id;
  if not found then raise exception 'User not found'; end if;
  if p_tier='premium' then
    update public.premium_upgrade_requests set status='approved', reviewed_at=clock_timestamp(), reviewed_by=auth.uid()
    where user_id=p_user_id and status='pending';
  end if;
end $$;

create or replace function public.review_premium_upgrade(p_user_id uuid, p_approve boolean, p_requested_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare request public.premium_upgrade_requests; plan text;
begin
  if auth.uid() is null or not public.is_system_admin() then
    raise exception 'System Admin access required' using errcode='42501';
  end if;
  if p_approve is null then raise exception 'Choose approve or reject'; end if;
  select subscription_tier into plan from public.profiles where id=p_user_id for update;
  if not found then raise exception 'User not found'; end if;
  select * into request from public.premium_upgrade_requests where user_id=p_user_id for update;
  if not found or request.status <> 'pending' or request.requested_at is distinct from p_requested_at then
    raise exception 'This request has changed. Refresh the list before reviewing it.';
  end if;
  if p_approve then perform public.set_user_subscription_tier(p_user_id, 'premium');
  else
    update public.premium_upgrade_requests set status='rejected', reviewed_at=clock_timestamp(), reviewed_by=auth.uid()
    where user_id=p_user_id;
  end if;
end $$;

-- Full pending queue for admins; callers cannot inspect other users' requests.
create or replace function public.get_pending_premium_requests()
returns table(user_id uuid, display_name text, requested_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_system_admin() then
    raise exception 'System Admin access required' using errcode='42501';
  end if;
  return query select r.user_id, p.display_name, r.requested_at
  from public.premium_upgrade_requests r join public.profiles p on p.id=r.user_id
  where r.status='pending' order by r.requested_at, r.user_id;
end $$;

revoke all on function public.get_my_premium_status() from public, anon;
revoke all on function public.request_premium_upgrade() from public, anon;
revoke all on function public.review_premium_upgrade(uuid, boolean, timestamptz) from public, anon;
revoke all on function public.get_pending_premium_requests() from public, anon;
revoke all on function public.set_user_subscription_tier(uuid, text) from public, anon;
grant execute on function public.get_my_premium_status(), public.request_premium_upgrade(),
  public.review_premium_upgrade(uuid, boolean, timestamptz), public.get_pending_premium_requests(),
  public.set_user_subscription_tier(uuid, text) to authenticated;
notify pgrst, 'reload schema';
commit;
