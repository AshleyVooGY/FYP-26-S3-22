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