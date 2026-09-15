import { supabase } from "../config/supabaseClient.js";

/**
 * Retrieve view statistics for published articles (System Admin only).
 */
export async function getArticleViewStats({ sort = "views_desc", limit = 50 } = {}) {
  const { data, error } = await supabase.rpc("get_article_view_stats", {
    p_sort: sort,
    result_limit: limit
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}


/**
 * Retrieve the analytics summary for a single article
 * (totals, reactions, registered-vs-guest split).
 */
export async function getArticleAnalyticsSummary(articleId) {
  const { data, error } = await supabase.rpc("get_article_analytics_summary", {
    p_article_id: articleId
  });

  if (error) {
    throw new Error(error.message);
  }

  return data?.[0] ?? null;
}


/**
 * Retrieve a zero-filled daily view trend for a single article.
 */
export async function getArticleViewTrend(articleId, days = 14) {
  const { data, error } = await supabase.rpc("get_article_view_trend", {
    p_article_id: articleId,
    p_days: days
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}


/**
 * Retrieve every category ranked by total views.
 */
export async function getCategoryPopularity() {
  const { data, error } = await supabase.rpc("get_category_popularity");

  if (error) {
    throw new Error(error.message);
  }

  return data;
}


/**
 * Retrieve platform-wide summary numbers for the analytics dashboard.
 */
export async function getAnalyticsOverview() {
  const { data, error } = await supabase.rpc("get_analytics_overview");

  if (error) {
    throw new Error(error.message);
  }

  return data?.[0] ?? null;
}
