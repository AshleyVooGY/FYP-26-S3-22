-- Feature 8: Article Media Management
-- Supports image uploads for news articles (System Admin only).


-- 1. Storage bucket for article images

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'article-images',
  'article-images',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;


-- 2. Storage object policies
-- Uses the is_system_admin() helper Feature 1 defined for RLS.

drop policy if exists "Anyone can view article images" on storage.objects;
create policy "Anyone can view article images"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'article-images');

drop policy if exists "System Admin can upload article images" on storage.objects;
create policy "System Admin can upload article images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'article-images'
  and public.is_system_admin()
);

drop policy if exists "System Admin can replace article images" on storage.objects;
create policy "System Admin can replace article images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'article-images'
  and public.is_system_admin()
)
with check (
  bucket_id = 'article-images'
  and public.is_system_admin()
);

drop policy if exists "System Admin can delete article images" on storage.objects;
create policy "System Admin can delete article images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'article-images'
  and public.is_system_admin()
);


-- 3. Article policies needed to attach an uploaded image to an article
-- Additive to the existing "Anyone can view published articles" policy.

drop policy if exists "System Admin can view all articles" on public.articles;
create policy "System Admin can view all articles"
on public.articles
for select
to authenticated
using (public.is_system_admin());

drop policy if exists "System Admin can update articles" on public.articles;
create policy "System Admin can update articles"
on public.articles
for update
to authenticated
using (public.is_system_admin())
with check (public.is_system_admin());
