-- Feature 8: Article Media and Draft Management
--
-- Lets a Registered User write, save as a private draft, publish, edit
-- and delete their own news articles, and upload a featured image to
-- support them. Drafts stay visible only to their creator; System Admin
-- is not part of this feature's scope (Feature 1/6 already cover admin
-- content oversight).


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
-- Uploaded paths are namespaced "<article id>/<filename>". A user may
-- write to a path only when they authored the article it belongs to.

drop policy if exists "Anyone can view article images" on storage.objects;
create policy "Anyone can view article images"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'article-images');

drop policy if exists "Authors can upload own article images" on storage.objects;
create policy "Authors can upload own article images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'article-images'
  and exists (
    select 1 from public.articles a
    where a.id::text = (storage.foldername(name))[1]
      and a.author_id = auth.uid()
  )
);

drop policy if exists "Authors can replace own article images" on storage.objects;
create policy "Authors can replace own article images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'article-images'
  and exists (
    select 1 from public.articles a
    where a.id::text = (storage.foldername(name))[1]
      and a.author_id = auth.uid()
  )
)
with check (
  bucket_id = 'article-images'
  and exists (
    select 1 from public.articles a
    where a.id::text = (storage.foldername(name))[1]
      and a.author_id = auth.uid()
  )
);

drop policy if exists "Authors can delete own article images" on storage.objects;
create policy "Authors can delete own article images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'article-images'
  and exists (
    select 1 from public.articles a
    where a.id::text = (storage.foldername(name))[1]
      and a.author_id = auth.uid()
  )
);


-- 3. Article policies for authoring, drafts and publishing
-- Additive to the existing "Anyone can view published articles" policy.

drop policy if exists "Authors can view own articles" on public.articles;
create policy "Authors can view own articles"
on public.articles
for select
to authenticated
using (author_id = auth.uid());

drop policy if exists "Registered Users can create own articles" on public.articles;
create policy "Registered Users can create own articles"
on public.articles
for insert
to authenticated
with check (author_id = auth.uid());

drop policy if exists "Authors can update own articles" on public.articles;
create policy "Authors can update own articles"
on public.articles
for update
to authenticated
using (author_id = auth.uid())
with check (author_id = auth.uid());

drop policy if exists "Authors can delete own articles" on public.articles;
create policy "Authors can delete own articles"
on public.articles
for delete
to authenticated
using (author_id = auth.uid());
