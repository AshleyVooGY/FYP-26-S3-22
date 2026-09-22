import { requireAdmin } from "./auth.js";
import { getManagedArticles, uploadArticleImage, removeArticleImage } from "../../services/feature8Service.js";
import { escapeHtml, forbiddenStateHtml, thumbHtml } from "./format.js";

function rowHtml(article) {
  return `
    <tr data-row="${article.id}">
      <td><div class="media-thumb">${thumbHtml(article)}</div></td>
      <td>
        ${escapeHtml(article.title)}
        <div class="media-meta">
          <span class="badge">${escapeHtml(article.category?.name ?? "Uncategorised")}</span>
          <span class="badge">${escapeHtml(article.status)}</span>
        </div>
      </td>
      <td>
        <div class="media-actions">
          <label class="media-upload-btn">
            ${article.featured_image_url ? "Replace" : "Upload"} Image
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-upload="${article.id}" hidden />
          </label>
          <button class="article-action ${article.featured_image_url ? "is-live" : ""}" data-remove="${article.id}" ${article.featured_image_url ? "" : "disabled"}>
            Remove
          </button>
        </div>
        <p class="media-row-status" data-status="${article.id}"></p>
      </td>
    </tr>
  `;
}

function setRowStatus(articleId, message, isError = false) {
  const status = document.querySelector(`[data-status="${articleId}"]`);
  if (!status) {
    return;
  }
  status.textContent = message;
  status.classList.toggle("is-error", isError);
}

async function render(articles) {
  document.getElementById("media-slot").innerHTML = `
    <div class="analytics-panel">
      <table class="data-table">
        <thead><tr><th>Image</th><th>Article</th><th>Manage</th></tr></thead>
        <tbody>${articles.map(rowHtml).join("")}</tbody>
      </table>
    </div>
  `;

  document.querySelectorAll("[data-upload]").forEach((input) => {
    input.addEventListener("change", async () => {
      const articleId = input.dataset.upload;
      const file = input.files?.[0];
      if (!file) {
        return;
      }

      const row = document.querySelector(`[data-row="${articleId}"]`);
      const previousImageUrl = row?.querySelector("img")?.getAttribute("src") ?? null;

      setRowStatus(articleId, "Uploading…");
      try {
        await uploadArticleImage(articleId, file, previousImageUrl);
        await reload();
      } catch (err) {
        setRowStatus(articleId, err.message, true);
      }
    });
  });

  document.querySelectorAll("[data-remove]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const articleId = btn.dataset.remove;
      const row = document.querySelector(`[data-row="${articleId}"]`);
      const currentImage = row?.querySelector("img")?.getAttribute("src");

      btn.disabled = true;
      setRowStatus(articleId, "Removing…");
      try {
        await removeArticleImage(articleId, currentImage ?? "");
        await reload();
      } catch (err) {
        setRowStatus(articleId, err.message, true);
        btn.disabled = false;
      }
    });
  });
}

async function reload() {
  const articles = await getManagedArticles();
  await render(articles);
}

async function init() {
  const admin = await requireAdmin();
  const slot = document.getElementById("media-slot");

  if (!admin) {
    slot.innerHTML = forbiddenStateHtml();
    return;
  }

  slot.innerHTML = '<p class="state-message">Loading…</p>';

  try {
    await reload();
  } catch (err) {
    slot.innerHTML = `<p class="state-message is-error">Could not load articles: ${escapeHtml(err.message)}</p>`;
  }
}

init();
