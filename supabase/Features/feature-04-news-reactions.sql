-- Feature 4: News Reactions

-- Create reactions table
create table if not exists public.reactions (
    user_id uuid not null references auth.users(id) on delete cascade,
    article_id bigint not null references public.articles(id) on delete cascade,
    reaction_type text not null,
    created_at timestamptz default now(),

    primary key (user_id, article_id),

    constraint valid_reaction_type
    check (reaction_type in ('like', 'love', 'haha', 'wow', 'sad', 'angry'))
);

-- Enable Row Level Security
alter table public.reactions enable row level security;


-- Logged-in users can view reactions
create policy "Users can view reactions"
on public.reactions
for select
to authenticated
using (true);


-- Users can add their own reactions
create policy "Users can add own reactions"
on public.reactions
for insert
to authenticated
with check (auth.uid() = user_id);


-- Users can update their own reactions
create policy "Users can update own reactions"
on public.reactions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);


-- Users can remove their own reactions
create policy "Users can remove own reactions"
on public.reactions
for delete
to authenticated
using (auth.uid() = user_id);


-- Function to get reaction counts for an article
create or replace function public.get_article_reactions(p_article_id bigint)
returns table (
    reaction_type text,
    reaction_count bigint
)
language sql
security invoker
set search_path = public
as $$
    select
        r.reaction_type,
        count(*) as reaction_count
    from public.reactions r
    where r.article_id = p_article_id
    group by r.reaction_type
    order by reaction_count desc;
$$;

grant execute on function public.get_article_reactions(bigint)
to authenticated;
