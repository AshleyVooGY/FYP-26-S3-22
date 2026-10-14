import { requireAuth } from "./auth.js";
import { escapeHtml, formatCount, formatRelativeTime, thumbHtml } from "./format.js";
import { getClassifications, searchArticles } from "../features-01-02-10/featureService.js";

const app = document.getElementById("search-app");
const initialKeyword = new URLSearchParams(location.search).get("q") || "";
const state = {
  categories: [],
  filters: { keyword: initialKeyword, categoryId: "", startDate: "", endDate: "", sort: "latest" }
};
let requestToken = 0;

function resultCard(article) {
  return `<article class="result-card">
    <div class="article-card__image">${thumbHtml(article)}</div>
    <div><h2>${escapeHtml(article.title || "Untitled article")}</h2><p>${escapeHtml((article.content || "No summary available.").slice(0, 220))}</p><div class="article-meta"><span>${formatRelativeTime(article.published_at)}</span><span>◉ ${formatCount(article.view_count)} views</span><span>♡ ${formatCount(article.reaction_count)}</span></div></div>
    <a class="button result-card__action" href="article.html?id=${article.id}">Read article</a>
  </article>`;
}

function renderPage() {
  app.innerHTML = `<header class="page-head"><div><h1>Search &amp; Filter News</h1><p>Search titles, content, categories and tags, then refine the results.</p></div><span id="result-count"></span></header>
    <form id="search-form">
      <div class="toolbar"><div class="field"><label for="keyword">Keyword</label><div class="button-row"><input id="keyword" name="keyword" type="search" value="${escapeHtml(state.filters.keyword)}" placeholder="Search news by keyword…"><button class="button button--primary" type="submit">Search</button></div></div></div>
      <div class="toolbar filter-row">
        <div class="field"><label for="category">Category</label><select id="category" name="category"><option value="">All categories</option>${state.categories.map((item) => `<option value="${item.id}" ${String(state.filters.categoryId) === String(item.id) ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></div>
        <div class="field"><label for="start-date">From date</label><input id="start-date" name="startDate" type="date" value="${state.filters.startDate}"></div>
        <div class="field"><label for="end-date">To date</label><input id="end-date" name="endDate" type="date" value="${state.filters.endDate}"></div>
        <div><span class="field-label">Sort by</span><div class="sort-group">${["latest", "oldest", "popularity"].map((sort) => `<button class="sort-button ${state.filters.sort === sort ? "is-active" : ""}" type="button" data-sort="${sort}">${sort[0].toUpperCase() + sort.slice(1)}</button>`).join("")}</div></div>
        <div class="button-row"><button class="button button--primary" type="submit">Apply filter</button><button id="reset-search" class="button" type="button">Reset</button></div>
      </div>
    </form>
    <div id="search-results" class="result-list"><div class="loading-panel">Searching…</div></div>`;

  const form = document.getElementById("search-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = new FormData(form);
    state.filters = { ...state.filters, keyword: String(values.get("keyword") || ""), categoryId: values.get("category"), startDate: values.get("startDate"), endDate: values.get("endDate") };
    const url = new URL(location.href);
    state.filters.keyword ? url.searchParams.set("q", state.filters.keyword) : url.searchParams.delete("q");
    history.replaceState(null, "", url);
    await runSearch();
  });
  app.querySelectorAll("[data-sort]").forEach((button) => button.addEventListener("click", () => {
    state.filters.sort = button.dataset.sort;
    app.querySelectorAll("[data-sort]").forEach((item) => item.classList.toggle("is-active", item === button));
  }));
  document.getElementById("reset-search").addEventListener("click", async () => {
    state.filters = { keyword: "", categoryId: "", startDate: "", endDate: "", sort: "latest" };
    history.replaceState(null, "", "search.html");
    renderPage();
    await runSearch();
  });
}

async function runSearch() {
  const token = ++requestToken;
  const results = document.getElementById("search-results");
  results.innerHTML = '<div class="loading-panel">Searching…</div>';
  try {
    const articles = await searchArticles(state.filters);
    if (token !== requestToken) return;
    document.getElementById("result-count").textContent = `${articles.length} result${articles.length === 1 ? "" : "s"}`;
    results.innerHTML = articles.length ? articles.map(resultCard).join("") : '<div class="empty-state"><h2>No results found</h2><p>Try another keyword or clear one of the filters.</p></div>';
  } catch (error) {
    console.error(error);
    results.innerHTML = `<div class="empty-state"><h2>Search unavailable</h2><p>${escapeHtml(error?.message || "Please try again.")}</p><button class="button" data-retry>Try again</button></div>`;
    results.querySelector("[data-retry]")?.addEventListener("click", runSearch);
  }
}

async function init() {
  const user = await requireAuth("welcome.html");
  if (!user) return;
  const classifications = await getClassifications();
  state.categories = classifications.categories;
  document.getElementById("top-search").value = state.filters.keyword;
  renderPage();
  await runSearch();
}

init().catch((error) => {
  console.error(error);
  app.innerHTML = `<div class="empty-state"><h2>Search unavailable</h2><p>${escapeHtml(error?.message || "Please try again.")}</p></div>`;
});
