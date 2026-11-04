-- Deploy AFTER author-tag-creation.sql.
-- Fix ambiguous name resolution: RETURNS TABLE defines an output variable
-- named name, which conflicts with lower(name) in the conflict target.
-- The existing unique index still prevents case-insensitive duplicates.
-- Preserve the authenticated-only interface and return the existing tag
-- when another request has already created it. No article data is changed.
begin;

create or replace function public.get_or_create_tag(p_name text)
returns table(id bigint, name text)
language plpgsql security definer set search_path = public as $$
declare
  v_name text := btrim(p_name);
  v_id bigint;
begin
  if auth.uid() is null then
    raise exception 'Sign in to create tags';
  end if;
  if v_name is null or v_name = '' or length(v_name) > 100 then
    raise exception 'Tag must be between 1 and 100 characters';
  end if;

  select t.id into v_id from public.tags t where lower(t.name) = lower(v_name);

  if v_id is null then
    insert into public.tags(name) values (v_name)
    on conflict do nothing
    returning tags.id into v_id;
    -- A concurrent request may have created the same tag first.
    if v_id is null then
      select t.id into v_id from public.tags t where lower(t.name) = lower(v_name);
    end if;
  end if;

  return query select t.id, t.name from public.tags t where t.id = v_id;
end;
$$;
revoke all on function public.get_or_create_tag(text) from public, anon;
grant execute on function public.get_or_create_tag(text) to authenticated;

commit;
