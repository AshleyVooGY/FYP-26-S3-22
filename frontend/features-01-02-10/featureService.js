import { supabase } from "../../config/supabaseClient.js";

const throwIfError = (error) => {
  if (error) throw new Error(error.message);
};

export async function getViewer() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return { user: null, isAdmin: false };
  const user = data?.user ?? null;
  if (!user) return { user: null, isAdmin: false };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, display_name")
    .eq("id", user.id)
    .maybeSingle();

  return {
    user,
    isAdmin: !profileError && profile?.role === "system_admin",
    displayName: profile?.display_name || user.email || "User"
  };
}

export async function getClassifications() {
  const [categoriesResult, tagsResult] = await Promise.all([
    supabase.from("categories").select("id, name").order("name"),
    supabase.from("tags").select("id, name").order("name")
  ]);
  throwIfError(categoriesResult.error);
  throwIfError(tagsResult.error);
  return {
    categories: categoriesResult.data ?? [],
    tags: tagsResult.data ?? []
  };
}

export async function getPublishedArticles(limit = 24) {
  const { data, error } = await supabase
    .from("articles")
    .select("id, title, content, featured_image_url, published_at, view_count, reaction_count")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(limit);
  throwIfError(error);
  return data ?? [];
}

export async function getArticlesByClassification(type, id) {
  const table = type === "tag" ? "article_tags" : "article_categories";
  const key = type === "tag" ? "tag_id" : "category_id";
  const { data: links, error: linkError } = await supabase
    .from(table)
    .select("article_id")
    .eq(key, id);
  throwIfError(linkError);
  const ids = (links ?? []).map((link) => link.article_id);
  if (!ids.length) return [];

  const { data, error } = await supabase
    .from("articles")
    .select("id, title, content, featured_image_url, published_at, view_count, reaction_count")
    .in("id", ids)
    .eq("status", "published")
    .order("published_at", { ascending: false });
  throwIfError(error);
  return data ?? [];
}

export async function searchArticles(filters = {}) {
  const { data, error } = await supabase.rpc("search_news_articles", {
    p_keyword: filters.keyword?.trim() || null,
    p_category_id: filters.categoryId ? Number(filters.categoryId) : null,
    p_start_date: filters.startDate || null,
    p_end_date: filters.endDate || null,
    p_sort: filters.sort || "latest"
  });
  throwIfError(error);
  return data ?? [];
}

export async function getArticle(articleId) {
  const { data, error } = await supabase
    .from("articles")
    .select("id, title, content, featured_image_url, published_at, view_count, reaction_count")
    .eq("id", articleId)
    .eq("status", "published")
    .single();
  throwIfError(error);
  return data;
}

export async function getRecommendations(articleId, limit = 6) {
  const { data, error } = await supabase.rpc("get_recommended_articles", {
    p_article_id: Number(articleId),
    p_limit: limit
  });
  throwIfError(error);
  return data ?? [];
}

export async function createClassification(type, name) {
  const table = type === "tag" ? "tags" : "categories";
  const { data, error } = await supabase.from(table).insert({ name: name.trim() }).select("id, name").single();
  throwIfError(error);
  return data;
}

export async function updateClassification(type, id, name) {
  const table = type === "tag" ? "tags" : "categories";
  const { data, error } = await supabase.from(table).update({ name: name.trim() }).eq("id", id).select("id, name").single();
  throwIfError(error);
  return data;
}

export async function deleteClassification(type, id) {
  const table = type === "tag" ? "tags" : "categories";
  const { error } = await supabase.from(table).delete().eq("id", id);
  throwIfError(error);
}
