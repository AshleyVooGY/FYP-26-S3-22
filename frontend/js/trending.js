import { requireAuth } from "./auth.js?v=required-category-20261022";
import { getTrendingArticles } from "../../services/feature5Service.js?v=activity-windows-20261027";
import { formatCount, formatRelativeTime, escapeHtml, thumbHtml } from "./format.js";
import { renderPagination as renderPaginationControl } from "./pagination.js";

const PAGE_SIZE = 5;
const FETCH_LIMIT = 50;

const TABS = [
  { key: 'trending', label: 'Trending Now', fetch: () => getTrendingArticles(FETCH_LIMIT, '24h'),
    note: 'Ranked by activity in the last 24 hours. Counts shown are lifetime totals.' },
  { key: 'week', label: 'This Week', fetch: () => getTrendingArticles(FETCH_LIMIT, '7d'),
    note: 'Ranked by activity in the last 7 days. Counts shown are lifetime totals.' },
  { key: 'month', label: 'This Month', fetch: () => getTrendingArticles(FETCH_LIMIT, '30d'),
    note: 'Ranked by activity in the last 30 days. Counts shown are lifetime totals.' }
];

const state = {
  tabKey: TABS[0].key,
  sort: "popularity",
  page: 1,
  cache: {}
};

function sortArticles(articles, sort) {
  const copy = [...articles];

  if (sort === "recent") {
    copy.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
  } else if (sort === "views") {
    copy.sort((a, b) => b.view_count - a.view_count);
  }
  // "popularity" keeps the order already returned by the backend function.

  return copy;
}

function renderTabs() {
  const tabsEl = document.getElementById("tabs");
  tabsEl.innerHTML = TABS.map(
    (tab) => `
      <button class="tab ${tab.key === state.tabKey ? "is-active" : ""}" data-tab="${tab.key}">
        ${escapeHtml(tab.label)}
      </button>
    `
  ).join("");

  tabsEl.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.tabKey = btn.dataset.tab;
      state.page = 1;
      renderTabs();
      renderList();
    });
  });

  document.getElementById("tab-note").textContent =
    TABS.find((t) => t.key === state.tabKey)?.note ?? "";
}

function renderPagination(totalItems) {
  renderPaginationControl(document.getElementById("pagination"), {
    page: state.page,
    totalItems,
    pageSize: PAGE_SIZE,
    onPageChange: (page) => {
      state.page = page;
      renderRows();
      renderPagination(totalItems);
    }
  });
}

function rowHtml(article, rank) {
  return `
    <a class="rank-row" href="article.html?id=${article.id}">
      <span class="rank-row__num">${rank}</span>
      <div class="thumb">${thumbHtml(article)}</div>
      <div class="rank-row__body">
        <span class="badge">${escapeHtml(article.category)}</span>
        <p class="rank-row__title">${escapeHtml(article.title)}</p>
      </div>
      <div class="rank-row__meta">
        <span>${formatRelativeTime(article.published_at)}</span>
        <span>👁 ${formatCount(article.view_count)}</span>
        <span>♡ ${formatCount(article.reaction_count)}</span>
      </div>
    </a>
  `;
}

function renderRows() {
  const listEl = document.getElementById("rank-list");
  const items = state.cache[state.tabKey] ?? [];
  const sorted = sortArticles(items, state.sort);
  const start = (state.page - 1) * PAGE_SIZE;
  const pageItems = sorted.slice(start, start + PAGE_SIZE);

  if (pageItems.length === 0) {
    listEl.innerHTML = '<p class="state-message">No recorded activity in this time range yet. Try another time range.</p>';
    return;
  }

  listEl.innerHTML = pageItems
    .map((article, i) => rowHtml(article, start + i + 1))
    .join("");
}

async function renderList() {
  const requestedTab = state.tabKey;
  const listEl = document.getElementById("rank-list");

  if (!state.cache[state.tabKey]) {
    listEl.innerHTML = '<p class="state-message">Loading…</p>';
    document.getElementById('pagination').innerHTML = '';
    try {
      const tab = TABS.find((t) => t.key === state.tabKey);
      state.cache[state.tabKey] = await tab.fetch();
    } catch (err) {
      if (state.tabKey !== requestedTab) return;
      listEl.innerHTML = `<p class="state-message is-error">Could not load articles: ${escapeHtml(err.message)}</p>`;
      document.getElementById("pagination").innerHTML = "";
      return;
    }
  }

  if (state.tabKey !== requestedTab) return;
  renderRows();
  renderPagination(state.cache[state.tabKey].length);
}

document.getElementById("sort-select").addEventListener("change", (e) => {
  state.sort = e.target.value;
  state.page = 1;
  if (state.cache[state.tabKey]) {
    renderRows();
    renderPagination(state.cache[state.tabKey].length);
  }
});

async function init() {
  const user = await requireAuth("welcome.html");
  if (!user) return;

  renderTabs();
  renderList();
}

init();
