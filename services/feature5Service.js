import { supabase } from "../config/supabaseClient.js";

/**
 * Retrieve trending articles published within the last seven days.
 */
export async function getTrendingArticles(limit = 10) {
  const { data, error } = await supabase.rpc(
    "get_trending_articles",
    {
      result_limit: limit
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  return data;
}


/**
 * Retrieve popular articles across all publication dates.
 */
export async function getPopularArticles(limit = 10) {
  const { data, error } = await supabase.rpc(
    "get_popular_articles",
    {
      result_limit: limit
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  return data;
}


/**
 * Retrieve a single published article, including its category name.
 * The author's display name is included when readable under RLS
 * (profiles are only visible to their own owner), otherwise null.
 */
export async function getArticleById(articleId) {
  const { data, error } = await supabase
    .from("articles")
    .select(
      `id, title, content, featured_image_url, view_count, reaction_count,
       published_at, category:categories(name), author:profiles(display_name)`
    )
    .eq("id", articleId)
    .eq("status", "published")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}


/**
 * Retrieve the most recently published articles.
 */
export async function getLatestArticles(limit = 3) {
  const { data, error } = await supabase
    .from("articles")
    .select("id, title, category:categories(name), featured_image_url, view_count, published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message);
  }

  return data;
}


/**
 * Create or retrieve a persistent identifier for Guest Users.
 */
function getGuestSessionId() {
  let sessionId = localStorage.getItem("guest_session_id");

  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem("guest_session_id", sessionId);
  }

  return sessionId;
}


/**
 * Record an article view.
 * Repeated views from the same viewer on the same day are ignored.
 */
export async function recordArticleView(articleId) {
  const guestSessionId = getGuestSessionId();

  const { data, error } = await supabase.rpc(
    "record_article_view",
    {
      p_article_id: articleId,
      p_guest_session_id: guestSessionId
    }
  );

  if (error) {
    throw new Error(error.message);
  }

  return data?.[0] ?? null;
}