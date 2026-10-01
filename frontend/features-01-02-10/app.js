import {
  getViewer,
  getClassifications,
  getPublishedArticles,
  getArticlesByClassification,
  searchArticles,
  getArticle,
  getRecommendations,
  createClassification,
  updateClassification,
  deleteClassification
} from "./featureService.js";

const app = document.getElementById("app");
const state = {
  viewer: { user: null, isAdmin: false },
  categories: [],
  tags: [],
  browseType: "all",
  browseId: null,
  search: { keyword: "", categoryId: "", startDate: "", endDate: "", sort: "latest" }
};
let renderToken = 0;

const escapeHtml = (value = "") => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const formatDate = (value) => value
  ? new Intl.DateTimeFormat("en-SG", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value))
  : "Date unavailable";

const formatCount = (value) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value) || 0);
const excerpt = (content = "", length = 145) => content.length > length ? `${content.slice(0, length).trim()}…` : content;

function imageMarkup(article) {
  return article.featured_image_url
    ? `<img src="${escapeHtml(article.featured_image_url)}" alt="" loading="lazy">`
    : `<span aria-label="No article image">▧</span>`;
}

function toast(message, isError = false) {
  const item = document.createElement("div");
  item.className = `toast${isError ? " is-error" : ""}`;
  item.textContent = message;
  document.getElementById("toast-region").append(item);
  setTimeout(() => item.remove(), 3600);
}

function errorMessage(error, fallback = "Unable to load this content.") {
  console.error(error);
  const message = error?.message || fallback;
  app.innerHTML = `<div class="empty-state"><h2>Something went wrong</h2><p>${escapeHtml(message)}</p><button class="button" data-retry>Try again</button></div>`;
  app.querySelector("[data-retry]")?.addEventListener("click", route);
}

function articleMeta(article) {
  return `<div class="article-meta"><span>${formatDate(article.published_at)}</span><span>◉ ${formatCount(article.view_count)} views</span><span>♡ ${formatCount(article.reaction_count)}</span></div>`;
}

function card(article) {
  return `<article class="article-card">
    <div class="article-card__image">${imageMarkup(article)}</div>
    <div class="article-card__body">
      <span class="badge">News</span>
      <h2>${escapeHtml(article.title || "Untitled article")}</h2>
      <p>${escapeHtml(excerpt(article.content || "No summary available."))}</p>
      ${articleMeta(article)}
      <div class="article-card__actions"><a class="button" href="#article/${article.id}">Read article</a></div>
    </div>
  </article>`;
}

function resultCard(article) {
  return `<article class="result-card">
    <div class="article-card__image">${imageMarkup(article)}</div>
    <div><h2>${escapeHtml(article.title || "Untitled article")}</h2><p>${escapeHtml(excerpt(article.content || "No summary available.", 210))}</p>${articleMeta(article)}</div>
    <a class="button result-card__action" href="#article/${article.id}">Read article</a>
  </article>`;
}

function setActiveNavigation(page) {
  document.querySelectorAll("[data-nav],[data-side]").forEach((link) => link.classList.toggle("is-active", link.dataset.nav === page || link.dataset.side === page));
  document.getElementById("category-menu-button").classList.toggle("is-active", page === "browse" || page === "manage");
}

async function refreshClassifications() {
  const data = await getClassifications();
  state.categories = data.categories;
  state.tags = data.tags;
}

async function renderBrowse() {
  const token = ++renderToken;
  setActiveNavigation("browse");
  app.innerHTML = `<div class="loading-panel">Loading categories and articles…</div>`;
  try {
    await refreshClassifications();
    const articles = state.browseType === "all"
      ? await getPublishedArticles()
      : await getArticlesByClassification(state.browseType, state.browseId);
    if (token !== renderToken) return;

    const selected = [...state.categories.map((x) => ({ ...x, type: "category" })), ...state.tags.map((x) => ({ ...x, type: "tag" }))]
      .find((item) => item.type === state.browseType && String(item.id) === String(state.browseId));

    app.innerHTML = `
      <header class="page-head"><div><h1>${selected ? escapeHtml(selected.name) : "Browse News"}</h1><p>Explore published articles by category or tag.</p></div><span>${articles.length} article${articles.length === 1 ? "" : "s"}</span></header>
      <section aria-label="Categories"><h2 class="section-title">Categories</h2><div class="classification-bar">
        <button class="classification-chip ${state.browseType === "all" ? "is-active" : ""}" data-classification="all">All news</button>
        ${state.categories.map((item) => `<button class="classification-chip ${state.browseType === "category" && String(state.browseId) === String(item.id) ? "is-active" : ""}" data-classification="category" data-id="${item.id}">${escapeHtml(item.name)}</button>`).join("")}
      </div></section>
      <section aria-label="Tags"><h2 class="section-title">Tags</h2><div class="classification-bar">
        ${state.tags.length ? state.tags.map((item) => `<button class="classification-chip ${state.browseType === "tag" && String(state.browseId) === String(item.id) ? "is-active" : ""}" data-classification="tag" data-id="${item.id}">#${escapeHtml(item.name)}</button>`).join("") : '<span class="state-message">No tags are available yet.</span>'}
      </div></section>
      ${articles.length ? `<div class="article-grid">${articles.map(card).join("")}</div>` : '<div class="empty-state"><h2>No matching articles</h2><p>There are no published articles under this classification yet.</p></div>'}`;

    app.querySelectorAll("[data-classification]").forEach((button) => button.addEventListener("click", async () => {
      state.browseType = button.dataset.classification;
      state.browseId = button.dataset.id || null;
      await renderBrowse();
    }));
  } catch (error) { if (token === renderToken) errorMessage(error); }
}

function searchTemplate() {
  return `<header class="page-head"><div><h1>Search &amp; Filter News</h1><p>Search titles, content, categories and tags, then refine the results.</p></div><span id="result-count"></span></header>
    <form id="search-form">
      <div class="toolbar"><div class="field"><label for="keyword">Keyword</label><div class="button-row"><input id="keyword" name="keyword" type="search" value="${escapeHtml(state.search.keyword)}" placeholder="Search news by keyword…"><button class="button button--primary" type="submit">Search</button></div></div></div>
      <div class="toolbar filter-row">
        <div class="field"><label for="category">Category</label><select id="category" name="category"><option value="">All categories</option>${state.categories.map((item) => `<option value="${item.id}" ${String(state.search.categoryId) === String(item.id) ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></div>
        <div class="field"><label for="start-date">From date</label><input id="start-date" name="startDate" type="date" value="${state.search.startDate}"></div>
        <div class="field"><label for="end-date">To date</label><input id="end-date" name="endDate" type="date" value="${state.search.endDate}"></div>
        <div><span class="field-label">Sort by</span><div class="sort-group">${["latest", "oldest", "popularity"].map((sort) => `<button class="sort-button ${state.search.sort === sort ? "is-active" : ""}" type="button" data-sort="${sort}">${sort[0].toUpperCase() + sort.slice(1)}</button>`).join("")}</div></div>
        <div class="button-row"><button class="button button--primary" type="submit">Apply filter</button><button id="reset-search" class="button" type="button">Reset</button></div>
      </div>
    </form>
    <div id="search-results" class="result-list"><div class="loading-panel">Searching…</div></div>`;
}

async function runSearch() {
  const token = renderToken;
  const results = document.getElementById("search-results");
  results.innerHTML = '<div class="loading-panel">Searching…</div>';
  try {
    const articles = await searchArticles(state.search);
    if (token !== renderToken || !document.getElementById("search-results")) return;
    document.getElementById("result-count").textContent = `${articles.length} result${articles.length === 1 ? "" : "s"}`;
    results.innerHTML = articles.length ? articles.map(resultCard).join("") : '<div class="empty-state"><h2>No results found</h2><p>Try another keyword or clear one of the filters.</p></div>';
  } catch (error) {
    results.innerHTML = `<div class="empty-state"><h2>Search unavailable</h2><p>${escapeHtml(error.message)}</p></div>`;
  }
}

async function renderSearch(keyword = null) {
  const token = ++renderToken;
  setActiveNavigation("search");
  if (keyword !== null) state.search.keyword = keyword;
  try { if (!state.categories.length) await refreshClassifications(); } catch (error) { if (token === renderToken) errorMessage(error); return; }
  if (token !== renderToken) return;
  app.innerHTML = searchTemplate();
  const form = document.getElementById("search-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = new FormData(form);
    state.search = { ...state.search, keyword: values.get("keyword"), categoryId: values.get("category"), startDate: values.get("startDate"), endDate: values.get("endDate") };
    await runSearch();
  });
  app.querySelectorAll("[data-sort]").forEach((button) => button.addEventListener("click", () => {
    state.search.sort = button.dataset.sort;
    app.querySelectorAll("[data-sort]").forEach((item) => item.classList.toggle("is-active", item === button));
  }));
  document.getElementById("reset-search").addEventListener("click", async () => {
    state.search = { keyword: "", categoryId: "", startDate: "", endDate: "", sort: "latest" };
    await renderSearch();
  });
  await runSearch();
}

function manageRows(items, type) {
  return items.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${type === "tag" ? "Tag" : "Category"}</td><td><div class="table-actions"><button class="button" data-edit data-type="${type}" data-id="${item.id}" data-name="${escapeHtml(item.name)}">Edit</button><button class="button button--danger" data-delete data-type="${type}" data-id="${item.id}" data-name="${escapeHtml(item.name)}">Delete</button></div></td></tr>`).join("");
}

async function renderManage() {
  const token = ++renderToken;
  setActiveNavigation("manage");
  try { await refreshClassifications(); } catch (error) { if (token === renderToken) errorMessage(error); return; }
  if (token !== renderToken) return;
  const disabled = !state.viewer.isAdmin ? "disabled" : "";
  app.innerHTML = `<header class="page-head"><div><h1>Manage Categories &amp; Tags</h1><p>Create, view, edit and delete article classifications.</p></div></header>
    ${state.viewer.isAdmin ? "" : '<div class="status-banner">Administrator sign-in is required to create, edit or delete categories and tags. Browsing remains available to everyone.</div>'}
    <div class="manage-grid"><section class="panel"><h2>Create category/tag</h2><form id="create-form"><div class="field"><label for="classification-name">Name</label><input id="classification-name" name="name" maxlength="60" placeholder="Enter a unique name" ${disabled} required></div><p class="field-label">Type</p><div class="button-row"><label><input type="radio" name="type" value="category" checked ${disabled}> Category</label><label><input type="radio" name="type" value="tag" ${disabled}> Tag</label></div><div class="button-row" style="margin-top:18px"><button class="button button--primary" ${disabled}>Save</button><button class="button" type="reset" ${disabled}>Cancel</button></div></form></section>
    <section class="panel"><h2>Existing categories and tags</h2><div style="overflow:auto"><table class="classification-table"><thead><tr><th>Name</th><th>Type</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${manageRows(state.categories, "category")}${manageRows(state.tags, "tag")}</tbody></table></div></section></div>`;

  document.getElementById("create-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const name = String(values.get("name") || "").trim();
    if (!name) { toast("Please enter a category or tag name.", true); return; }
    try { await createClassification(values.get("type"), name); toast(`${name} was created.`); await renderManage(); } catch (error) { toast(error.message.includes("duplicate") ? "That name already exists." : error.message, true); }
  });
  app.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => openEditModal(button.dataset)));
  app.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => openDeleteModal(button.dataset)));
}

function closeModal() { document.querySelector(".modal-backdrop")?.remove(); }
function openEditModal(item) {
  if (!state.viewer.isAdmin) { toast("Administrator sign-in is required.", true); return; }
  document.body.insertAdjacentHTML("beforeend", `<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true"><h2>Edit ${item.type}</h2><form id="edit-form"><div class="field"><label for="edit-name">Name</label><input id="edit-name" name="name" value="${escapeHtml(item.name)}" required maxlength="60"></div><div class="button-row" style="margin-top:18px"><button class="button button--primary">Save changes</button><button class="button" type="button" data-close>Cancel</button></div></form></div></div>`);
  document.querySelector("[data-close]").addEventListener("click", closeModal);
  document.getElementById("edit-form").addEventListener("submit", async (event) => { event.preventDefault(); const name = String(new FormData(event.currentTarget).get("name") || "").trim(); if (!name) return; try { await updateClassification(item.type, item.id, name); closeModal(); toast("Changes saved."); await renderManage(); } catch (error) { toast(error.message, true); } });
}
function openDeleteModal(item) {
  if (!state.viewer.isAdmin) { toast("Administrator sign-in is required.", true); return; }
  document.body.insertAdjacentHTML("beforeend", `<div class="modal-backdrop"><div class="modal" role="alertdialog" aria-modal="true"><h2>Delete ${item.type}</h2><p>Are you sure you want to delete <strong>${escapeHtml(item.name)}</strong>? This cannot be undone.</p><div class="button-row"><button class="button button--danger" data-confirm-delete>Yes, delete</button><button class="button" data-close>No</button></div></div></div>`);
  document.querySelector("[data-close]").addEventListener("click", closeModal);
  document.querySelector("[data-confirm-delete]").addEventListener("click", async () => { try { await deleteClassification(item.type, item.id); closeModal(); toast(`${item.name} was deleted.`); await renderManage(); } catch (error) { toast(error.message, true); } });
}

async function renderArticle(articleId) {
  const token = ++renderToken;
  setActiveNavigation("article");
  app.innerHTML = '<div class="loading-panel">Loading article and recommendations…</div>';
  try {
    const [article, recommendations] = await Promise.all([getArticle(articleId), getRecommendations(articleId, 6)]);
    if (token !== renderToken) return;
    app.innerHTML = `<a class="back-link" href="#browse">← Back to articles</a><div class="article-layout"><article class="article-panel"><span class="badge">Published</span><h1>${escapeHtml(article.title)}</h1>${articleMeta(article)}${article.featured_image_url ? `<img class="hero-image" src="${escapeHtml(article.featured_image_url)}" alt="">` : ""}<div class="article-copy">${escapeHtml(article.content || "No article content available.")}</div></article>
      <aside class="article-panel"><h2>Recommended For You</h2><p class="state-message">Related published articles based on shared categories and tags.</p><div class="recommendation-list">${recommendations.length ? recommendations.map((item) => `<a class="recommendation-item" href="#article/${item.id}"><div class="article-card__image">${imageMarkup(item)}</div><div><h3>${escapeHtml(item.title)}</h3><div class="article-meta"><span>${formatDate(item.published_at)}</span><span>◉ ${formatCount(item.view_count)}</span></div></div></a>`).join("") : '<div class="empty-state">No related articles were found.</div>'}</div></aside></div>`;
  } catch (error) { if (token === renderToken) errorMessage(error); }
}

async function route() {
  window.scrollTo({ top: 0, left: 0 });
  const routeName = location.hash.slice(1) || "browse";
  if (routeName.startsWith("article/")) return renderArticle(routeName.split("/")[1]);
  if (routeName === "search") return renderSearch();
  if (routeName === "manage") return renderManage();
  return renderBrowse();
}

const quickSearch = document.getElementById("quick-search");
quickSearch.addEventListener("focus", () => {
  if (location.hash !== "#search") location.hash = "search";
});
document.getElementById("quick-search-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const keyword = quickSearch.value;
  if (location.hash !== "#search") location.hash = "search";
  await renderSearch(keyword);
});

const menuButton = document.getElementById("category-menu-button");
const menu = document.getElementById("category-menu");
menuButton.addEventListener("click", () => { menu.hidden = !menu.hidden; menuButton.setAttribute("aria-expanded", String(!menu.hidden)); });
document.querySelector("[data-open-browse]").addEventListener("click", () => { menu.hidden = true; location.hash = "browse"; });
document.querySelector("[data-open-manage]").addEventListener("click", () => { menu.hidden = true; location.hash = "manage"; });
document.addEventListener("click", (event) => { if (!event.target.closest(".category-menu")) { menu.hidden = true; menuButton.setAttribute("aria-expanded", "false"); } });
window.addEventListener("hashchange", route);

try {
  state.viewer = await getViewer();
  document.getElementById("user-label").textContent = state.viewer.displayName || "Guest";
} catch (error) { console.error(error); }
route();
