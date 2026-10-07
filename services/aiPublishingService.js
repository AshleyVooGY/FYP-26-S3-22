import { supabase } from "../config/supabaseClient.js";

export const CREDIBILITY_THRESHOLD = 80;

const WRITING_FUNCTION = "ai-writing-assistant";
const CREDIBILITY_FUNCTION = "check-article-credibility";

function functionError(error, featureName) {
  const detail = error?.message ? ` (${error.message})` : "";
  return new Error(
    `${featureName} is not available yet. The Supabase Edge Function must be configured by the backend team${detail}.`
  );
}

function normaliseTier(value) {
  return String(value || "").toLowerCase() === "premium" ? "premium" : "free";
}

/**
 * The tier is read from signed user metadata for display only. Usage limits and
 * permissions must still be enforced by the Edge Function, never by the browser.
 */
export function getSubscriptionTier(user) {
  return normaliseTier(
    user?.app_metadata?.subscription_tier ??
      user?.user_metadata?.subscription_tier ??
      user?.app_metadata?.plan ??
      user?.user_metadata?.plan
  );
}

export async function requestWritingAssistance({ task, title, content, categoryId }) {
  const { data, error } = await supabase.functions.invoke(WRITING_FUNCTION, {
    body: {
      task,
      title: title?.trim() || null,
      content: content?.trim() || null,
      category_id: categoryId ? Number(categoryId) : null
    }
  });

  if (error) {
    throw functionError(error, "AI writing assistance");
  }
  if (!data || typeof data !== "object") {
    throw new Error("AI writing assistance returned an invalid response.");
  }

  return {
    task,
    title: data.title ?? null,
    titles: Array.isArray(data.titles) ? data.titles.filter(Boolean) : [],
    summary: data.summary ?? null,
    tags: Array.isArray(data.tags) ? data.tags.filter(Boolean) : [],
    content: data.content ?? data.polished_content ?? null,
    explanation: data.explanation ?? null,
    remaining: Number.isFinite(Number(data.remaining)) ? Number(data.remaining) : null,
    limit: Number.isFinite(Number(data.limit)) ? Number(data.limit) : null
  };
}

export async function checkArticleCredibility({ title, content, categoryId }) {
  const { data, error } = await supabase.functions.invoke(CREDIBILITY_FUNCTION, {
    body: {
      title: title.trim(),
      content: content.trim(),
      category_id: categoryId ? Number(categoryId) : null
    }
  });

  if (error) {
    throw functionError(error, "Credibility checking");
  }

  const score = Number(data?.score ?? data?.credibility_score);
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new Error("Credibility checking returned an invalid score.");
  }

  return {
    score: Math.round(score),
    summary: data.summary ?? data.explanation ?? "The credibility check is complete.",
    issues: Array.isArray(data.issues) ? data.issues.filter(Boolean) : [],
    sources: Array.isArray(data.sources)
      ? data.sources
          .filter((source) => source && (source.title || source.url))
          .map((source) => ({ title: source.title || source.url, url: source.url || null }))
      : [],
    checkedAt: data.checked_at ?? new Date().toISOString()
  };
}
