import { getTrendingArticles, getPopularArticles } from "../../services/feature5Service.js";
import { formatCount, formatRelativeTime, escapeHtml, thumbHtml } from "./format.js";
import { renderPagination as renderPaginationControl } from "./pagination.js";

const PAGE_SIZE = 5;
const FETCH_LIMIT = 50;

const TABS = [
  {
    key: "trending",
    label: "Trending Now",
    fetch: () => getTrendingArticles(FETCH_LIMIT),
    note: "Ranked from articles published in the last 7 days."
  },
  {
    key: "popular-today",
    label: "Popular Today",
    fetch: () => getPopularArticles(FETCH_LIMIT),
    note: "Ranked by overall popularity across all published articles."
  },
  {
    key: "popular-week",
    label: "This Week",
    fetch: () => getPopularArticles(FETCH_LIMIT),
    note: "Ranked by overall popularity across all published articles."
  },
  {
    key: "popular-month",
    label: "This Month",
    fetch: () => getPopularArticles(FETCH_LIMIT),
    note: "Ranked by overall popularity across all published articles."
  }
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
    listEl.innerHTML = '<p class="state-message">No articles to show yet.</p>';
    return;
  }

  listEl.innerHTML = pageItems
    .map((article, i) => rowHtml(article, start + i + 1))
    .join("");
}

async function renderList() {
  const listEl = document.getElementById("rank-list");

  if (!state.cache[state.tabKey]) {
    listEl.innerHTML = '<p class="state-message">Loading…</p>';
    try {
      const tab = TABS.find((t) => t.key === state.tabKey);
      state.cache[state.tabKey] = await tab.fetch();
    } catch (err) {
      listEl.innerHTML = `<p class="state-message is-error">Could not load articles: ${escapeHtml(err.message)}</p>`;
      document.getElementById("pagination").innerHTML = "";
      return;
    }
  }

  renderRows();
  renderPagination(state.cache[state.tabKey].length);
}

document.getElementById("sort-select").addEventListener("change", (e) => {
  state.sort = e.target.value;
  state.page = 1;
  renderRows();
});

renderTabs();
renderList();
