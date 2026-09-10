import {
  getTrendingArticles,
  getPopularArticles,
  getLatestArticles
} from "../../services/feature5Service.js";
import { formatCount, formatRelativeTime, escapeHtml } from "./format.js";

function thumbHtml(article) {
  if (article.featured_image_url) {
    return `<img src="${escapeHtml(article.featured_image_url)}" alt="" />`;
  }
  return "🖼";
}

function renderFeatured(article) {
  const slot = document.getElementById("featured-slot");

  if (!article) {
    slot.innerHTML = '<p class="state-message">No published articles yet.</p>';
    return;
  }

  const excerpt = (article.content || "").slice(0, 140);

  slot.innerHTML = `
    <a class="featured-card" href="article.html?id=${article.id}">
      <div class="thumb">${thumbHtml(article)}</div>
      <div class="featured-card__body">
        <span class="badge">${escapeHtml(article.category)}</span>
        <h3 class="featured-card__title">${escapeHtml(article.title)}</h3>
        <p class="featured-card__excerpt">${escapeHtml(excerpt)}${excerpt.length === 140 ? "…" : ""}</p>
        <div class="meta-row">
          <span>${formatRelativeTime(article.published_at)}</span>
          <span>👁 ${formatCount(article.view_count)}</span>
          <span>♡ ${formatCount(article.reaction_count)}</span>
        </div>
      </div>
    </a>
  `;
}

function renderLatest(articles) {
  const list = document.getElementById("latest-list");

  if (!articles || articles.length === 0) {
    list.innerHTML = '<p class="state-message">No articles yet.</p>';
    return;
  }

  list.innerHTML = articles
    .map(
      (article) => `
      <a class="latest-item" href="article.html?id=${article.id}">
        <div class="thumb">${thumbHtml(article)}</div>
        <div class="latest-item__body">
          <span class="badge">${escapeHtml(article.category?.name ?? "")}</span>
          <p class="latest-item__title">${escapeHtml(article.title)}</p>
          <span class="meta-row">
            <span>${formatRelativeTime(article.published_at)}</span>
            <span>👁 ${formatCount(article.view_count)}</span>
          </span>
        </div>
      </a>
    `
    )
    .join("");
}

function renderTrendingGrid(articles) {
  const grid = document.getElementById("trending-grid");

  if (!articles || articles.length === 0) {
    grid.innerHTML = '<p class="state-message">Nothing trending in the last 7 days yet.</p>';
    return;
  }

  grid.innerHTML = articles
    .map(
      (article) => `
      <a class="trend-card" href="article.html?id=${article.id}">
        <div class="thumb">${thumbHtml(article)}</div>
        <div class="trend-card__body">
          <span class="badge">${escapeHtml(article.category)}</span>
          <p class="trend-card__title">${escapeHtml(article.title)}</p>
          <div class="meta-row">
            <span>${formatRelativeTime(article.published_at)}</span>
            <span>👁 ${formatCount(article.view_count)}</span>
            <span>♡ ${formatCount(article.reaction_count)}</span>
          </div>
        </div>
      </a>
    `
    )
    .join("");
}

async function init() {
  try {
    const popular = await getPopularArticles(1);
    renderFeatured(popular[0] ?? null);
  } catch (err) {
    document.getElementById("featured-slot").innerHTML =
      `<p class="state-message is-error">Could not load featured news: ${escapeHtml(err.message)}</p>`;
  }

  try {
    const latest = await getLatestArticles(3);
    renderLatest(latest);
  } catch (err) {
    document.getElementById("latest-list").innerHTML =
      `<p class="state-message is-error">Could not load latest news: ${escapeHtml(err.message)}</p>`;
  }

  try {
    const trending = await getTrendingArticles(6);
    renderTrendingGrid(trending);
  } catch (err) {
    document.getElementById("trending-grid").innerHTML =
      `<p class="state-message is-error">Could not load trending news: ${escapeHtml(err.message)}</p>`;
  }
}

init();
