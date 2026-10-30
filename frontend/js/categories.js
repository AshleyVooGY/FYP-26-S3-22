import { requireAuth } from "./auth.js?v=account-name-20261029";
import { escapeHtml, formatCount, formatRelativeTime, thumbHtml } from "./format.js";
import {
  getViewer,
  getClassifications,
  getBrowseArticlesPage,
  createClassification,
  updateClassification,
  deleteClassification
} from "../features-01-02-10/featureService.js?v=categories-pagination-20261023";

const app = document.getElementById("categories-app");
const state = {
  viewer: { user: null, isAdmin: false },
  categories: [],
  tags: [],
  type: "all",
  id: null,
  articles: [],
  total: 0,
  pages: [],
  pageIndex: 0,
  paging: false,
  tagsExpanded: false,
  manageQuery: "",
  manageType: "all",
  managePage: 0
};
let requestToken = 0;
let tagResizeObserver = null;

function showToast(message, isError = false) {
  const toast = document.createElement("div");
  toast.className = `toast${isError ? " is-error" : ""}`;
  toast.textContent = message;
  document.getElementById("toast-region").append(toast);
  window.setTimeout(() => toast.remove(), 3600);
}

function showError(error, retry) {
  console.error(error);
  app.innerHTML = `<div class="empty-state"><h2>Unable to load this page</h2><p>${escapeHtml(error?.message || "Please try again.")}</p><button class="button" data-retry>Try again</button></div>`;
  app.querySelector("[data-retry]")?.addEventListener("click", retry);
}

function articleCard(article) {
  return `<a class="article-card news-card-link" href="article.html?id=${article.id}">
    <div class="article-card__image">${thumbHtml(article)}</div>
    <div class="article-card__body">
      <span class="badge">${escapeHtml(article.category?.name || "Uncategorised")}</span>
      <h2>${escapeHtml(article.title || "Untitled article")}</h2>
      <p>${escapeHtml((article.content || "No summary available.").slice(0, 150))}</p>
      <div class="article-meta"><span>${formatRelativeTime(article.published_at)}</span><span>◉ ${formatCount(article.view_count)} views</span><span>♡ ${formatCount(article.reaction_count)}</span></div>
    </div>
  </a>`;
}

async function loadClassifications() {
  const result = await getClassifications();
  state.categories = result.categories;
  state.tags = result.tags;
}

function updateBrowsePaging() {
  const page = state.pages[state.pageIndex];
  const count = app.querySelector('#browse-count');
  const start = state.articles.length ? state.pageIndex * 6 + 1 : 0;
  if (count) count.textContent = `Showing ${start}–${start ? start + state.articles.length - 1 : 0} of ${state.total} article${state.total === 1 ? "" : "s"}`;
  const previous = app.querySelector('#browse-previous'), next = app.querySelector('#browse-next');
  if (previous) previous.disabled = state.paging || state.pageIndex === 0;
  if (next) next.disabled = state.paging || !page?.nextCursor;
  const label = app.querySelector('#browse-page');
  if (label) label.textContent = `Page ${state.pageIndex + 1} of ${Math.max(1, Math.ceil(state.total / 6))}`;
  app.querySelector('#browse-pagination')?.toggleAttribute('hidden', !state.articles.length && state.pageIndex === 0);
  app.querySelector('#browse-grid')?.setAttribute('aria-busy', String(state.paging));
}

function showBrowsePage(index) {
  state.pageIndex = index; state.articles = state.pages[index].articles;
  app.querySelector('#browse-grid').innerHTML = state.articles.map(articleCard).join('');
  updateBrowsePaging();
  app.querySelector('.page-head').scrollIntoView({ block: 'start' });
}

async function changeBrowsePage(index) {
  if (state.paging || index < 0 || index > state.pages.length) return;
  const token = requestToken, status = app.querySelector('#browse-page-status');
  status.textContent = ''; status.classList.remove('is-error');
  app.querySelector('#browse-retry').hidden = true;
  if (state.pages[index]) { showBrowsePage(index); return; }
  const cursor = state.pages.at(-1)?.nextCursor;
  if (!cursor) return;
  state.paging = true; updateBrowsePaging();
  status.textContent = `Loading page ${index + 1}…`;
  try {
    const page = await getBrowseArticlesPage({ type: state.type, id: state.id, cursor });
    if (token !== requestToken) return;
    state.total = page.total;
    if (!page.articles.length) {
      state.pages.at(-1).nextCursor = null;
      status.textContent = 'No further articles are available. Refresh this list for the latest news.';
      return;
    }
    state.pages.push(page); showBrowsePage(index); status.textContent = '';
  } catch (error) {
    if (token !== requestToken) return;
    status.textContent = `Could not load this page: ${error.message} Your current page is still here.`;
    status.classList.add('is-error');
    const retry = app.querySelector('#browse-retry'); retry.hidden = false;
    retry.onclick = () => changeBrowsePage(index);
  } finally {
    if (token === requestToken) { state.paging = false; updateBrowsePaging(); }
  }
}

// Hide complete buttons beyond the second visual row, including keyboard focus.
function updateTagDisclosure() {
  const list = app.querySelector('#browse-tag-list');
  const toggle = app.querySelector('#browse-tags-toggle');
  if (!list || !toggle) return;
  const buttons = [...list.querySelectorAll('[data-type="tag"]')];
  buttons.forEach(button => { button.hidden = false; });
  const rows = [...new Set(buttons.map(button => button.offsetTop))].sort((a, b) => a - b);
  const overflow = buttons.filter(button => rows.indexOf(button.offsetTop) >= 2);
  if (!state.tagsExpanded) overflow.forEach(button => { button.hidden = true; });
  toggle.hidden = overflow.length === 0;
  toggle.textContent = state.tagsExpanded ? 'Show fewer tags' : 'Show all tags';
  toggle.setAttribute('aria-expanded', String(state.tagsExpanded));
  if (buttons.some(button => button.hidden && button === document.activeElement)) toggle.focus();
}

function observeTagDisclosure() {
  updateTagDisclosure();
  const list = app.querySelector('#browse-tag-list');
  let previousWidth = list.getBoundingClientRect().width;
  tagResizeObserver = new ResizeObserver(entries => {
    const width = entries[0].contentRect.width;
    if (Math.abs(width - previousWidth) < 1) return;
    previousWidth = width;
    updateTagDisclosure();
  });
  tagResizeObserver.observe(list);
}

async function renderBrowse() {
  tagResizeObserver?.disconnect();
  const token = ++requestToken;
  const filter = { type: state.type, id: state.id };
  state.paging = false;
  app.innerHTML = '<div class="loading-panel" role="status">Loading categories and articles…</div>';

  try {
    await loadClassifications();
    if (token !== requestToken) return;
    const page = await getBrowseArticlesPage(filter);
    if (token !== requestToken) return;
    state.articles = page.articles; state.total = page.total; state.pages = [page]; state.pageIndex = 0;

    const selected = [...state.categories.map((item) => ({ ...item, type: "category" })), ...state.tags.map((item) => ({ ...item, type: "tag" }))]
      .find((item) => item.type === filter.type && String(item.id) === String(filter.id));

    app.innerHTML = `
      <header class="page-head">
        <div><h1>${selected ? (filter.type === "tag" ? `Articles tagged #${escapeHtml(selected.name)}` : escapeHtml(selected.name)) : "Browse News"}</h1><p>Explore published articles by category or tag.</p></div>
        <div class="button-row"><span id="browse-count" role="status" aria-live="polite"></span>${state.viewer.isAdmin ? '<button class="button" type="button" data-manage>Manage categories & tags</button>' : ""}</div>
      </header>
      <section aria-labelledby="categories-title"><h2 id="categories-title" class="section-title">Categories</h2><div class="classification-bar">
        <button class="classification-chip ${filter.type === "all" ? "is-active" : ""}" data-type="all">All news</button>
        ${state.categories.map((item) => `<button class="classification-chip ${filter.type === "category" && String(filter.id) === String(item.id) ? "is-active" : ""}" data-type="category" data-id="${item.id}">${escapeHtml(item.name)}</button>`).join("")}
      </div></section>
      <section class="browse-tags" aria-labelledby="tags-title">
        <div class="browse-tags__heading"><h2 id="tags-title" class="section-title">Tags</h2>
          ${filter.type === "tag" && selected ? `<button class="classification-chip is-active browse-selected-tag" data-type="all" aria-label="Clear tag filter: ${escapeHtml(selected.name)}">#${escapeHtml(selected.name)} <span aria-hidden="true">×</span></button>` : ""}
        </div>
        <div id="browse-tag-list" class="classification-bar browse-tag-list">
          ${state.tags.length ? state.tags.filter(item => filter.type !== "tag" || String(item.id) !== String(filter.id)).map(item => `<button class="classification-chip" data-type="tag" data-id="${item.id}">#${escapeHtml(item.name)}</button>`).join("") : '<span class="state-message">No tags are available yet.</span>'}
        </div>
        <button id="browse-tags-toggle" class="browse-tags-toggle" type="button" aria-expanded="false" aria-controls="browse-tag-list" hidden>Show all tags</button>
      </section>
      <div class="article-grid" id="browse-grid" aria-busy="false">${page.articles.map(articleCard).join("")}</div>
      ${!page.articles.length ? '<div class="empty-state"><h2>No matching articles</h2><p>There are no published articles under this classification yet.</p></div>' : ''}
      <div class="categories-pagination">
        <nav id="browse-pagination" aria-label="News pages">
          <button id="browse-previous" class="button" type="button">Previous</button>
          <span id="browse-page" aria-live="polite"></span>
          <button id="browse-next" class="button" type="button">Next</button>
        </nav>
        <p id="browse-page-status" role="status" aria-live="polite"></p>
        <button id="browse-retry" class="button" type="button" hidden>Try again</button>
      </div>`;
    updateBrowsePaging();
    observeTagDisclosure();
    app.querySelector('#browse-tags-toggle').addEventListener('click', () => {
      state.tagsExpanded = !state.tagsExpanded;
      updateTagDisclosure();
    });
    app.querySelector('#browse-previous').addEventListener('click', () => changeBrowsePage(state.pageIndex - 1));
    app.querySelector('#browse-next').addEventListener('click', () => changeBrowsePage(state.pageIndex + 1));
    app.querySelectorAll("[data-type]").forEach((button) => button.addEventListener("click", () => {
      state.tagsExpanded = false;
      state.type = button.dataset.type;
      state.id = button.dataset.id || null;
      const query = state.id ? `?type=${state.type}&id=${encodeURIComponent(state.id)}` : '';
      history.replaceState(null, '', `categories.html${query}`);
      renderBrowse();
    }));
    app.querySelector("[data-manage]")?.addEventListener("click", () => {
      history.replaceState(null, "", "categories.html?mode=manage");
      renderManage();
    });
  } catch (error) {
    if (token === requestToken) showError(error, renderBrowse);
  }
}

function managementRows(items, type) {
  return items.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${type === "tag" ? "Tag" : "Category"}</td><td><div class="table-actions"><button class="button" data-edit data-type="${type}" data-id="${item.id}" data-name="${escapeHtml(item.name)}">Edit</button><button class="button button--danger" data-delete data-type="${type}" data-id="${item.id}" data-name="${escapeHtml(item.name)}">Delete</button></div></td></tr>`).join("");
}

function updateManagementList() {
  const query = state.manageQuery.trim().toLocaleLowerCase();
  const items = [
    ...state.categories.map(item => ({ ...item, type: 'category' })),
    ...state.tags.map(item => ({ ...item, type: 'tag' }))
  ].filter(item => (state.manageType === 'all' || item.type === state.manageType)
    && item.name.toLocaleLowerCase().includes(query));
  const pageCount = Math.max(1, Math.ceil(items.length / 10));
  state.managePage = Math.max(0, Math.min(state.managePage, pageCount - 1));
  const start = state.managePage * 10;
  const page = items.slice(start, start + 10);
  app.querySelector('#manage-rows').innerHTML = page.length
    ? page.map(item => managementRows([item], item.type)).join('')
    : '<tr><td colspan="3" class="state-message">No matching categories or tags.</td></tr>';
  app.querySelector('#manage-count').textContent = `Showing ${items.length ? start + 1 : 0}–${start + page.length} of ${items.length} item${items.length === 1 ? "" : "s"}`;
  app.querySelector('#manage-page').textContent = `Page ${state.managePage + 1} of ${pageCount}`;
  app.querySelector('#manage-previous').disabled = state.managePage === 0;
  app.querySelector('#manage-next').disabled = state.managePage + 1 >= pageCount;
  app.querySelector('#manage-clear').hidden = !state.manageQuery && state.manageType === 'all';
}

function closeModal() {
  document.querySelector(".modal-backdrop")?.remove();
}

function openEditModal(item) {
  document.body.insertAdjacentHTML("beforeend", `<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="edit-title"><h2 id="edit-title">Edit ${item.type}</h2><form id="edit-form"><div class="field"><label for="edit-name">Name</label><input id="edit-name" name="name" value="${escapeHtml(item.name)}" maxlength="60" required></div><div class="button-row" style="margin-top:18px"><button class="button button--primary">Save changes</button><button class="button" type="button" data-close>Cancel</button></div></form></div></div>`);
  document.querySelector("[data-close]").addEventListener("click", closeModal);
  document.getElementById("edit-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") || "").trim();
    if (!name) return;
    try {
      await updateClassification(item.type, item.id, name);
      closeModal();
      showToast("Changes saved.");
      await renderManage();
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

function openDeleteModal(item) {
  document.body.insertAdjacentHTML("beforeend", `<div class="modal-backdrop"><div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-title"><h2 id="delete-title">Delete ${item.type}</h2><p>Are you sure you want to delete <strong>${escapeHtml(item.name)}</strong>? This cannot be undone.</p><div class="button-row"><button class="button button--danger" data-confirm-delete>Yes, delete</button><button class="button" data-close>No</button></div></div></div>`);
  document.querySelector("[data-close]").addEventListener("click", closeModal);
  document.querySelector("[data-confirm-delete]").addEventListener("click", async () => {
    try {
      await deleteClassification(item.type, item.id);
      closeModal();
      showToast(`${item.name} was deleted.`);
      await renderManage();
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

async function renderManage() {
  tagResizeObserver?.disconnect();
  const token = ++requestToken;
  if (!state.viewer.isAdmin) {
    history.replaceState(null, "", "categories.html");
    showToast("Administrator access is required.", true);
    await renderBrowse();
    return;
  }

  app.innerHTML = '<div class="loading-panel">Loading category management…</div>';
  try {
    await loadClassifications();
    if (token !== requestToken) return;
    app.innerHTML = `<header class="page-head"><div><h1>Manage Categories &amp; Tags</h1><p>Administrators manage categories and can rename or delete tags. Authors can add tags while writing articles.</p></div><button class="button" type="button" data-browse>Back to browse</button></header>
      <div class="manage-grid"><section class="panel"><h2>Create category/tag</h2><form id="create-form"><div class="field"><label for="classification-name">Name</label><input id="classification-name" name="name" maxlength="60" placeholder="Enter a unique name" required></div><p class="field-label">Type</p><div class="button-row"><label><input type="radio" name="type" value="category" checked> Category</label><label><input type="radio" name="type" value="tag"> Tag</label></div><div class="button-row" style="margin-top:18px"><button class="button button--primary">Save</button><button class="button" type="reset">Cancel</button></div></form></section>
      <section class="panel manage-list-panel" aria-labelledby="manage-list-title"><h2 id="manage-list-title">Existing categories and tags</h2>
        <div class="manage-filters">
          <div class="field"><label for="manage-search">Search names</label><input id="manage-search" type="search" placeholder="Find a category or tag…" value="${escapeHtml(state.manageQuery)}" /></div>
          <div class="field"><label for="manage-type">Type</label><select id="manage-type"><option value="all" ${state.manageType === 'all' ? 'selected' : ''}>All types</option><option value="category" ${state.manageType === 'category' ? 'selected' : ''}>Categories</option><option value="tag" ${state.manageType === 'tag' ? 'selected' : ''}>Tags</option></select></div>
        </div>
        <div class="manage-list-summary"><span id="manage-count" role="status" aria-live="polite"></span><button id="manage-clear" class="browse-tags-toggle" type="button" hidden>Clear filters</button></div>
        <div class="manage-table-wrap"><table class="classification-table"><thead><tr><th scope="col">Name</th><th scope="col">Type</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead><tbody id="manage-rows"></tbody></table></div>
        <nav class="manage-pagination" aria-label="Category and tag pages"><button id="manage-previous" class="button" type="button">Previous</button><span id="manage-page" aria-live="polite"></span><button id="manage-next" class="button" type="button">Next</button></nav>
      </section></div>`;

    app.querySelector("[data-browse]").addEventListener("click", () => {
      history.replaceState(null, "", "categories.html");
      renderBrowse();
    });
    document.getElementById("create-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const values = new FormData(event.currentTarget);
      const name = String(values.get("name") || "").trim();
      if (!name) return showToast("Please enter a category or tag name.", true);
      try {
        await createClassification(values.get("type"), name);
        showToast(`${name} was created.`);
        await renderManage();
      } catch (error) {
        showToast(error.message.includes("duplicate") ? "That name already exists." : error.message, true);
      }
    });
    app.querySelector('#manage-search').addEventListener('input', event => {
      state.manageQuery = event.target.value;
      state.managePage = 0;
      updateManagementList();
    });
    app.querySelector('#manage-type').addEventListener('change', event => {
      state.manageType = event.target.value;
      state.managePage = 0;
      updateManagementList();
    });
    app.querySelector('#manage-clear').addEventListener('click', () => {
      state.manageQuery = ''; state.manageType = 'all'; state.managePage = 0;
      app.querySelector('#manage-search').value = '';
      app.querySelector('#manage-type').value = 'all';
      updateManagementList();
    });
    app.querySelector('#manage-previous').addEventListener('click', () => { state.managePage--; updateManagementList(); });
    app.querySelector('#manage-next').addEventListener('click', () => { state.managePage++; updateManagementList(); });
    app.querySelector('#manage-rows').addEventListener('click', event => {
      const button = event.target.closest('button[data-edit], button[data-delete]');
      if (!button) return;
      if (button.hasAttribute('data-edit')) openEditModal(button.dataset);
      else openDeleteModal(button.dataset);
    });
    updateManagementList();
  } catch (error) {
    if (token === requestToken) showError(error, renderManage);
  }
}

async function init() {
  const user = await requireAuth("welcome.html");
  if (!user) return;
  state.viewer = await getViewer();
  const query = new URLSearchParams(location.search);
  if (['tag', 'category'].includes(query.get('type')) && /^[1-9]\d*$/.test(query.get('id') || '')) {
    state.type = query.get('type'); state.id = query.get('id');
  }
  if (new URLSearchParams(location.search).get("mode") === "manage") {
    await renderManage();
  } else {
    await renderBrowse();
  }
}

init();
