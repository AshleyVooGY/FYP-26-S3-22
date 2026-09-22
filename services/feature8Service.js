import { supabase } from "../config/supabaseClient.js";

const BUCKET = "article-images";
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/**
 * Retrieve every article for the media management list (System Admin only, via RLS).
 */
export async function getManagedArticles() {
  const { data, error } = await supabase
    .from("articles")
    .select("id, title, status, featured_image_url, category:categories!articles_category_id_fkey(name)")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

function storagePathFromUrl(url) {
  const marker = `/object/public/${BUCKET}/`;
  const index = url.indexOf(marker);
  return index === -1 ? null : url.slice(index + marker.length);
}

/**
 * Upload a new featured image for an article and attach it to that article
 * (System Admin only, via RLS on both the storage bucket and the articles table).
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
