-- Apply after account-settings.sql. Existing names are never silently renamed.
-- A conflicting/invalid legacy name aborts the entire migration for review.
begin;
lock table public.profiles in share row exclusive mode;

-- Match JavaScript String.trim(), including non-breaking/Unicode spaces.
create or replace function public.normalise_display_name(p_name text)
returns text language sql immutable strict parallel safe
set search_path = pg_catalog as $$
 select btrim(p_name, E' \t\n\r\f' || chr(11) || U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
$$;

do $$
begin
 if exists (select 1 from public.profiles
   where char_length(public.normalise_display_name(display_name)) not between 1 and 60
      or public.normalise_display_name(display_name) ~ '[[:cntrl:]]') then
  raise exception 'Resolve invalid existing display names before applying unique-display-names.sql';
 end if;
 if exists (select 1 from public.profiles
   group by lower(public.normalise_display_name(display_name)) having count(*) > 1) then
  raise exception 'Resolve duplicate existing display names before applying unique-display-names.sql';
 end if;
end $$;

-- The unique index arbitrates concurrent registrations/renames, including
-- direct table writes. No RLS policies, roles or subscription rules change.
create unique index if not exists profiles_display_name_normalised_key
 on public.profiles (lower(public.normalise_display_name(display_name)));

create or replace function public.validate_profile_display_name()
returns trigger language plpgsql set search_path = pg_catalog, public as $$
begin
 new.display_name := public.normalise_display_name(new.display_name);
 if new.display_name is null or char_length(new.display_name) not between 1 and 60
    or new.display_name ~ '[[:cntrl:]]' then
  raise exception 'Enter a display name of 1–60 characters, without line breaks' using errcode='22023';
 end if;
 return new;
end $$;
drop trigger if exists validate_profile_display_name on public.profiles;
create trigger validate_profile_display_name
 before insert or update of display_name on public.profiles
 for each row execute function public.validate_profile_display_name();

-- Only a boolean is exposed, not IDs, emails or profile rows. Exclude the
-- signed-in account so saving its own spelling/capitalisation remains valid.
create or replace function public.is_display_name_available(p_display_name text)
returns boolean language sql stable security definer
set search_path = pg_catalog, public as $$
 select char_length(public.normalise_display_name(p_display_name)) between 1 and 60
   and not (public.normalise_display_name(p_display_name) ~ '[[:cntrl:]]')
   and not exists (
    select 1 from public.profiles
    where lower(public.normalise_display_name(display_name)) = lower(public.normalise_display_name(p_display_name))
      and id is distinct from auth.uid()
   );
$$;
revoke all on function public.is_display_name_available(text) from public;
grant execute on function public.is_display_name_available(text) to anon, authenticated;

-- Keep the existing atomic profile/Auth display mirror update, while using
-- exactly the same normalisation as registration and direct profile writes.
create or replace function public.update_my_display_name(p_display_name text)
returns text language plpgsql security definer set search_path=pg_catalog,public as $$
declare viewer uuid:=auth.uid(); name_value text;
begin
 if viewer is null then raise exception 'Sign in to update your display name'; end if;
 name_value:=public.normalise_display_name(p_display_name);
 if name_value is null or char_length(name_value) not between 1 and 60 or name_value ~ '[[:cntrl:]]' then
  raise exception 'Enter a display name of 1–60 characters, without line breaks';
 end if;
 update public.profiles set display_name=name_value where id=viewer;
 if not found then raise exception 'Your account profile is unavailable'; end if;
 update auth.users set raw_user_meta_data=jsonb_set(coalesce(raw_user_meta_data,'{}'::jsonb),'{display_name}',to_jsonb(name_value),true)
 where id=viewer;
 if not found then raise exception 'Your account is unavailable'; end if;
 return name_value;
end;
$$;
revoke all on function public.update_my_display_name(text) from public,anon;
grant execute on function public.update_my_display_name(text) to authenticated;
commit;
