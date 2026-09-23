import { requireAuth } from "./auth.js";
import { getMyArticles, deleteArticle, publishArticle } from "../../services/feature8Service.js";
import { escapeHtml, formatRelativeTime, thumbHtml } from "./format.js";

function rowHtml(article) {
  return `
    <tr data-row="${article.id}">
      <td><div class="media-thumb">${thumbHtml(article)}</div></td>
      <td>
        ${escapeHtml(article.title || "(untitled)")}
        <div class="media-meta">
          <span class="badge">${escapeHtml(article.category?.name ?? "Uncategorised")}</span>
        </div>
      </td>
      <td>${formatRelativeTime(article.created_at)}</td>
      <td>
        <div class="media-actions">
          <a class="article-action is-live" href="article-editor.html?id=${article.id}">Continue Editing</a>
          <button class="article-action is-live" data-publish="${article.id}" type="button">Publish</button>
          <button class="article-action is-live" data-delete="${article.id}" type="button">Delete</button>
        </div>
      </td>
    </tr>
  `;
}

async function render(articles) {
  const slot = document.getElementById("drafts-slot");

  if (articles.length === 0) {
    slot.innerHTML = '<p class="state-message">You have no saved drafts.</p>';
    return;
  }

  slot.innerHTML = `
    <div class="analytics-panel">
      <table class="data-table">
        <thead><tr><th>Image</th><th>Draft</th><th>Created</th><th>Manage</th></tr></thead>
        <tbody>${articles.map(rowHtml).join("")}</tbody>
      </table>
    </div>
  `;

  document.querySelectorAll("[data-publish]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await publishArticle(btn.dataset.publish);
        await reload();
      } catch (err) {
        alert(`Could not publish article: ${err.message}`);
        btn.disabled = false;
      }
    });
  });

  document.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this draft? This cannot be undone.")) return;
      btn.disabled = true;
      try {
        await deleteArticle(btn.dataset.delete);
        await reload();
      } catch (err) {
        alert(`Could not delete draft: ${err.message}`);
        btn.disabled = false;
      }
    });
  });
}

async function reload() {
  const articles = await getMyArticles("draft");
  await render(articles);
}

async function init() {
  const user = await requireAuth();
  if (!user) return;

  const slot = document.getElementById("drafts-slot");
  slot.innerHTML = '<p class="state-message">Loading…</p>';

  try {
    await reload();
  } catch (err) {
    slot.innerHTML = `<p class="state-message is-error">Could not load your drafts: ${escapeHtml(err.message)}</p>`;
  }
}

init();
