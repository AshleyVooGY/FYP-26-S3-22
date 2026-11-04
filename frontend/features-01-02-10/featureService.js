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

export async function getCategories() {
  const { data, error } = await supabase.from("categories").select("id, name").order("name");
  throwIfError(error);
  return data || [];
}

export async function getTag(tagId) {
  const { data, error } = await supabase.from("tags").select("id, name").eq("id", Number(tagId)).maybeSingle();
  throwIfError(error);
  return data;
}

export async function getPublishedArticles(limit = 24) {
  const { data, error } = await supabase
    .from("articles")
    .select("id, title, content, featured_image_url, published_at, view_count, reaction_count, category:categories!articles_category_id_fkey(name)")
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
  if (!ids.length && type === "tag") return [];

  let query = supabase.from("articles")
    .select("id, title, content, featured_image_url, published_at, view_count, reaction_count, category:categories!articles_category_id_fkey(name)");
  query = type === "category"
    ? query.or(`category_id.eq.${Number(id)}${ids.length ? `,id.in.(${ids.join(',')})` : ''}`)
    : query.in("id", ids);
  const { data, error } = await query
    .eq("status", "published")
    .order("published_at", { ascending: false });
  throwIfError(error);
  return data ?? [];
}

// Keep paging in the Data API so RLS and published-only filtering apply to
// both the rows and their exact total. Empty embeds avoid large ID lists.
export async function getBrowseArticlesPage({ type = "all", id = null, cursor = null } = {}) {
  const pageSize = 6;
  if (!["all", "category", "tag"].includes(type)) throw new Error("Invalid news filter.");
  const filterId = Number(id);
  if (type !== "all" && (!Number.isSafeInteger(filterId) || filterId <= 0)) throw new Error("Invalid classification.");
  if (cursor && (!Number.isSafeInteger(Number(cursor.id)) || Number(cursor.id) <= 0 ||
    (cursor.publishedAt !== null && (typeof cursor.publishedAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2})$/.test(cursor.publishedAt) || !Number.isFinite(Date.parse(cursor.publishedAt)))))) {
    throw new Error("Unable to continue this news list. Refresh and try again.");
  }
  const relation = type === "category" ? ",browse_categories:article_categories()" : type === "tag" ? ",browse_tags:article_tags()" : "";
  const columns = "id,title,content,featured_image_url,published_at,view_count,reaction_count,category:categories!articles_category_id_fkey(name)";
  function filteredQuery(select, options, after = null) {
    let query = supabase.from("articles").select(select + relation, options).eq("status", "published");
    const groups = [];
    if (type === "category") {
      query = query.eq("browse_categories.category_id", filterId);
      // Preserve primary-category OR junction-category matches for older rows.
      groups.push(`or(category_id.eq.${filterId},browse_categories.not.is.null)`);
    } else if (type === "tag") {
      query = query.eq("browse_tags.tag_id", filterId).not("browse_tags", "is", null);
    }
    if (after) {
      if (after.publishedAt === null) query = query.is("published_at", null).lt("id", after.id);
      else groups.push(`or(published_at.lt.${after.publishedAt},and(published_at.eq.${after.publishedAt},id.lt.${after.id}),published_at.is.null)`);
    }
    if (groups.length) query = query.or(groups.length === 1 ? groups[0].slice(3, -1) : `and(${groups.join(",")})`);
    return query;
  }
  try {
    const [rows, totals] = await Promise.all([
      filteredQuery(columns, undefined, cursor)
        .order("published_at", { ascending: false, nullsFirst: false })
        .order("id", { ascending: false }).limit(pageSize + 1),
      filteredQuery("id", { count: "exact", head: true })
    ]);
    throwIfError(rows.error);
    throwIfError(totals.error);
    if (!Array.isArray(rows.data) || !Number.isSafeInteger(totals.count) || totals.count < 0) throw new Error("Unable to read the news list. Please retry.");
    const articles = rows.data.slice(0, pageSize), last = articles.at(-1);
    return {
      articles,
      total: totals.count,
      nextCursor: rows.data.length > pageSize && last ? { publishedAt: last.published_at, id: last.id } : null
    };
  } catch (error) {
    throw new Error(error?.message || "Unable to load news. Please try again.");
  }
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

export async function searchArticlesPage(filters = {}, pageIndex = 0) {
  if (!Number.isSafeInteger(pageIndex) || pageIndex < 0) throw new Error("Invalid search page.");
  const pageSize = 6;
  let query = supabase.rpc("search_news_articles", {
    p_keyword: filters.keyword?.trim() || null,
    p_category_id: filters.categoryId ? Number(filters.categoryId) : null,
    p_start_date: null,
    p_end_date: null,
    p_sort: filters.sort || "latest"
  }, { count: "exact" });
  // Match the reader's local calendar dates used by the article date display.
  const dateBoundary = (value, nextDay = false) => {
    const date = new Date(`${value}T00:00:00`);
    if (!Number.isFinite(date.getTime())) throw new Error("Invalid search date.");
    if (nextDay) date.setDate(date.getDate() + 1);
    return date.toISOString();
  };
  if (filters.startDate) query = query.gte("published_at", dateBoundary(filters.startDate));
  if (filters.endDate) query = query.lt("published_at", dateBoundary(filters.endDate, true));
  if (filters.sort === "popularity") query = query.order("view_count", { ascending: false, nullsFirst: false });
  // A unique tie-breaker keeps adjacent pages stable when dates/counts match.
  query = query.order("published_at", { ascending: filters.sort === "oldest", nullsFirst: false }).order("id", { ascending: false });
  const { data, count, error } = await query.range(pageIndex * pageSize, pageIndex * pageSize + pageSize - 1);
  // A bookmarked page can outlive the results it used to contain.
  if (error?.code === "PGRST103" && pageIndex > 0) return { articles: [], total: 0 };
  throwIfError(error);
  if (!Array.isArray(data) || !Number.isSafeInteger(count) || count < 0) throw new Error("Unable to read search results. Please try again.");
  return { articles: data, total: count };
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
