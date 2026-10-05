import { getCurrentUser } from "./auth.js";
import { getTrendingArticles, getPopularArticles } from "../../services/feature5Service.js";
import { escapeHtml, formatCount } from "./format.js";

const HEADLINE_COUNT = 3;

function renderHeadlines(articles) {
  const slot = document.getElementById("headline-slot");

  if (!articles || articles.length === 0) {
    slot.innerHTML = '<p class="state-message">Check back soon for today\'s top stories.</p>';
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
    if (trending && trending.length > 0) {
      renderHeadlines(trending);
      return;
    }

    const popular = await getPopularArticles(HEADLINE_COUNT);
    renderHeadlines(popular);
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
