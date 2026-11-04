-- Deploy after feature-08-article-media-management.sql and article-required-category-review.sql.
-- Existing published articles are left online. Their next content/publication
-- save must include an image. Counter-only updates continue to work.
begin;
create or replace function public.enforce_article_featured_image()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'published' and nullif(btrim(new.featured_image_url), '') is null then
    raise exception 'A featured image is required to publish or update a published article. Upload or replace the image first.';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_article_featured_image() from public, anon, authenticated;
drop trigger if exists enforce_article_featured_image on public.articles;
create trigger enforce_article_featured_image
before insert or update of status, title, content, category_id, published_at, featured_image_url
on public.articles
for each row execute function public.enforce_article_featured_image();
-- Restrictive policy adds protection without granting any new Storage access.
-- Replaced files can still be cleaned up once the article references the new URL.
drop policy if exists "Keep published featured image files" on storage.objects;
create policy "Keep published featured image files"
on storage.objects as restrictive for delete to authenticated
using (
  bucket_id <> 'article-images'
  or not exists (
    select 1 from public.articles a
    where a.status = 'published'
      and right(a.featured_image_url, length('/object/public/article-images/' || storage.objects.name))
        = '/object/public/article-images/' || storage.objects.name
  )
);
commit;
