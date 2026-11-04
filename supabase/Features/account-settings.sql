-- Additive account settings. Profile names and their Auth display-only mirror
-- are changed in one transaction. Identity, email, role and plan are untouched.
begin;
create or replace function public.update_my_display_name(p_display_name text)
returns text language plpgsql security definer set search_path=pg_catalog,public as $$
declare viewer uuid:=auth.uid(); name_value text;
begin
 if viewer is null then raise exception 'Sign in to update your display name'; end if;
 name_value:=regexp_replace(p_display_name,'^[[:space:]]+|[[:space:]]+$','','g');
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

-- Expose only the display name for a published article, never a profile/email
-- list. This keeps article bylines readable without widening profiles RLS.
create or replace function public.get_published_article_author(p_article_id bigint)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in to read article authors'; end if;
 select jsonb_build_object('display_name',p.display_name) into result
 from public.articles a join public.profiles p on p.id=a.author_id
 where a.id=p_article_id and a.status='published';
 return result;
end;
$$;
revoke all on function public.get_published_article_author(bigint) from public,anon;
grant execute on function public.get_published_article_author(bigint) to authenticated;
commit;
