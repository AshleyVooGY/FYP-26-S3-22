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

function normaliseBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    return ["true", "1", "yes", "critical", "found"].includes(value.trim().toLowerCase());
  }
  return Boolean(value);
}

function normaliseSources(data) {
  const rawSources =
    data?.sources ??
    data?.source_links ??
    data?.supporting_sources ??
    data?.grounding_sources ??
    [];

  if (!Array.isArray(rawSources)) return [];

  return rawSources
    .map((source) => {
      if (typeof source === "string") {
        return { title: source, url: source };
      }
      if (!source || typeof source !== "object") return null;

      const url =
        source.url ??
        source.uri ??
        source.link ??
        source.web?.uri ??
        source.web?.url ??
        null;
      const title = source.title ?? source.name ?? source.web?.title ?? url;

      return title || url ? { title: title || url, url } : null;
    })
    .filter(Boolean);
}

function normaliseCriticalIssue(data) {
  const rawIssue = data?.critical_issue ?? data?.criticalIssue ?? data?.has_critical_issue;
  const issueObject = rawIssue && typeof rawIssue === "object" ? rawIssue : null;
  const found = issueObject
    ? normaliseBoolean(issueObject.found ?? issueObject.exists ?? issueObject.value ?? true)
    : normaliseBoolean(rawIssue);
  const message =
    data?.critical_issue_explanation ??
    data?.critical_issue_message ??
    issueObject?.explanation ??
    issueObject?.message ??
    (typeof rawIssue === "string" && !["true", "false", "yes", "no", "1", "0"].includes(rawIssue.trim().toLowerCase())
      ? rawIssue
      : null);

  return { found, message };
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
  const supported = ['title', 'summary', 'tags', 'polish'];
  if (!supported.includes(task) || !content?.trim()) throw new Error('Add article content and choose a writing task.');
  if ((title?.trim().length || 0) > 300 || content.trim().length > 20000) {
    throw new Error('Use a title of up to 300 characters and content of up to 20,000 characters.');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);
  try {
    const {data,error} = await supabase.functions.invoke(WRITING_FUNCTION, {
      body:{task,title:title?.trim() || null,content:content.trim(),category_id:categoryId ? Number(categoryId) : null},
      signal:controller.signal
    });
    if (error?.context?.status === 401) throw new Error('Please sign in again to use writing assistance.');
    if (error?.context?.status === 429 || data?.code === 'RATE_LIMITED') throw new Error('Hourly writing limit reached. Try again later.');
    if (error || data?.error) throw new Error('Writing assistance is temporarily unavailable. Your article has not changed. Please try again.');
    const text = (value, max) => typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : null;
    const field = task === 'title' ? 'titles' : task === 'tags' ? 'tags' : task === 'summary' ? 'summary' : 'content';
    const value = data?.[field];
    const array = field === 'titles' || field === 'tags';
    if (array ? !Array.isArray(value) || value.length !== (field === 'titles' ? 3 : 5) || !value.every(v => text(v, field === 'titles' ? 300 : 100))
      : !text(value, field === 'summary' ? 4000 : 20000)) throw new Error('The AI returned an incomplete suggestion. Please try again.');
    return {task,title:null,titles:field === 'titles' ? value.map(v => v.trim()) : [],
      tags:field === 'tags' ? value.map(v => v.trim()) : [],
      summary:field === 'summary' ? value.trim() : null,
      content:field === 'content' ? value.trim() : null,explanation:null,
      remaining:Number.isInteger(data.remaining) && data.remaining >= 0 ? data.remaining : null,
      limit:Number.isInteger(data.limit) && data.limit > 0 ? data.limit : null};
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Writing assistance took too long. Your article has not changed. Please try again.');
    throw error;
  } finally { clearTimeout(timeout); }
}

export async function checkArticleCredibility({ title, content, categoryId, categoryIds = [], tagIds = [] }) {
  const { data, error } = await supabase.functions.invoke(CREDIBILITY_FUNCTION, {
    body: {
      title: title.trim(),
      content: content.trim(),
      category_id: categoryId ? Number(categoryId) : null,
      category_ids: categoryIds.map(Number),
      tag_ids: tagIds.map(Number)
    }
  });

  if (error) {
    throw functionError(error, "Credibility checking");
  }

  const score = Number(data?.score ?? data?.credibility_score);
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    throw new Error("Credibility checking returned an invalid score.");
  }

  const criticalIssue = normaliseCriticalIssue(data);

  return {
    receiptId: data.receipt_id || null,
    score: Math.round(score),
    summary: data.summary ?? data.explanation ?? "The credibility check is complete.",
    issues: Array.isArray(data.issues) ? data.issues.filter(Boolean) : [],
    sources: normaliseSources(data),
    criticalIssue: criticalIssue.found,
    criticalIssueMessage: criticalIssue.message,
    checkedAt: data.checked_at ?? new Date().toISOString()
  };
}

/** Optional topic classification; it never writes to an article or publishes it. */
export async function suggestArticleCategory({ title, content, categoryId }) {
  if (!title?.trim() || !content?.trim()) throw new Error('Enter a title and article content first.');
  if (title.trim().length > 300 || content.trim().length > 20000) {
    throw new Error('Use a title of up to 300 characters and article content of up to 20,000 characters.');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 35000);
  try {
    const { data, error } = await supabase.functions.invoke('suggest-article-category', {
      body: { title: title.trim(), content: content.trim(), category_id: categoryId ? Number(categoryId) : null },
      signal: controller.signal
    });
    if (error?.context?.status === 403 || data?.code === 'PREMIUM_REQUIRED') {
      throw new Error(data?.error || 'Category suggestions are a Premium feature. Upgrade to use AI category suggestions.');
    }
    if (error?.context?.status === 429 || data?.code === 'RATE_LIMITED') {
      throw new Error('Hourly category check limit reached. Try again later.');
    }
    if (error || data?.error) {
      throw new Error('Category suggestions are temporarily unavailable. You can choose a category and save normally. Try again later.');
    }
    if (!data || (data.category_id !== null && (!Number.isSafeInteger(data.category_id) || data.category_id <= 0))
      || typeof data.reason !== 'string' || !data.reason.trim() || data.reason.length > 1000) {
      throw new Error('The category suggestion could not be read. Please try again.');
    }
    return { categoryId: data.category_id, reason: data.reason.trim() };
  } catch (error) {
    if (controller.signal.aborted) throw new Error('The category check took too long. You can keep editing and try again.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
