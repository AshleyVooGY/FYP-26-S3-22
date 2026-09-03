-- Enable Row Level Security
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.articles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.article_views enable row level security;


-- Remove existing policies before recreating them
drop policy if exists "Anyone can view categories"
on public.categories;

drop policy if exists "Anyone can view published articles"
on public.articles;

drop policy if exists "Users can view own profile"
on public.profiles;

drop policy if exists "Users can update own profile"
on public.profiles;

drop policy if exists "Users can view own preferences"
on public.user_preferences;

drop policy if exists "Users can add own preferences"
on public.user_preferences;

drop policy if exists "Users can remove own preferences"
on public.user_preferences;


-- Categories are publicly readable
create policy "Anyone can view categories"
on public.categories
for select
using (true);


-- Only published articles are publicly readable
create policy "Anyone can view published articles"
on public.articles
for select
using (status = 'published');


-- Users can view only their own profile
create policy "Users can view own profile"
on public.profiles
for select
using (auth.uid() = id);


-- Users can update only their own profile
create policy "Users can update own profile"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);


-- Users can view only their own preferences
create policy "Users can view own preferences"
on public.user_preferences
for select
using (auth.uid() = user_id);


-- Users can add preferences only to their own account
create policy "Users can add own preferences"
on public.user_preferences
for insert
with check (auth.uid() = user_id);


-- Users can remove only their own preferences
create policy "Users can remove own preferences"
on public.user_preferences
for delete
using (auth.uid() = user_id);