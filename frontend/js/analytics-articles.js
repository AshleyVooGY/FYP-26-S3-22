import { requireAdmin } from "./auth.js";
import { getArticleViewStats } from "../../services/feature6Service.js";
import { formatCount, formatRelativeTime, escapeHtml, forbiddenStateHtml } from "./format.js";
import { renderPagination } from "./pagination.js";

const PAGE_SIZE = 10;

const state = {
  all: [],
  search: "",
  categoryId: "",
  sort: "views_desc",
  page: 1
};

function applyFilters() {
  let rows = state.all;

  if (state.search.trim()) {
    const q = state.search.trim().toLowerCase();
    rows = rows.filter((a) => a.title.toLowerCase().includes(q));
  }

  if (state.categoryId) {
    rows = rows.filter((a) => String(a.category_id) === state.categoryId);
  }

  return rows;
}

function renderToolbar() {
  const categories = [...new Map(state.all.map((a) => [a.category_id, a.category])).entries()];

  document.getElementById("toolbar-slot").innerHTML = `
    <div class="list-toolbar">
      <input id="search-input" type="text" placeholder="Search by title..." value="${escapeHtml(state.search)}" />
      <select id="category-select">
        <option value="">All categories</option>
        ${categories
          .map(([id, name]) => `<option value="${id}" ${String(id) === state.categoryId ? "selected" : ""}>${escapeHtml(name)}</option>`)
          .join("")}
      </select>
      <select id="sort-select">
        <option value="views_desc" ${state.sort === "views_desc" ? "selected" : ""}>Most Views</option>
        <option value="views_asc" ${state.sort === "views_asc" ? "selected" : ""}>Fewest Views</option>
        <option value="recent" ${state.sort === "recent" ? "selected" : ""}>Most Recent</option>
        <option value="oldest" ${state.sort === "oldest" ? "selected" : ""}>Oldest</option>
      </select>
    </div>
  `;

  document.getElementById("search-input").addEventListener("input", (e) => {
    state.search = e.target.value;
    state.page = 1;
    renderTable();
  });

  document.getElementById("category-select").addEventListener("change", (e) => {
    state.categoryId = e.target.value;
    state.page = 1;
    renderTable();
  });

  document.getElementById("sort-select").addEventListener("change", async (e) => {
    state.sort = e.target.value;
    state.page = 1;
    await reload();
  });
}

function renderTable() {
  const rows = applyFilters();
  const start = (state.page - 1) * PAGE_SIZE;
  const pageItems = rows.slice(start, start + PAGE_SIZE);
  const tableSlot = document.getElementById("table-slot");

  if (pageItems.length === 0) {
    tableSlot.innerHTML = '<p class="state-message">No articles match your filters.</p>';
    document.getElementById("pagination").innerHTML = "";
    return;
  }

  tableSlot.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Title</th>
          <th>Category</th>
          <th>Published</th>
          <th class="is-numeric">Views</th>
          <th class="is-numeric">Reactions</th>
        </tr>
      </thead>
      <tbody>
        ${pageItems
          .map(
            (a) => `
          <tr>
            <td><a href="article-analytics.html?id=${a.id}">${escapeHtml(a.title)}</a></td>
            <td><span class="badge">${escapeHtml(a.category)}</span></td>
            <td>${formatRelativeTime(a.published_at)}</td>
            <td class="is-numeric">${formatCount(a.view_count)}</td>
            <td class="is-numeric">${formatCount(a.reaction_count)}</td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;

  renderPagination(document.getElementById("pagination"), {
    page: state.page,
    totalItems: rows.length,
    pageSize: PAGE_SIZE,
    onPageChange: (page) => {
      state.page = page;
      renderTable();
    }
  });
}

async function reload() {
  const tableSlot = document.getElementById("table-slot");
  tableSlot.innerHTML = '<p class="state-message">Loading…</p>';

  try {
    state.all = await getArticleViewStats({ sort: state.sort, limit: 200 });
    renderTable();
  } catch (err) {
    tableSlot.innerHTML = `<p class="state-message is-error">Could not load articles: ${escapeHtml(err.message)}</p>`;
  }
}

async function init() {
  const admin = await requireAdmin();
  const slot = document.getElementById("articles-slot");

  if (!admin) {
    slot.innerHTML = forbiddenStateHtml();
    return;
  }

  slot.innerHTML = `
    <div id="toolbar-slot"></div>
    <div id="table-slot"><p class="state-message">Loading…</p></div>
    <div id="pagination" class="pagination"></div>
  `;

  await reload();
  renderToolbar();
}

init();
