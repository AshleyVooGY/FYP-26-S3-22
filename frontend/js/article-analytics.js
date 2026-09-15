import { requireAdmin } from "./auth.js";
import { getArticleAnalyticsSummary, getArticleViewTrend } from "../../services/feature6Service.js";
import { formatCount, formatRelativeTime, escapeHtml, forbiddenStateHtml } from "./format.js";

const params = new URLSearchParams(window.location.search);
const articleId = params.get("id");

function trendChartHtml(trend) {
  const max = Math.max(1, ...trend.map((d) => Number(d.view_count)));

  const bars = trend
    .map((d) => {
      const heightPct = Math.round((Number(d.view_count) / max) * 100);
      const label = new Date(d.view_date).toLocaleDateString(undefined, {
        month: "numeric",
        day: "numeric"
      });
      return `
        <div class="trend-chart__bar" title="${escapeHtml(label)}: ${d.view_count} views">
          <div class="trend-chart__col" style="height:${Math.max(heightPct, 2)}%"></div>
          <span class="trend-chart__label">${escapeHtml(label)}</span>
        </div>
      `;
    })
    .join("");

  return `<div class="trend-chart">${bars}</div>`;
}

function renderArticleAnalytics(summary, trend) {
  const slot = document.getElementById("article-analytics-slot");

  const cards = [
    ["Total Views", formatCount(summary.view_count)],
    ["Registered Views", formatCount(summary.registered_views)],
    ["Guest Views", formatCount(summary.guest_views)],
    ["Reactions", formatCount(summary.reaction_count)]
  ];

  slot.innerHTML = `
    <div class="article-analytics-head">
      <div>
        <span class="badge">${escapeHtml(summary.category)}</span>
        <h1>${escapeHtml(summary.title)}</h1>
        <p class="state-message" style="padding:0;">Published ${formatRelativeTime(summary.published_at)}</p>
      </div>
    </div>

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

    <div class="analytics-panel">
      <div class="analytics-panel__head">
        <h2 class="section-title">Views — Last 14 Days</h2>
      </div>
      ${trendChartHtml(trend)}
    </div>
  `;
}

async function init() {
  const admin = await requireAdmin();
  const slot = document.getElementById("article-analytics-slot");

  if (!admin) {
    slot.innerHTML = forbiddenStateHtml();
    return;
  }

  if (!articleId) {
    slot.innerHTML = '<p class="state-message is-error">No article was specified.</p>';
    return;
  }

  slot.innerHTML = '<p class="state-message">Loading…</p>';

  try {
    const [summary, trend] = await Promise.all([
      getArticleAnalyticsSummary(articleId),
      getArticleViewTrend(articleId, 14)
    ]);

    if (!summary) {
      slot.innerHTML = '<p class="state-message is-error">This article is unavailable.</p>';
      return;
    }

    renderArticleAnalytics(summary, trend);
  } catch (err) {
    slot.innerHTML = `<p class="state-message is-error">Could not load analytics: ${escapeHtml(err.message)}</p>`;
  }
}

init();
