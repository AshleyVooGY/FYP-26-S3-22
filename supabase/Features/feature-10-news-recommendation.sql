-- Feature 10: News Recommendation


create or replace function public.get_recommended_articles(
    p_article_id bigint,
    p_limit integer default 6
)
returns table (
    id bigint,
    title text,
    content text,
    featured_image_url text,
    published_at timestamptz,
    view_count integer,
    reaction_count integer,
    relevance_score bigint
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
        a.reaction_count,

        (
            -- Shared categories
            (
                select count(*)
                from public.article_categories candidate_ac
                where candidate_ac.article_id = a.id
                  and candidate_ac.category_id in (
                      select current_ac.category_id
                      from public.article_categories current_ac
                      where current_ac.article_id = p_article_id
                  )
            )

            +

            -- Shared tags
            (
                select count(*)
                from public.article_tags candidate_at
                where candidate_at.article_id = a.id
                  and candidate_at.tag_id in (
                      select current_at.tag_id
                      from public.article_tags current_at
                      where current_at.article_id = p_article_id
                  )
            )
        )::bigint as relevance_score

    from public.articles a

    where
        -- Only recommend published articles
        a.status = 'published'

        -- Do not recommend the article currently being viewed
        and a.id <> p_article_id

        -- Must share at least one category or tag
        and (
            exists (
                select 1
                from public.article_categories candidate_ac
                where candidate_ac.article_id = a.id
                  and candidate_ac.category_id in (
                      select current_ac.category_id
                      from public.article_categories current_ac
                      where current_ac.article_id = p_article_id
                  )
            )

            or

            exists (
                select 1
                from public.article_tags candidate_at
                where candidate_at.article_id = a.id
                  and candidate_at.tag_id in (
                      select current_at.tag_id
                      from public.article_tags current_at
                      where current_at.article_id = p_article_id
                  )
            )
        )

    order by
        relevance_score desc,
        a.published_at desc

    limit greatest(1, least(p_limit, 20));
$$;


-- Allow Guests and Registered Users to retrieve recommendations
grant execute
on function public.get_recommended_articles(
    bigint,
    integer
)
to anon, authenticated;