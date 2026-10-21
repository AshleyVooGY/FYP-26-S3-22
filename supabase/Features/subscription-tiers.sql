-- Deploy AFTER feature-01-news-categorisation-tagging.sql (is_system_admin()).
--
-- Free / Premium subscription tiers.
--
-- subscription_tier is chosen once, at signup (handle_new_user in auth.sql
-- reads the plan the client asked for out of raw_user_meta_data). From then
-- on the source of truth lives in public.profiles, and a user may change it
-- only in one direction, on their own account: a self-service upgrade from
-- 'free' to 'premium' (the "Upgrade to Premium" sidebar button does a plain
-- client-side update to their own profiles row — guard_profile_tier_change()
-- below is what actually allows that one direction and blocks every other
-- change). A System Admin may still set any account to any tier through
-- set_user_subscription_tier(). There is deliberately no self-service
-- downgrade; that stays an admin action, same as profiles.role.
--
-- app_metadata.subscription_tier on auth.users is kept as a read-only mirror
-- of the same value purely so existing display code (the Free/Premium plan
-- badge in article-editor.js) keeps working without an extra round trip.
-- It is never the source of truth and nothing gates access on it.
begin;

alter table public.profiles
  add column if not exists subscription_tier text not null default 'free'
    check (subscription_tier in ('free', 'premium'));

-- Mirrors is_system_admin(): a reusable helper for RLS policies, RPCs and
-- Edge Functions, so none of them need to re-derive this check.
create or replace function public.is_premium_subscriber()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and subscription_tier = 'premium'
  );
$$;

-- Ordinary users may edit their display name, and may upgrade their own
-- account from free to premium, but nothing else about their tier.
create or replace function public.guard_profile_tier_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.subscription_tier is distinct from old.subscription_tier and auth.uid() is not null then
    if public.is_system_admin() then
      null; -- admins may set any tier on any account
    elsif auth.uid() = old.id and old.subscription_tier = 'free' and new.subscription_tier = 'premium' then
      null; -- self-service upgrade: free -> premium, on your own account only
    else
      raise exception 'Only System Admins can change subscription tiers';
    end if;
    -- Keep the display-only app_metadata mirror in sync however the
    -- change happened (admin RPC or self-service upgrade alike).
    update auth.users
    set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('subscription_tier', new.subscription_tier)
    where id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists guard_profile_tier_change on public.profiles;
create trigger guard_profile_tier_change
before update on public.profiles
for each row execute function public.guard_profile_tier_change();

create or replace function public.set_user_subscription_tier(p_user_id uuid, p_tier text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_system_admin() then
    raise exception 'System Admin access required';
  end if;
  if p_tier not in ('free', 'premium') or p_tier is null then
    raise exception 'Invalid subscription tier';
  end if;
  update public.profiles set subscription_tier = p_tier where id = p_user_id;
  if not found then
    raise exception 'User not found';
  end if;
  -- The app_metadata mirror is kept in sync by guard_profile_tier_change().
end;
$$;
revoke all on function public.set_user_subscription_tier(uuid, text) from public, anon;
grant execute on function public.set_user_subscription_tier(uuid, text) to authenticated;

commit;
