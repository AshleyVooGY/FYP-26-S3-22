import { requireAuth } from "./auth.js?v=upgrade-cta-20261022";
import { escapeHtml, formatCount, formatRelativeTime, thumbHtml } from "./format.js";
import {
  getViewer,
  getClassifications,
  getPublishedArticles,
  getArticlesByClassification,
  createClassification,
  updateClassification,
  deleteClassification
} from "../features-01-02-10/featureService.js?v=category-badges";

const app = document.getElementById("categories-app");
const state = {
  viewer: { user: null, isAdmin: false },
  categories: [],
  tags: [],
  type: "all",
  id: null
};
let requestToken = 0;

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

async function renderBrowse() {
  const token = ++requestToken;
  app.innerHTML = '<div class="loading-panel">Loading categories and articles…</div>';

  try {
    await loadClassifications();
    const articles = state.type === "all"
      ? await getPublishedArticles()
      : await getArticlesByClassification(state.type, state.id);
    if (token !== requestToken) return;

    const selected = [...state.categories.map((item) => ({ ...item, type: "category" })), ...state.tags.map((item) => ({ ...item, type: "tag" }))]
      .find((item) => item.type === state.type && String(item.id) === String(state.id));

    app.innerHTML = `
      <header class="page-head">
        <div><h1>${selected ? escapeHtml(selected.name) : "Browse News"}</h1><p>Explore published articles by category or tag.</p></div>
        <div class="button-row"><span>${articles.length} article${articles.length === 1 ? "" : "s"}</span>${state.viewer.isAdmin ? '<button class="button" type="button" data-manage>Manage categories & tags</button>' : ""}</div>
      </header>
      <section aria-labelledby="categories-title"><h2 id="categories-title" class="section-title">Categories</h2><div class="classification-bar">
        <button class="classification-chip ${state.type === "all" ? "is-active" : ""}" data-type="all">All news</button>
        ${state.categories.map((item) => `<button class="classification-chip ${state.type === "category" && String(state.id) === String(item.id) ? "is-active" : ""}" data-type="category" data-id="${item.id}">${escapeHtml(item.name)}</button>`).join("")}
      </div></section>
      <section aria-labelledby="tags-title"><h2 id="tags-title" class="section-title">Tags</h2><div class="classification-bar">
        ${state.tags.length ? state.tags.map((item) => `<button class="classification-chip ${state.type === "tag" && String(state.id) === String(item.id) ? "is-active" : ""}" data-type="tag" data-id="${item.id}">#${escapeHtml(item.name)}</button>`).join("") : '<span class="state-message">No tags are available yet.</span>'}
      </div></section>
      ${articles.length ? `<div class="article-grid">${articles.map(articleCard).join("")}</div>` : '<div class="empty-state"><h2>No matching articles</h2><p>There are no published articles under this classification yet.</p></div>'}`;

    app.querySelectorAll("[data-type]").forEach((button) => button.addEventListener("click", () => {
      state.type = button.dataset.type;
      state.id = button.dataset.id || null;
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
    app.innerHTML = `<header class="page-head"><div><h1>Manage Categories &amp; Tags</h1><p>Create, view, edit and delete article classifications.</p></div><button class="button" type="button" data-browse>Back to browse</button></header>
      <div class="manage-grid"><section class="panel"><h2>Create category/tag</h2><form id="create-form"><div class="field"><label for="classification-name">Name</label><input id="classification-name" name="name" maxlength="60" placeholder="Enter a unique name" required></div><p class="field-label">Type</p><div class="button-row"><label><input type="radio" name="type" value="category" checked> Category</label><label><input type="radio" name="type" value="tag"> Tag</label></div><div class="button-row" style="margin-top:18px"><button class="button button--primary">Save</button><button class="button" type="reset">Cancel</button></div></form></section>
      <section class="panel"><h2>Existing categories and tags</h2><div style="overflow:auto"><table class="classification-table"><thead><tr><th>Name</th><th>Type</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${managementRows(state.categories, "category")}${managementRows(state.tags, "tag")}</tbody></table></div></section></div>`;

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
    app.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => openEditModal(button.dataset)));
    app.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => openDeleteModal(button.dataset)));
  } catch (error) {
    if (token === requestToken) showError(error, renderManage);
  }
}

async function init() {
  const user = await requireAuth("welcome.html");
  if (!user) return;
  state.viewer = await getViewer();
  if (new URLSearchParams(location.search).get("mode") === "manage") {
    await renderManage();
  } else {
    await renderBrowse();
  }
}

init();
