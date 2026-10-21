import { requireAuth } from "./auth.js?v=upgrade-cta-20261022";
import { getReadingHistory } from "../../services/readingHistoryService.js";
import { formatCount, formatRelativeTime, escapeHtml, thumbHtml } from "./format.js";

function renderHistory(history) {
  const grid = document.getElementById('historyGrid');
  document.getElementById('history-count').textContent = `${history.length} article${history.length === 1 ? '' : 's'}`;
  if (!history.length) {
    grid.innerHTML = '<div class="empty-state"><h2>No reading history yet</h2><p>Articles you read will appear here.</p><a class="button" href="categories.html">Browse news</a></div>';
    return;
  }
  grid.innerHTML = history.map(({article, viewed_at}) => `
    <a class="article-card news-card-link" href="article.html?id=${article.id}">
      <div class="article-card__image">${thumbHtml(article)}</div>
      <div class="article-card__body">
        <span class="badge">${escapeHtml(article.category?.name || 'Uncategorised')}</span>
        <h2>${escapeHtml(article.title || 'Untitled article')}</h2>
        <p>${escapeHtml((article.content || '').slice(0,150))}</p>
        <div class="article-meta"><span>Read ${formatRelativeTime(viewed_at)}</span><span>◉ ${formatCount(article.view_count)} views</span><span>♡ ${formatCount(article.reaction_count)}</span></div>
      </div>
    </a>`).join('');
}

async function init() {
  const grid = document.getElementById('historyGrid');
  grid.setAttribute('aria-busy', 'true');
  document.getElementById('history-count').textContent = '';
  grid.innerHTML = '<div class="loading-panel" role="status">Loading reading history…</div>';
  try {
    const user = await requireAuth('welcome.html');
    if (!user) return;
    await renderHistory(await getReadingHistory());
  } catch (error) {
    grid.innerHTML = `<div class="empty-state" role="alert"><h3>Unable to Load History</h3><p>${escapeHtml(error.message)}</p><button type="button" id="retry-history" class="button">Try again</button></div>`;
    document.getElementById('retry-history').addEventListener('click', init);
  } finally {
    grid.setAttribute('aria-busy', 'false');
  }
}

init();
