-- Automatically create a profile when a new user registers
--
-- NOTE: this function now writes profiles.subscription_tier, so when
-- applying these migrations to an existing database, run
-- Features/subscription-tiers.sql (which adds that column) BEFORE
-- re-running this file.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- The client may only request a tier at the moment of signup, via
  -- user_metadata. Anything other than 'premium' is treated as 'free';
  -- after this one-time insert, user_metadata is never trusted again.
  requested_tier text := case
    when new.raw_user_meta_data ->> 'requested_tier' = 'premium' then 'premium'
    else 'free'
  end;
begin
  insert into public.profiles (
    id,
    display_name,
    subscription_tier
  )
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      'User'
    ),
    requested_tier
  );

  -- Read-only display mirror; see subscription-tiers.sql for why.
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('subscription_tier', requested_tier)
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created
on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();