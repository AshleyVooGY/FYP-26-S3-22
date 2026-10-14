import { supabase } from "../config/supabaseClient.js";

const BUCKET = "article-images";
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/**
 * Retrieve every category (used to populate the article editor's category picker).
 */
export async function getCategories() {
  const { data, error } = await supabase.from("categories").select("id, name").order("name");

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

/**
 * Retrieve every tag used by the article editor.
 */
export async function getTags() {
  const { data, error } = await supabase.from("tags").select("id, name").order("name");

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

function normaliseIds(ids = []) {
  return [...new Set(ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}

async function getArticleLinks(articleId) {
  const [categoryResult, tagResult] = await Promise.all([
    supabase.from("article_categories").select("category_id").eq("article_id", articleId),
    supabase.from("article_tags").select("tag_id").eq("article_id", articleId)
  ]);

  if (categoryResult.error) throw new Error(categoryResult.error.message);
  if (tagResult.error) throw new Error(tagResult.error.message);

  return {
    categoryIds: normaliseIds((categoryResult.data ?? []).map((row) => row.category_id)),
    tagIds: normaliseIds((tagResult.data ?? []).map((row) => row.tag_id))
  };
}

async function manageArticleLink(articleId, linkType, linkId, action) {
  const { error } = await supabase.rpc("manage_article_link", {
    p_article_id: Number(articleId),
    p_link_type: linkType,
    p_link_id: Number(linkId),
    p_action: action
  });

  if (error) {
    throw new Error(`Could not ${action} the ${linkType} link: ${error.message}`);
  }
}

async function syncLinkType(articleId, linkType, previousIds, nextIds) {
  const previous = normaliseIds(previousIds);
  const next = normaliseIds(nextIds);
  const previousSet = new Set(previous);
  const nextSet = new Set(next);

  const removals = previous.filter((id) => !nextSet.has(id));
  const additions = next.filter((id) => !previousSet.has(id));

  // Keep the operations sequential so a useful error identifies the exact
  // relationship that failed instead of returning an opaque Promise error.
  for (const id of removals) {
    await manageArticleLink(articleId, linkType, id, "remove");
  }
  for (const id of additions) {
    await manageArticleLink(articleId, linkType, id, "add");
  }
}

async function syncArticleLinks(articleId, categoryIds, tagIds, previousLinks = null) {
  const current = previousLinks ?? (await getArticleLinks(articleId));
  await syncLinkType(articleId, "category", current.categoryIds, categoryIds);
  await syncLinkType(articleId, "tag", current.tagIds, tagIds);
}

/**
 * Synchronise an article's many-to-many classifications through the
 * ownership-checking backend RPC.
 */
export async function saveArticleLinks(articleId, categoryIds = [], tagIds = []) {
  await syncArticleLinks(articleId, categoryIds, tagIds);
}

/**
 * Retrieve one of the current user's own articles, draft or published.
 *
 * The author is filtered explicitly rather than left to RLS: without
 * it, a published article authored by someone else would still load
 * here (published articles are publicly readable), only to fail
 * silently when the editor tried to save changes to it.
 */
export async function getMyArticleById(articleId) {
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("articles")
    .select("id, title, content, category_id, status, featured_image_url, published_at")
    .eq("id", articleId)
    .eq("author_id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) return null;

  const links = await getArticleLinks(articleId);
  return {
    ...data,
    category_ids: links.categoryIds.length
      ? links.categoryIds
      : data.category_id
        ? [Number(data.category_id)]
        : [],
    tag_ids: links.tagIds
  };
}

/**
 * Retrieve the current user's own articles, filtered by status.
 *
 * The author is filtered explicitly rather than left to RLS: the
 * "Anyone can view published articles" policy would otherwise let a
 * status="published" query return every user's published articles,
 * not just the current author's own.
 */
export async function getMyArticles(status) {
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be logged in to view your articles.");
  }

  const { data, error } = await supabase
    .from("articles")
    .select("id, title, status, featured_image_url, view_count, published_at, created_at, category:categories!articles_category_id_fkey(name)")
    .eq("status", status)
    .eq("author_id", user.id)
    .order(status === "draft" ? "created_at" : "published_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

function validateArticleInput({ title, content }) {
  if (!title || !title.trim()) {
    throw new Error("Title is required.");
  }
  if (!content || !content.trim()) {
    throw new Error("Content is required.");
  }
}

/**
 * Create a new draft owned by the current user. Publishing happens only after
 * its category and tag relationships have been saved successfully.
 */
export async function createArticle({ title, content, categoryIds = [] }) {
  validateArticleInput({ title, content });
  const nextCategoryIds = normaliseIds(categoryIds);

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("You must be logged in to create an article.");
  }

  const { data, error } = await supabase
    .from("articles")
    .insert({
      title: title.trim(),
      content: content.trim(),
      // Keep the legacy field in sync until every existing page has migrated
      // to article_categories.
      category_id: nextCategoryIds[0] ?? null,
      author_id: user.id,
      status: "draft",
      published_at: null
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data.id;
}

/**
 * Update an article the current user owns (draft or already published).
 */
export async function updateArticle(articleId, { title, content, categoryIds = [] }) {
  validateArticleInput({ title, content });
  const nextCategoryIds = normaliseIds(categoryIds);
  const { error } = await supabase
    .from("articles")
    .update({
      title: title.trim(),
      content: content.trim(),
      category_id: nextCategoryIds[0] ?? null
    })
    .eq("id", articleId);

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Publish a draft article owned by the current user.
 */
export async function publishArticle(articleId) {
  const { error } = await supabase
    .from("articles")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("id", articleId);

  if (error) {
    throw new Error(error.message);
  }
}

/**
 * Delete an article the current user owns (draft or published).
 */
export async function deleteArticle(articleId) {
  const { error } = await supabase.from("articles").delete().eq("id", articleId);

  if (error) {
    throw new Error(error.message);
  }
}

function storagePathFromUrl(url) {
  const marker = `/object/public/${BUCKET}/`;
  const index = url.indexOf(marker);
  return index === -1 ? null : url.slice(index + marker.length);
}

/**
 * Upload a featured image for an article the current user owns and attach it.
 * If the article already had an image, the old file is removed from storage
 * once the new one is safely attached.
 */
export async function uploadArticleImage(articleId, file, previousImageUrl = null) {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error("Only PNG, JPEG, WEBP or GIF images are allowed.");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("Image must be smaller than 5MB.");
  }

  const extension = file.name.split(".").pop();
  const path = `${articleId}/${Date.now()}.${extension}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const imageUrl = publicUrlData.publicUrl;

  const { error: updateError } = await supabase.from("articles").update({ featured_image_url: imageUrl }).eq("id", articleId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  const previousPath = previousImageUrl ? storagePathFromUrl(previousImageUrl) : null;
  if (previousPath && previousPath !== path) {
    await supabase.storage.from(BUCKET).remove([previousPath]);
  }

  return imageUrl;
}

/**
 * Remove an article's featured image from storage and detach it from the article.
 */
export async function removeArticleImage(articleId, imageUrl) {
  const path = storagePathFromUrl(imageUrl);

  if (path) {
    await supabase.storage.from(BUCKET).remove([path]);
  }

  const { error } = await supabase.from("articles").update({ featured_image_url: null }).eq("id", articleId);

  if (error) {
    throw new Error(error.message);
  }
}
