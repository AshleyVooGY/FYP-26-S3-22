-- Deploy after author-tag-creation-fix.sql and article-required-category-review.sql.
-- Authors may create/reuse tags; existing admin-only rename/delete policies stay intact.
-- No existing article tags are removed. Older articles with >5 tags must be reduced
-- when their tag links are next changed; unrelated article/counter updates still work.
begin;
create or replace function public.get_or_create_tag(p_name text)
returns table(id bigint, name text)
language plpgsql security definer set search_path = public as $$
declare
  v_name text := btrim(p_name);
  v_id bigint;
begin
  if auth.uid() is null then raise exception 'Sign in to create tags'; end if;
  if v_name is null or v_name = '' or length(v_name) > 100 then
    raise exception 'Tag must be between 1 and 100 characters';
  end if;
  -- Serialize equal names without changing existing tag IDs or article links.
  perform pg_advisory_xact_lock(hashtextextended(lower(v_name), 0));
  select t.id into v_id from public.tags t
    where lower(btrim(t.name)) = lower(v_name) order by t.id limit 1;
  if v_id is null then
    insert into public.tags(name) values(v_name) on conflict do nothing returning tags.id into v_id;
    if v_id is null then
      select t.id into v_id from public.tags t where lower(btrim(t.name)) = lower(v_name) order by t.id limit 1;
    end if;
  end if;
  return query select t.id,t.name from public.tags t where t.id = v_id;
end;
$$;
revoke all on function public.get_or_create_tag(text) from public, anon;
grant execute on function public.get_or_create_tag(text) to authenticated;

-- Lock the parent before adding links so concurrent requests cannot exceed 5.
create or replace function public.lock_article_tag_changes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.articles where id = new.article_id for update;
  return new;
end;
$$;
revoke all on function public.lock_article_tag_changes() from public, anon, authenticated;
drop trigger if exists lock_article_tag_changes on public.article_tags;
create trigger lock_article_tag_changes before insert or update on public.article_tags
for each row execute function public.lock_article_tag_changes();

-- Check the final transaction state, allowing atomic delete/reinsert during saves.
create or replace function public.enforce_article_tag_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.article_tags where article_id = new.article_id) > 5 then
    raise exception 'Choose up to 5 tags for this article.';
  end if;
  return null;
end;
$$;
revoke all on function public.enforce_article_tag_limit() from public, anon, authenticated;
drop trigger if exists enforce_article_tag_limit on public.article_tags;
create constraint trigger enforce_article_tag_limit after insert or update on public.article_tags
deferrable initially deferred for each row execute function public.enforce_article_tag_limit();
commit;
