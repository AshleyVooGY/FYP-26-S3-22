-- Feature 9: News Reading Accessibility Management

create table if not exists public.reading_preferences (
    user_id uuid primary key references auth.users(id) on delete cascade,
    text_size text not null default 'medium',
    reading_mode text not null default 'light',
    updated_at timestamptz not null default now(),

    constraint valid_text_size
    check (text_size in ('small', 'medium', 'large')),

    constraint valid_reading_mode
    check (reading_mode in ('light', 'dark'))
);

-- enable Row Level Security
alter table public.reading_preferences enable row level security;


-- users can view their own reading preferences
create policy "Users can view own reading preferences"
on public.reading_preferences
for select
to authenticated
using (auth.uid() = user_id);


-- users can create their own reading preferences
create policy "Users can add own reading preferences"
on public.reading_preferences
for insert
to authenticated
with check (auth.uid() = user_id);


-- users can update their own reading preferences
create policy "Users can update own reading preferences"
on public.reading_preferences
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);


-- allow authenticated users to use the table
grant select, insert, update
on public.reading_preferences
to authenticated;
