-- Deploy before frontend admin-tag-management-20261105.
-- Repair admin tag writes without granting direct table writes to users.
-- Existing tags, article links and get_or_create_tag(text) are unchanged.
begin;

create or replace function public.admin_manage_tag(
  p_action text,
  p_tag_id bigint default null,
  p_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(p_name);
  v_tag public.tags%rowtype;
begin
  if auth.uid() is null or not coalesce(public.is_system_admin(), false) then
    raise exception 'System Admin access required' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('create', 'update', 'delete') then
    raise exception 'Invalid tag management action' using errcode = '22023';
  end if;
  if p_action <> 'create' and (p_tag_id is null or p_tag_id <= 0) then
    raise exception 'A valid tag ID is required' using errcode = '22023';
  end if;
  if p_action in ('create', 'update') then
    if v_name is null or v_name = '' or char_length(v_name) > 100
       or v_name ~ '[[:cntrl:]]' then
      raise exception 'Tag must be between 1 and 100 characters, without line breaks'
        using errcode = '22023';
    end if;
    -- Same lock as author tag creation, so equal names cannot race.
    perform pg_advisory_xact_lock(hashtextextended(lower(v_name), 0));
    if exists (
      select 1 from public.tags t
      where lower(btrim(t.name)) = lower(v_name)
        and (p_action = 'create' or t.id <> p_tag_id)
    ) then
      raise exception 'A tag with this name already exists' using errcode = '23505';
    end if;
  end if;

  if p_action = 'create' then
    insert into public.tags(name) values (v_name) returning * into v_tag;
  elsif p_action = 'update' then
    update public.tags set name = v_name where id = p_tag_id returning * into v_tag;
  else
    delete from public.tags where id = p_tag_id returning * into v_tag;
  end if;
  if v_tag.id is null then
    raise exception 'Tag no longer exists. Refresh the list and try again.'
      using errcode = 'P0002';
  end if;
  return jsonb_build_object('id', v_tag.id, 'name', v_tag.name);
end;
$$;

revoke all on function public.admin_manage_tag(text, bigint, text) from public, anon;
grant execute on function public.admin_manage_tag(text, bigint, text) to authenticated;

commit;
