-- Feature 7: User News Preferences

-- Create user_preferences table
create table if not exists public.user_preferences (
    user_id uuid not null references auth.users(id) on delete cascade,
    category_id bigint not null references public.categories(id) on delete cascade,
    created_at timestamptz not null default now(),

    primary key (user_id, category_id)
);

-- Enable Row Level Security
alter table public.user_preferences enable row level security;


-- Allow users to view only their own preferences
drop policy if exists "Users can view own preferences"
on public.user_preferences;

create policy "Users can view own preferences"
on public.user_preferences
for select
to authenticated
using (auth.uid() = user_id);


-- Allow users to add only their own preferences
drop policy if exists "Users can add own preferences"
on public.user_preferences;

create policy "Users can add own preferences"
on public.user_preferences
for insert
to authenticated
with check (auth.uid() = user_id);


-- Allow users to remove only their own preferences
drop policy if exists "Users can remove own preferences"
on public.user_preferences;

create policy "Users can remove own preferences"
on public.user_preferences
for delete
to authenticated
using (auth.uid() = user_id);


-- Grant authenticated users access to the table
grant select, insert, delete
on public.user_preferences
to authenticated;
