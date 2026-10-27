import { getCurrentUser } from "./auth.js?v=required-category-20261022";
import { getTrendingArticles } from "../../services/feature5Service.js?v=activity-windows-20261027";
import { escapeHtml, formatCount } from "./format.js";

const HEADLINE_COUNT = 3;

function renderHeadlines(articles) {
  const slot = document.getElementById("headline-slot");

  if (!articles || articles.length === 0) {
    slot.innerHTML = '<p class="state-message">No recorded activity in the last 24 hours yet.</p>';
    return;
  }

  slot.innerHTML = articles
    .map(
      (article) => `
      <div class="welcome-headline">
        <span class="badge">${escapeHtml(article.category)}</span>
        <p class="welcome-headline__title">${escapeHtml(article.title)}</p>
        <span class="welcome-headline__views">👁 ${formatCount(article.view_count)}</span>
      </div>
    `
    )
    .join("");
}

async function loadHeadlines() {
  try {
    const trending = await getTrendingArticles(HEADLINE_COUNT);
    renderHeadlines(trending);
  } catch {
    renderHeadlines(null);
  }
}

async function init() {
  // Already signed in? Skip the marketing page and go straight to the app.
  const user = await getCurrentUser();
  if (user) {
    window.location.href = "index.html";
    return;
  }

  await loadHeadlines();
}

init();
