-- Feature 3: Bookmark and Reading History

-- 1. BOOKMARKS
create table if not exists public.bookmarks (
    user_id uuid not null references auth.users(id) on delete cascade,
    article_id bigint not null references public.articles(id) on delete cascade,
    created_at timestamptz default now(),

    primary key (user_id, article_id)
);

-- Enable Row Level Security
alter table public.bookmarks enable row level security;

-- Users can view their own bookmarks
create policy "Users can view own bookmarks"
on public.bookmarks
for select
to authenticated
using (auth.uid() = user_id);

-- Users can add own bookmarks
create policy "Users can add own bookmarks"
on public.bookmarks
for insert
to authenticated
with check (auth.uid() = user_id);

-- Users can remove their own bookmarks
create policy "Users can remove own bookmarks"
on public.bookmarks
for delete
to authenticated
using (auth.uid() = user_id);

-- Grant permissions to authenticated users
grant select, insert, delete
on public.bookmarks
to authenticated;

-- 2. READING HISTORY
create or replace function public.get_reading_history()
returns table (
    article_id bigint,
    title text,
    viewed_at timestamptz
)
language sql
security invoker
set search_path = public
as $$
    select
        av.article_id,
        a.title,
        av.viewed_at
    from public.article_views av
    join public.articles a
        on a.id = av.article_id
    where av.viewer_identifier = 'user:' || auth.uid()::text
    order by av.viewed_at desc;
$$;


-- Allow logged-in users to get their reading history
grant execute on function public.get_reading_history()
to authenticated;
