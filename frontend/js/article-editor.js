import { requireAuth } from "./auth.js";
import {
  getCategories,
  getMyArticleById,
  createArticle,
  updateArticle,
  publishArticle,
  deleteArticle,
  uploadArticleImage,
  removeArticleImage,
} from "../../services/feature8Service.js";
import { escapeHtml, thumbHtml } from "./format.js";

const params = new URLSearchParams(window.location.search);
let articleId = params.get("id");
let article = null;
let categories = [];

function setPageTitle(text) {
  document.getElementById("editor-title").textContent = text;
}

function setStatus(message, isError = false) {
  const el = document.getElementById("editor-status");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("is-error", isError);
}

function readForm() {
  return {
    title: document.getElementById("field-title").value,
    content: document.getElementById("field-content").value,
    categoryId: document.getElementById("field-category").value || null,
  };
}

function render() {
  const slot = document.getElementById("editor-slot");
  const isEditing = Boolean(articleId);
  const isPublished = article?.status === "published";

  slot.innerHTML = `
    <div class="analytics-panel article-editor">
      <label class="article-editor__field">
        <span>Title</span>
        <input id="field-title" type="text" placeholder="Article title" value="${escapeHtml(article?.title ?? "")}" />
      </label>

      <label class="article-editor__field">
        <span>Category</span>
        <select id="field-category">
          <option value="">Uncategorised</option>
          ${categories
            .map(
              (c) =>
                `<option value="${c.id}" ${String(c.id) === String(article?.category_id) ? "selected" : ""}>${escapeHtml(c.name)}</option>`,
            )
            .join("")}
        </select>
      </label>

      <label class="article-editor__field">
        <span>Content</span>
        <textarea id="field-content" rows="10" placeholder="Write your article...">${escapeHtml(article?.content ?? "")}</textarea>
      </label>

      <div class="article-editor__field">
        <span>Featured Image</span>
        ${
          isEditing
            ? `
              <div class="media-thumb article-editor__thumb">${thumbHtml(article ?? {})}</div>
              <div class="media-actions">
                <label class="media-upload-btn">
                  ${article?.featured_image_url ? "Replace" : "Upload"} Image
                  <input type="file" id="field-image" accept="image/png,image/jpeg,image/webp,image/gif" hidden />
                </label>
                <button class="article-action ${article?.featured_image_url ? "is-live" : ""}" id="remove-image-btn" type="button" ${article?.featured_image_url ? "" : "disabled"}>
                  Remove
                </button>
              </div>
            `
            : `<p class="state-message" style="padding-left:0;">Save your article as a draft first, then you can add an image.</p>`
        }
      </div>

      <div class="article-editor__actions">
        <button class="article-editor__btn" id="save-draft-btn" type="button">
          ${isPublished ? "Save Changes" : "Save as Draft"}
        </button>
        ${!isPublished ? `<button class="article-editor__btn article-editor__btn--primary" id="publish-btn" type="button">Publish</button>` : ""}
        ${isEditing ? `<button class="article-editor__btn article-editor__btn--danger" id="delete-btn" type="button">Delete ${isPublished ? "Article" : "Draft"}</button>` : ""}
      </div>

      <p id="editor-status" class="media-row-status"></p>
    </div>
  `;

  document
    .getElementById("save-draft-btn")
    .addEventListener("click", handleSaveDraft);
  const publishBtn = document.getElementById("publish-btn");
  if (publishBtn) publishBtn.addEventListener("click", handlePublish);
  const deleteBtn = document.getElementById("delete-btn");
  if (deleteBtn) deleteBtn.addEventListener("click", handleDelete);

  const imageInput = document.getElementById("field-image");
  if (imageInput) imageInput.addEventListener("change", handleImageUpload);
  const removeBtn = document.getElementById("remove-image-btn");
  if (removeBtn) removeBtn.addEventListener("click", handleImageRemove);
}

async function reloadArticle() {
  article = await getMyArticleById(articleId);
  if (!article) {
    document.getElementById("editor-slot").innerHTML =
      '<p class="state-message is-error">This article is unavailable.</p>';
    return false;
  }
  setPageTitle(article.status === "published" ? "Edit Article" : "Edit Draft");
  render();
  return true;
}

async function handleSaveDraft() {
  const values = readForm();
  try {
    if (!articleId) {
      articleId = await createArticle({ ...values, publish: false });
      window.history.replaceState(
        null,
        "",
        `article-editor.html?id=${articleId}`,
      );
      await reloadArticle();
      setStatus("Draft saved.");
    } else {
      await updateArticle(articleId, values);
      await reloadArticle();
      setStatus("Saved.");
    }
  } catch (err) {
    setStatus(err.message, true);
  }
}

async function handlePublish() {
  const values = readForm();
  try {
    if (!articleId) {
      articleId = await createArticle({ ...values, publish: true });
    } else {
      await updateArticle(articleId, values);
      await publishArticle(articleId);
    }
    window.location.href = "my-articles.html";
  } catch (err) {
    setStatus(err.message, true);
  }
}

async function handleDelete() {
  if (!confirm("Delete this article? This cannot be undone.")) {
    return;
  }
  try {
    await deleteArticle(articleId);
    window.location.href =
      article.status === "published" ? "my-articles.html" : "drafts.html";
  } catch (err) {
    setStatus(err.message, true);
  }
}

async function handleImageUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  setStatus("Uploading…");
  try {
    await uploadArticleImage(
      articleId,
      file,
      article?.featured_image_url ?? null,
    );
    await reloadArticle();
    setStatus("Image updated.");
  } catch (err) {
    setStatus(err.message, true);
  }
}

async function handleImageRemove() {
  setStatus("Removing…");
  try {
    await removeArticleImage(articleId, article.featured_image_url);
    await reloadArticle();
    setStatus("Image removed.");
  } catch (err) {
    setStatus(err.message, true);
  }
}

async function init() {
  const user = await requireAuth();
  if (!user) return;

  const slot = document.getElementById("editor-slot");
  slot.innerHTML = '<p class="state-message">Loading…</p>';

  try {
    categories = await getCategories();
  } catch {
    categories = [];
  }

  if (articleId) {
    const ok = await reloadArticle();
    if (!ok) return;
  } else {
    setPageTitle("Write a New Article");
    render();
  }
}

init();
