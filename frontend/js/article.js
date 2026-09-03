import { supabase } from "../../config/supabaseClient.js";
import { getArticleById, getTrendingArticles, recordArticleView } from "../../services/feature5Service.js";
import { formatCount, formatRelativeTime, escapeHtml } from "./format.js";

const params = new URLSearchParams(window.location.search);
const articleId = params.get("id");

function renderRail(articles, currentId) {
  const rail = document.querySelector(".rail-list");
  if (!rail) return;

  const others = articles.filter((a) => String(a.id) !== String(currentId)).slice(0, 4);

  if (others.length === 0) {
    rail.innerHTML = '<p class="state-message">No other trending articles right now.</p>';
    return;
  }

  rail.innerHTML = others
    .map((a) => {
      const thumb = a.featured_image_url
        ? `<img src="${escapeHtml(a.featured_image_url)}" alt="" />`
        : "🖼";
      return `
        <a class="rail-item" href="article.html?id=${a.id}">
          <div class="thumb">${thumb}</div>
          <div>
            <p class="rail-item__title">${escapeHtml(a.title)}</p>
            <span class="meta-row">
              <span>${formatRelativeTime(a.published_at)}</span>
              <span>👁 ${formatCount(a.view_count)}</span>
            </span>
          </div>
        </a>
      `;
    })
    .join("");
}

function renderArticle(article) {
  const slot = document.getElementById("article-slot");
  const thumb = article.featured_image_url
    ? `<img src="${escapeHtml(article.featured_image_url)}" alt="" />`
    : "🖼";
  const authorName = article.author?.display_name ?? "Staff Writer";

  slot.innerHTML = `
    <div class="article-layout">
      <article class="article-panel">
        <span class="badge">${escapeHtml(article.category?.name ?? "")}</span>
        <h1 class="article-panel__title">${escapeHtml(article.title)}</h1>
        <div class="article-panel__byline">
          <span>👤 By ${escapeHtml(authorName)}</span>
          <span>${formatRelativeTime(article.published_at)}</span>
          <span>👁 ${formatCount(article.view_count)} views</span>
        </div>
        <div class="thumb">${thumb}</div>
        <div class="article-panel__body">${escapeHtml(article.content)}</div>

        <div class="article-actions">
          <button class="article-action" title="Coming soon">♡ Like (${formatCount(article.reaction_count)})</button>
          <button class="article-action" title="Coming soon">💬 Comment</button>
          <button class="article-action" title="Coming soon">🔖 Bookmark</button>
          <button class="article-action is-live" id="share-btn">↗ Share</button>
        </div>
      </article>

      <aside>
        <p class="rail-title">More Trending</p>
        <div class="rail-list">
          <p class="state-message">Loading…</p>
        </div>
      </aside>
    </div>
  `;

  document.getElementById("share-btn").addEventListener("click", async (e) => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      e.target.textContent = "✓ Link copied";
      setTimeout(() => {
        e.target.textContent = "↗ Share";
      }, 2000);
    } catch {
      /* clipboard access unavailable; ignore */
    }
  });
}

async function renderUserLabel() {
  const { data } = await supabase.auth.getUser();
  const label = document.getElementById("user-label");
  if (data?.user) {
    label.textContent = data.user.email ?? "Account";
  }
}

async function init() {
  renderUserLabel();

  if (!articleId) {
    document.getElementById("article-slot").innerHTML =
      '<p class="state-message is-error">No article was specified.</p>';
    return;
  }

  try {
    await recordArticleView(articleId);
  } catch {
    /* view tracking is best-effort and should not block reading the article */
  }

  try {
    const article = await getArticleById(articleId);
    renderArticle(article);

    try {
      const trending = await getTrendingArticles(6);
      renderRail(trending, articleId);
    } catch {
      renderRail([], articleId);
    }
  } catch (err) {
    document.getElementById("article-slot").innerHTML =
      `<p class="state-message is-error">This article is unavailable: ${escapeHtml(err.message)}</p>`;
  }
}

init();
