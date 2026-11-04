import { requireAuth } from "./auth.js?v=account-name-20261029";
import { getMyArticles, deleteArticle } from "../../services/feature8Service.js?v=apply-tags-20261024";
import { escapeHtml, formatCount, formatRelativeTime, thumbHtml } from "./format.js";

function rowHtml(article) {
  return `
    <tr data-row="${article.id}">
      <td><div class="media-thumb">${thumbHtml(article)}</div></td>
      <td>
        <a href="article.html?id=${article.id}">${escapeHtml(article.title)}</a>
        <div class="media-meta">
          <span class="badge">${escapeHtml(article.category?.name ?? "Uncategorised")}</span>
        </div>
      </td>
      <td>${formatRelativeTime(article.published_at)}</td>
      <td class="is-numeric">${formatCount(article.view_count)}</td>
      <td>
        <div class="media-actions">
          <a class="article-action is-live" href="article-editor.html?id=${article.id}&from=my-articles">Edit</a>
          <button class="article-action is-live" data-delete="${article.id}" type="button">Delete</button>
        </div>
      </td>
    </tr>
  `;
}

async function render(articles) {
  const slot = document.getElementById("my-articles-slot");

  if (articles.length === 0) {
    slot.innerHTML = '<p class="state-message">You haven\'t published any articles yet.</p>';
    return;
  }

  slot.innerHTML = `
    <div class="analytics-panel">
      <table class="data-table">
        <thead><tr><th>Image</th><th>Article</th><th>Published</th><th class="is-numeric">Views</th><th>Manage</th></tr></thead>
        <tbody>${articles.map(rowHtml).join("")}</tbody>
      </table>
    </div>
  `;

  document.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this article? This cannot be undone.")) return;
      btn.disabled = true;
      try {
        await deleteArticle(btn.dataset.delete);
        await reload();
      } catch (err) {
        alert(`Could not delete article: ${err.message}`);
        btn.disabled = false;
      }
    });
  });
}

async function reload() {
  const articles = await getMyArticles("published");
  await render(articles);
}

async function init() {
  const user = await requireAuth();
  if (!user) return;

  const url = new URL(window.location.href);
  const success = url.searchParams.get('success');
  if (success === 'published' || success === 'updated') {
    // Consume the redirect feedback so refresh does not repeat it.
    url.searchParams.delete('success');
    window.history.replaceState(window.history.state, '', url);
    const feedback = document.getElementById('article-success');
    feedback.textContent = success === 'published'
      ? 'Article published successfully.' : 'Article updated successfully.';
    feedback.hidden = false;
  }

  const slot = document.getElementById("my-articles-slot");
  slot.innerHTML = '<p class="state-message">Loading…</p>';

  try {
    await reload();
  } catch (err) {
    slot.innerHTML = `<p class="state-message is-error">Could not load your articles: ${escapeHtml(err.message)}</p>`;
  }
}

init();
