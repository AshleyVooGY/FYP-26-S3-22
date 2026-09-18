import { requireAdmin } from "./auth.js";
import {
  getAnalyticsOverview,
  getArticleViewStats,
  getCategoryPopularity
} from "../../services/feature6Service.js";
import { formatCount, escapeHtml, forbiddenStateHtml } from "./format.js";

function renderDashboard(overview, topArticles, topCategories) {
  const slot = document.getElementById("analytics-slot");

  const cards = [
    ["Total Views", formatCount(overview.total_views)],
    ["Published Articles", formatCount(overview.total_articles)],
    ["Avg Views / Article", formatCount(overview.avg_views_per_article)],
    ["Categories", formatCount(overview.total_categories)]
  ];

  const articleRows = topArticles
    .map(
      (a, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><a href="article-analytics.html?id=${a.id}">${escapeHtml(a.title)}</a></td>
        <td><span class="badge">${escapeHtml(a.category)}</span></td>
        <td class="is-numeric">${formatCount(a.view_count)}</td>
      </tr>
    `
    )
    .join("");

  const categoryRows = topCategories
    .slice(0, 5)
    .map(
      (c, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(c.category_name)}</td>
        <td class="is-numeric">${formatCount(c.article_count)}</td>
        <td class="is-numeric">${formatCount(c.total_views)}</td>
      </tr>
    `
    )
    .join("");

  slot.innerHTML = `
    <div class="summary-cards">
      ${cards
        .map(
          ([label, value]) => `
          <div class="summary-card">
            <p class="summary-card__label">${label}</p>
            <p class="summary-card__value">${value}</p>
          </div>
        `
        )
        .join("")}
    </div>

    <div class="analytics-grid">
      <div class="analytics-panel">
        <div class="analytics-panel__head">
          <h2 class="section-title">Top Articles by Views</h2>
          <a class="view-more" href="analytics-articles.html">View All →</a>
        </div>
        ${
          articleRows
            ? `<table class="data-table">
                <thead><tr><th>#</th><th>Title</th><th>Category</th><th class="is-numeric">Views</th></tr></thead>
                <tbody>${articleRows}</tbody>
              </table>`
            : '<p class="state-message">No published articles yet.</p>'
        }
      </div>

      <div class="analytics-panel">
        <div class="analytics-panel__head">
          <h2 class="section-title">Top Categories</h2>
          <a class="view-more" href="category-analytics.html">View All →</a>
        </div>
        ${
          categoryRows
            ? `<table class="data-table">
                <thead><tr><th>#</th><th>Category</th><th class="is-numeric">Articles</th><th class="is-numeric">Views</th></tr></thead>
                <tbody>${categoryRows}</tbody>
              </table>`
            : '<p class="state-message">No categories yet.</p>'
        }
      </div>
    </div>
  `;
}

async function init() {
  const admin = await requireAdmin();
  const slot = document.getElementById("analytics-slot");

  if (!admin) {
    slot.innerHTML = forbiddenStateHtml();
    return;
  }

  slot.innerHTML = '<p class="state-message">Loading analytics…</p>';

  try {
    const [overview, topArticles, topCategories] = await Promise.all([
      getAnalyticsOverview(),
      getArticleViewStats({ sort: "views_desc", limit: 5 }),
      getCategoryPopularity()
    ]);

    renderDashboard(overview, topArticles, topCategories);
  } catch (err) {
    slot.innerHTML = `<p class="state-message is-error">Could not load analytics: ${escapeHtml(err.message)}</p>`;
  }
}

init();
