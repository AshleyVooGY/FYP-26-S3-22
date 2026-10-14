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
  return `<a class="result-card news-card-link" href="article.html?id=${article.id}">
    <div class="article-card__image">${thumbHtml(article)}</div>
    <div><h2>${escapeHtml(article.title || "Untitled article")}</h2><p>${escapeHtml((article.content || "No summary available.").slice(0, 220))}</p><div class="article-meta"><span>${formatRelativeTime(article.published_at)}</span><span>◉ ${formatCount(article.view_count)} views</span><span>♡ ${formatCount(article.reaction_count)}</span></div></div>
  </a>`;
}

function renderPage() {
  app.innerHTML = `<header class="page-head"><div><h1>Search &amp; Filter News</h1><p>Search titles, content, categories and tags, then refine the results.</p></div><span id="result-count"></span></header>
    <form id="search-form">
      <div class="toolbar search-panel"><div class="field"><label for="keyword">Keyword</label><div class="button-row"><input id="keyword" name="keyword" type="search" value="${escapeHtml(state.filters.keyword)}" placeholder="Search news by keyword…"><button class="button button--primary" type="submit">Search</button></div></div>
      <div class="filter-row">
        <div class="field"><label for="category">Category</label><select id="category" name="category"><option value="">All categories</option>${state.categories.map((item) => `<option value="${item.id}" ${String(state.filters.categoryId) === String(item.id) ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></div>
        <div class="field"><label for="start-date">From date</label><input id="start-date" name="startDate" type="date" value="${state.filters.startDate}"></div>
        <div class="field"><label for="end-date">To date</label><input id="end-date" name="endDate" type="date" value="${state.filters.endDate}"></div>
        <div><span class="field-label">Sort by</span><div class="sort-group">${["latest", "oldest", "popularity"].map((sort) => `<button class="sort-button ${state.filters.sort === sort ? "is-active" : ""}" type="button" aria-pressed="${state.filters.sort === sort}" data-sort="${sort}">${sort[0].toUpperCase() + sort.slice(1)}</button>`).join("")}</div></div>
        <div class="button-row"><button id="reset-search" class="button" type="button">Browse all news</button></div>
      </div></div>
    </form>
    <div id="active-filters" class="active-filters" aria-label="Applied filters"></div>
    <div id="search-results" class="result-list"><div class="loading-panel">Searching…</div></div>`;

  const form = document.getElementById("search-form");
  function applyForm() {
    if (!form.reportValidity()) return;
    const values = new FormData(form);
    state.filters = { ...state.filters, keyword: String(values.get("keyword") || "").trim(), categoryId: values.get("category"), startDate: values.get("startDate"), endDate: values.get("endDate") };
    syncUrl();
    runSearch();
  }
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    applyForm();
  });
  const start = document.getElementById("start-date");
  const end = document.getElementById("end-date");
  start.addEventListener("change", () => { end.min = start.value; });
  end.addEventListener("change", () => { start.max = end.value; });
  app.querySelectorAll("[data-sort]").forEach((button) => button.addEventListener("click", () => {
    if (!form.reportValidity()) return;
    state.filters.sort = button.dataset.sort;
    app.querySelectorAll("[data-sort]").forEach((item) => {
      item.classList.toggle("is-active", item === button);
      item.setAttribute("aria-pressed", String(item === button));
    });
    applyForm();
  }));
  document.getElementById("reset-search").addEventListener("click", () => resetSearch(false));
}

function syncUrl() {
  const url = new URL(location.href);
  state.filters.keyword ? url.searchParams.set("q", state.filters.keyword) : url.searchParams.delete("q");
  history.replaceState(null, "", url);
}

function resetSearch(keepKeyword) {
  state.filters = { keyword: keepKeyword ? state.filters.keyword : "", categoryId: "", startDate: "", endDate: "", sort: "latest" };
  syncUrl();
  renderPage();
  runSearch();
}

function renderFilters() {
  const labels = {
    keyword: state.filters.keyword ? `Keyword: ${state.filters.keyword}` : "",
    categoryId: state.categories.find(item => String(item.id) === String(state.filters.categoryId))?.name || "",
    startDate: state.filters.startDate ? `From: ${state.filters.startDate}` : "",
    endDate: state.filters.endDate ? `To: ${state.filters.endDate}` : ""
  };
  const region = document.getElementById("active-filters");
  region.innerHTML = Object.entries(labels).filter(([, label]) => label).map(([key, label]) => `<button type="button" class="classification-chip" data-remove="${key}" aria-label="${escapeHtml(`Remove ${label}`)}">${escapeHtml(label)} <span aria-hidden="true">×</span></button>`).join("");
  region.querySelectorAll("[data-remove]").forEach(button => button.addEventListener("click", () => {
    state.filters[button.dataset.remove] = "";
    syncUrl();
    renderPage();
    runSearch();
  }));
}

async function runSearch() {
  const token = ++requestToken;
  const results = document.getElementById("search-results");
  renderFilters();
  document.getElementById("result-count").textContent = "Searching…";
  results.setAttribute("aria-busy", "true");
  results.innerHTML = '<div class="loading-panel">Searching…</div>';
  try {
    const articles = await searchArticles(state.filters);
    if (token !== requestToken) return;
    document.getElementById("result-count").textContent = `${state.filters.keyword ? `Results for “${state.filters.keyword}” · ` : "All news · "}${articles.length} result${articles.length === 1 ? "" : "s"}`;
    results.innerHTML = articles.length ? articles.map(resultCard).join("") : `<div class="empty-state"><h2>${state.filters.keyword ? `No news found for “${escapeHtml(state.filters.keyword)}”` : "No news matches these filters"}</h2><p>Try another keyword or broaden your search.</p><div class="button-row empty-actions">${state.filters.categoryId || state.filters.startDate || state.filters.endDate ? '<button class="button" type="button" data-clear-filters>Clear filters</button>' : ""}<button class="button button--primary" type="button" data-browse>Browse all news</button></div></div>`;
    results.querySelector("[data-clear-filters]")?.addEventListener("click", () => resetSearch(true));
    results.querySelector("[data-browse]")?.addEventListener("click", () => resetSearch(false));
  } catch (error) {
    if (token !== requestToken) return;
    document.getElementById("result-count").textContent = "";
    console.error(error);
    results.innerHTML = `<div class="empty-state"><h2>Search unavailable</h2><p>${escapeHtml(error?.message || "Please try again.")}</p><button class="button" data-retry>Try again</button></div>`;
    results.querySelector("[data-retry]")?.addEventListener("click", runSearch);
  } finally {
    if (token === requestToken) results.setAttribute("aria-busy", "false");
  }
}

async function init() {
  const user = await requireAuth("welcome.html");
  if (!user) return;
  const classifications = await getClassifications();
  state.categories = classifications.categories;
  renderPage();
  await runSearch();
}

init().catch((error) => {
  console.error(error);
  app.innerHTML = `<div class="empty-state"><h2>Search unavailable</h2><p>${escapeHtml(error?.message || "Please try again.")}</p></div>`;
});
