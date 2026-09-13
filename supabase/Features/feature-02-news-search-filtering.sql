-- Feature 2: News Search and Filtering

create or replace function public.search_news_articles(
    p_keyword text default null,
    p_category_id bigint default null,
    p_start_date date default null,
    p_end_date date default null,
    p_sort text default 'latest'
)
returns table (
    id bigint,
    title text,
    content text,
    featured_image_url text,
    published_at timestamptz,
    view_count integer,
    reaction_count integer
)
language sql
stable
security invoker
set search_path = public
as $$
    select
        a.id,
        a.title,
        a.content,
        a.featured_image_url,
        a.published_at,
        a.view_count,
        a.reaction_count

    from public.articles a

    where
        -- Only published articles appear in search
        a.status = 'published'

        -- Keyword search
        and (
            p_keyword is null
            or trim(p_keyword) = ''

            -- Search article title
            or a.title ilike '%' || trim(p_keyword) || '%'

            -- Search article content
            or a.content ilike '%' || trim(p_keyword) || '%'

            -- Search category names
            or exists (
                select 1
                from public.article_categories ac
                join public.categories c
                    on c.id = ac.category_id
                where ac.article_id = a.id
                  and c.name ilike '%' || trim(p_keyword) || '%'
            )

            -- Search tag names
            or exists (
                select 1
                from public.article_tags atg
                join public.tags t
                    on t.id = atg.tag_id
                where atg.article_id = a.id
                  and t.name ilike '%' || trim(p_keyword) || '%'
            )
        )

        -- Category filter
        and (
            p_category_id is null
            or exists (
                select 1
                from public.article_categories ac
                where ac.article_id = a.id
                  and ac.category_id = p_category_id
            )
        )

        -- Start date filter
        and (
            p_start_date is null
            or a.published_at >= p_start_date::timestamptz
        )

        -- End date filter
        and (
            p_end_date is null
            or a.published_at < (p_end_date + 1)::timestamptz
        )

    order by

        -- Latest first
        case
            when p_sort = 'latest'
            then a.published_at
        end desc nulls last,

        -- Oldest first
        case
            when p_sort = 'oldest'
            then a.published_at
        end asc nulls last,

        -- Most popular first
        case
            when p_sort = 'popularity'
            then a.view_count
        end desc nulls last,

        -- Default/fallback ordering
        a.published_at desc;
$$;


-- Allow Guests and Registered Users to use search
grant execute
on function public.search_news_articles(
    text,
    bigint,
    date,
    date,
    text
)
to anon, authenticated;