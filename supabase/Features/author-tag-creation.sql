-- Deploy AFTER feature-01-news-categorisation-tagging.sql.
--
-- Tag creation is System Admin only via RLS (see "System Admin can create
-- tags" in feature-01-news-categorisation-tagging.sql) — appropriate for
-- the category/tag picker itself, but it meant the AI "Suggest tags" tool
-- in the article editor could only ever suggest tags that already existed,
-- with no way to create a genuinely new one.
--
-- get_or_create_tag() lets any signed-in Registered User resolve a tag
-- name to its id, creating the tag the first time it's used. It is the
-- same "let any author tag their own article" trust level as
-- save_my_article_workspace() already applies to article_tags — tags
-- themselves are a low-stakes, shared taxonomy, not admin-curated content.
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
  if v_name = '' or length(v_name) > 100 then
    raise exception 'Tag must be between 1 and 100 characters';
  end if;

  select t.id into v_id from public.tags t where lower(t.name) = lower(v_name);

  if v_id is null then
    insert into public.tags(name) values (v_name)
    on conflict (lower(name)) do nothing
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
