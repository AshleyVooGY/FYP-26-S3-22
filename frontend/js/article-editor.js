import { requireAuth } from "./auth.js?v=upgrade-success-20261022";
import {
  getCategories,
  getTags,
  getMyArticleById,
  saveArticleWorkspace,
  deleteArticle,
  uploadArticleImage,
  removeArticleImage
} from "../../services/feature8Service.js?v=single-category-20261019";
import {
  CREDIBILITY_THRESHOLD,
  getSubscriptionTier,
  requestWritingAssistance,
  checkArticleCredibility,
  suggestArticleCategory
} from "../../services/aiPublishingService.js?v=writing-polish-20261019";
import { escapeHtml, thumbHtml } from "./format.js";

const params = new URLSearchParams(window.location.search);
let articleId = params.get("id");
let article = null;
let categories = [];
let tags = [];
let currentUser = null;
let subscriptionTier = "free";
let credibilityResult = null;
let verifiedFingerprint = null;
let credibilityWasInvalidated = false;
let aiSuggestion = null;
let writingUndo = null;
let writingChecking = false;
let categorySuggestion = null;
let categoryRequest = 0;
let categoryChecking = false;

function setPageTitle(text) {
  document.getElementById("editor-title").textContent = text;
}

function setStatus(message, isError = false) {
  const el = document.getElementById("editor-status");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("is-error", isError);
}

function setAiStatus(message, isError = false) {
  const el = document.getElementById("ai-writing-status");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("is-error", isError);
}

function readForm() {
  const categoryId = document.getElementById('field-category').value;
  const categoryIds = categoryId ? [categoryId] : [];
  const tagIds = [...document.querySelectorAll('input[name="tagIds"]:checked')].map(input => input.value);
  return {
    title: document.getElementById("field-title").value,
    content: document.getElementById("field-content").value,
    categoryIds,
    tagIds,
    categoryId: categoryIds[0] ?? null
  };
}

function articleFingerprint(values = readForm()) {
  return JSON.stringify({
    title: values.title.trim(),
    content: values.content.trim(),
    primaryCategoryId: values.categoryIds[0] || null,
    categoryIds: [...values.categoryIds].map(String).sort(),
    tagIds: [...values.tagIds].map(String).sort()
  });
}

function classificationOptionsHtml(items, selectedIds, inputName, emptyMessage) {
  if (!items.length) {
    return `<p class="classification-picker__empty">${escapeHtml(emptyMessage)}</p>`;
  }

  const selected = new Set((selectedIds ?? []).map(String));
  return items
    .map(
      (item) => `
        <label class="classification-option">
          <input type="checkbox" name="${inputName}" value="${item.id}" ${selected.has(String(item.id)) ? "checked" : ""} />
          <span>${escapeHtml(item.name)}</span>
        </label>
      `
    )
    .join("");
}

function hasCurrentPassingCheck() {
  return Boolean(
    credibilityResult &&
      credibilityResult.score >= CREDIBILITY_THRESHOLD &&
      !credibilityResult.criticalIssue &&
      verifiedFingerprint === articleFingerprint()
  );
}

function credibilityPanelHtml() {
  const planName = subscriptionTier === "premium" ? "Premium" : "Free";
  const planDescription = subscriptionTier === "premium"
    ? "Up to 20 AI writing requests per hour, plus AI category suggestions"
    : "Up to 5 AI writing requests per hour. Upgrade to Premium for a higher limit and AI category suggestions";

  return `
    <section class="ai-panel" id="credibility-check" aria-labelledby="credibility-title">
      <div class="ai-panel__heading">
        <div>
          <p class="ai-eyebrow">Required before publishing</p>
          <h2 id="credibility-title">Credibility Check</h2>
        </div>
        <span class="plan-badge plan-badge--${subscriptionTier}">${planName} plan</span>
      </div>
      <p class="ai-panel__description">
        This AI-assisted preliminary assessment must reach ${CREDIBILITY_THRESHOLD}% before publishing.
        Editing the title, category, tags or article content after a check automatically invalidates the result.
      </p>
      <p class="plan-description">${planDescription}. The credibility requirement cannot be bypassed.</p>

      <div class="credibility-result" id="credibility-result" aria-live="polite"></div>

      <button class="article-editor__btn credibility-check-btn" id="check-credibility-btn" type="button">
        Run Credibility Check
      </button>
      <p class="media-row-status" id="credibility-status"></p>
    </section>
  `;
}

function aiWritingPanelHtml() {
  return `
    <section class="ai-panel" aria-labelledby="ai-writing-title">
      <div class="ai-panel__heading">
        <div>
          <p class="ai-eyebrow">Optional writing support</p>
          <h2 id="ai-writing-title">AI Writing Assistant</h2>
        </div>
      </div>
      <p class="ai-panel__description">
        Generate suggestions, review them, then choose whether to apply them. AI suggestions never publish an article automatically.
      </p>
      <div class="ai-tool-grid">
        <button class="ai-tool" type="button" data-ai-task="title">Suggest title</button>
        <button class="ai-tool" type="button" data-ai-task="summary">Generate summary</button>
        <button class="ai-tool" type="button" data-ai-task="tags">Suggest tags</button>
        <button class="ai-tool" type="button" data-ai-task="polish">Polish article</button>
      </div>
      <div id="ai-suggestion" class="ai-suggestion" hidden></div>
      <div id="writing-undo" hidden></div>
      <p class="media-row-status" id="ai-writing-status" role="status" aria-live="polite"></p>
    </section>
  `;
}

function render() {
  const slot = document.getElementById("editor-slot");
  const isEditing = Boolean(articleId);
  const isPublished = article?.status === "published";
  // Never silently choose between several legacy categories without a primary.
  const selectedCategoryId = article?.category_id ?? (article?.category_ids?.length === 1 ? article.category_ids[0] : null);
  categoryRequest += 1;
  categoryChecking = false;
  categorySuggestion = null;
  const selectedTagIds = article?.tag_ids ?? [];

  slot.innerHTML = `
    <div class="article-workspace">
      <div class="analytics-panel article-editor">
        <div class="article-editor__intro">
          <div>
            <p class="ai-eyebrow">Article workspace</p>
            <h2>${isPublished ? "Update published article" : isEditing ? "Continue your draft" : "Create an article"}</h2>
          </div>
          <span class="article-state">${isPublished ? "Published" : "Draft"}</span>
        </div>

        <label class="article-editor__field">
          <span>Title</span>
          <input id="field-title" type="text" placeholder="Article title" value="${escapeHtml(article?.title ?? "")}" />
        </label>

        <div class="article-editor__field">
          <label for="field-category">Category</label>
          <p class="classification-help" id="category-help">Choose one main category. Required to publish; drafts can leave it blank.</p>
          <select id="field-category" aria-describedby="category-help">
            <option value="">Choose a category</option>
            ${categories.map(item => `<option value="${item.id}" ${String(selectedCategoryId) === String(item.id) ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}
          </select>
          ${article?.category_ids?.length > 1 ? '<p class="classification-help">This older article has multiple category links. Saving will keep only the category selected above.</p>' : ''}
          <div class="category-check-actions">
            <button class="article-editor__btn" id="check-category-btn" type="button" ${categories.length && subscriptionTier === "premium" ? '' : 'disabled'} ${subscriptionTier === "premium" ? '' : 'title="Category suggestions are a Premium feature"'}>Check category with AI${subscriptionTier === "premium" ? '' : ' (Premium)'}</button>
          </div>
          <p class="classification-help">AI suggestions are optional. Review the reason before applying a change.</p>
          <p id="category-check-status" class="media-row-status" role="status"></p>
          <div id="category-suggestion" class="ai-suggestion" hidden></div>
        </div>

        <div class="article-editor__field">
          <span>Tags</span>
          <p class="classification-help">Choose all tags that describe this article.</p>
          <div class="classification-picker" id="tag-options">
            ${classificationOptionsHtml(tags, selectedTagIds, "tagIds", "No tags are available.")}
          </div>
        </div>

        <label class="article-editor__field">
          <span>Content</span>
          <textarea id="field-content" rows="14" placeholder="Write your article...">${escapeHtml(article?.content ?? "")}</textarea>
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
              : `<p class="state-message article-image-note">Save your article as a draft first, then you can add an image.</p>`
          }
        </div>

        <div class="article-editor__actions">
          <button class="article-editor__btn" id="save-draft-btn" type="button">
            ${isPublished ? "Save Verified Changes" : "Save as Draft"}
          </button>
          ${!isPublished ? `<button class="article-editor__btn article-editor__btn--primary" id="publish-btn" type="button" disabled>Publish</button>` : ""}
          ${isEditing ? `<button class="article-editor__btn article-editor__btn--danger" id="delete-btn" type="button">Delete ${isPublished ? "Article" : "Draft"}</button>` : ""}
        </div>
        <p class="publish-lock" id="publish-lock">Run the required credibility check to unlock publishing.</p>
        <p id="editor-status" class="media-row-status"></p>
      </div>

      <aside class="ai-sidebar">
        ${credibilityPanelHtml()}
        ${aiWritingPanelHtml()}
      </aside>
    </div>
  `;

  document.getElementById('field-category').addEventListener('change', handleArticleInput);
  document.getElementById('check-category-btn').addEventListener('click', handleCategoryCheck);
  document.getElementById("save-draft-btn").addEventListener("click", handleSaveDraft);
  document.getElementById("check-credibility-btn").addEventListener("click", handleCredibilityCheck);
  document.querySelectorAll("[data-ai-task]").forEach((button) => {
    button.addEventListener("click", () => handleAiTask(button.dataset.aiTask));
  });

  ["field-title", "field-content"].forEach((id) => {
    document.getElementById(id).addEventListener("input", handleArticleInput);
  });
  document.querySelectorAll('input[name="tagIds"]').forEach((input) => {
    input.addEventListener("change", handleArticleInput);
  });

  const publishBtn = document.getElementById("publish-btn");
  if (publishBtn) publishBtn.addEventListener("click", handlePublish);
  const deleteBtn = document.getElementById("delete-btn");
  if (deleteBtn) deleteBtn.addEventListener("click", handleDelete);

  const imageInput = document.getElementById("field-image");
  if (imageInput) imageInput.addEventListener("change", handleImageUpload);
  const removeBtn = document.getElementById("remove-image-btn");
  if (removeBtn) removeBtn.addEventListener("click", handleImageRemove);

  renderCredibilityResult();
  if (categorySuggestion && categorySuggestion.snapshot !== categoryFingerprint()) categorySuggestion = null;
  if (aiSuggestion && aiSuggestion.snapshot !== articleFingerprint()) aiSuggestion = null;
  if (writingUndo && writingUndo.applied !== readForm().content) writingUndo = null;
  renderCategorySuggestion();
  renderAiSuggestion();
  renderWritingUndo();
  const categoryButton = document.getElementById('check-category-btn');
  const canCheckCategory = subscriptionTier === "premium" && categories.length;
  categoryButton.disabled = categoryChecking || !canCheckCategory;
  categoryButton.textContent = categoryChecking
    ? 'Checking category…'
    : `Check category with AI${canCheckCategory ? '' : ' (Premium)'}`;
  document.querySelectorAll('[data-ai-task]').forEach(button => { button.disabled = writingChecking; });
  if (categoryChecking) setCategoryStatus('Reviewing the article topic…');
  if (writingChecking) setAiStatus('Generating a suggestion…');
  updatePublishingState();
}

function categoryFingerprint(values = readForm()) {
  return JSON.stringify([values.title.trim(), values.content.trim(), values.categoryId || null]);
}

function setCategoryStatus(message, isError = false) {
  const status = document.getElementById('category-check-status');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('is-error', isError);
}

function renderCategorySuggestion() {
  const slot = document.getElementById('category-suggestion');
  slot.hidden = !categorySuggestion;
  slot.innerHTML = '';
  if (!categorySuggestion) return;
  const { category, reason, matches } = categorySuggestion;
  slot.innerHTML = `<p class="ai-suggestion__label">${!category ? 'No clear category suggestion' : matches ? 'Current category looks appropriate' : `Suggested category: ${escapeHtml(category.name)}`}</p>
    <p>${escapeHtml(reason)}</p>
    ${category && !matches ? '<button class="ai-apply-btn" type="button" data-apply-category>Use suggested category</button>' : ''}
    <button class="ai-apply-btn" type="button" data-dismiss-category>Dismiss</button>`;
  slot.querySelector('[data-dismiss-category]').addEventListener('click', () => {
    categorySuggestion = null;
    renderCategorySuggestion();
    setCategoryStatus('');
  });
  slot.querySelector('[data-apply-category]')?.addEventListener('click', () => {
    if (!categorySuggestion || categorySuggestion.snapshot !== categoryFingerprint()) {
      categorySuggestion = null;
      renderCategorySuggestion();
      setCategoryStatus('The article changed. Check the category again.', true);
      return;
    }
    const picker = document.getElementById('field-category');
    picker.value = String(category.id);
    if (picker.value !== String(category.id)) {
      setCategoryStatus('Categories have changed. Reload the editor and try again.', true);
      return;
    }
    handleArticleInput();
    setCategoryStatus(`Category changed to ${category.name}. Save your draft to keep it; recheck credibility before publishing.`);
    picker.focus();
  });
}

async function handleCategoryCheck() {
  if (categoryChecking) return;
  const values = readForm();
  if (!values.title.trim() || !values.content.trim()) {
    setCategoryStatus('Enter a title and article content before checking the category.', true);
    return;
  }
  categoryChecking = true;
  categorySuggestion = null;
  renderCategorySuggestion();
  const token = ++categoryRequest;
  const snapshot = categoryFingerprint(values);
  const button = document.getElementById('check-category-btn');
  button.disabled = true;
  button.textContent = 'Checking category…';
  setCategoryStatus('Reviewing the article topic…');
  try {
    const result = await suggestArticleCategory(values);
    if (token !== categoryRequest) return;
    if (snapshot !== categoryFingerprint()) {
      setCategoryStatus('The article changed during checking. Run the check again.', true);
      return;
    }
    const category = result.categoryId === null ? null : categories.find(item => Number(item.id) === result.categoryId);
    if (result.categoryId !== null && !category) {
      throw new Error('Categories have changed. Reload the editor and try again.');
    }
    categorySuggestion = { category, reason: result.reason, snapshot, matches: Boolean(category && String(category.id) === String(values.categoryId)) };
    renderCategorySuggestion();
    setCategoryStatus('Suggestion ready. Your category has not been changed.');
  } catch (error) {
    if (token === categoryRequest) setCategoryStatus(error.message, true);
  } finally {
    if (token === categoryRequest) {
      categoryChecking = false;
      const currentButton = document.getElementById('check-category-btn');
      if (currentButton) {
        currentButton.disabled = false;
        currentButton.textContent = 'Check category with AI';
      }
    }
  }
}

function invalidateCredibility() {
  if (verifiedFingerprint && verifiedFingerprint !== articleFingerprint()) {
    credibilityWasInvalidated = true;
    verifiedFingerprint = null;
    credibilityResult = null;
    const status = document.getElementById("credibility-status");
    if (status) {
      status.textContent = "";
      status.classList.remove("is-error");
    }
    renderCredibilityResult();
    updatePublishingState();
  }
}

function handleArticleInput() {
  invalidateCredibility();
  if (writingUndo && readForm().content !== writingUndo.applied) writingUndo = null;
  renderWritingUndo();
  if (categorySuggestion && categorySuggestion.snapshot !== categoryFingerprint()) {
    categorySuggestion = null;
    renderCategorySuggestion();
    setCategoryStatus('The article changed. Check the category again for a fresh suggestion.');
  }

  if (aiSuggestion) {
    aiSuggestion = null;
    renderAiSuggestion();
    setAiStatus("");
  }
}

function updatePublishingState() {
  const passed = hasCurrentPassingCheck();
  const publishBtn = document.getElementById("publish-btn");
  const saveBtn = document.getElementById("save-draft-btn");
  const lock = document.getElementById("publish-lock");
  const isPublished = article?.status === "published";

  if (publishBtn) publishBtn.disabled = !passed;
  if (saveBtn && isPublished) saveBtn.disabled = !passed;
  if (!lock) return;

  if (passed) {
    lock.textContent = `Credibility score ${credibilityResult.score}% — publishing is unlocked.`;
    lock.className = "publish-lock is-ready";
  } else if (credibilityResult?.criticalIssue) {
    lock.textContent = "A critical issue was found — publishing remains locked until the article is revised and rechecked.";
    lock.className = "publish-lock is-blocked";
  } else if (credibilityResult) {
    lock.textContent = `Credibility score ${credibilityResult.score}% — revise the article and recheck before publishing.`;
    lock.className = "publish-lock is-blocked";
  } else if (credibilityWasInvalidated) {
    lock.textContent = "The article changed after checking. Run the credibility check again.";
    lock.className = "publish-lock is-blocked";
  } else {
    lock.textContent = isPublished
      ? "Run the required credibility check before saving changes to this published article."
      : "Run the required credibility check to unlock publishing.";
    lock.className = "publish-lock";
  }
}

function renderCredibilityResult() {
  const slot = document.getElementById("credibility-result");
  if (!slot) return;

  if (!credibilityResult) {
    slot.innerHTML = `
      <div class="credibility-empty ${credibilityWasInvalidated ? "is-invalidated" : ""}">
        <span class="credibility-empty__icon">${credibilityWasInvalidated ? "!" : "?"}</span>
        <div>
          <strong>${credibilityWasInvalidated ? "Check expired" : "Not checked"}</strong>
          <p>${credibilityWasInvalidated ? "The article was edited. Recheck the current version." : "Save a draft at any time, or check the article when it is ready to publish."}</p>
        </div>
      </div>
    `;
    return;
  }

  const passed = credibilityResult.score >= CREDIBILITY_THRESHOLD && !credibilityResult.criticalIssue;
  const issues = credibilityResult.issues.map((issue) => `<li>${escapeHtml(String(issue))}</li>`).join("");
  const criticalIssue = credibilityResult.criticalIssue
    ? `<div class="credibility-detail is-critical"><strong>Critical issue found</strong><p>${escapeHtml(credibilityResult.criticalIssueMessage || "This article contains a serious unsupported or contradicted claim. Revise it and run the check again.")}</p></div>`
    : "";

  slot.innerHTML = `
    <div class="credibility-score ${passed ? "is-pass" : "is-fail"}">
      <div class="credibility-score__number"><strong>${credibilityResult.score}</strong><span>%</span></div>
      <div>
        <strong>${passed ? "Assessment passed" : "Revision required"}</strong>
        <p>${escapeHtml(credibilityResult.summary)}</p>
      </div>
    </div>
    ${criticalIssue}
    ${issues ? `<div class="credibility-detail"><strong>Items to review</strong><ul>${issues}</ul></div>` : ""}
    <div class="credibility-detail is-warning">
      <strong>Preliminary AI assessment</strong>
      <p>This assessment uses Gemini's existing knowledge and does not include live external verification. Important claims should still be checked manually.</p>
    </div>
  `;
}

async function handleCredibilityCheck() {
  const values = readForm();
  const button = document.getElementById("check-credibility-btn");
  const status = document.getElementById("credibility-status");

  if (!values.title.trim() || !values.content.trim()) {
    status.textContent = "Add a title and article content before checking credibility.";
    status.classList.add("is-error");
    return;
  }

  button.disabled = true;
  button.textContent = "Checking…";
  status.textContent = "Running a preliminary AI credibility assessment…";
  status.classList.remove("is-error");

  try {
    const fingerprintAtRequest = articleFingerprint(values);
    const result = await checkArticleCredibility(values);

    if (fingerprintAtRequest !== articleFingerprint()) {
      throw new Error("The article changed while it was being checked. Please run the check again.");
    }

    if (result.score >= CREDIBILITY_THRESHOLD && !result.criticalIssue && !result.receiptId) {
      throw new Error('The AI assessment completed, but the backend has not issued a verified publishing receipt. Save a draft; the backend team must update the credibility function before publishing.');
    }
    credibilityResult = result;
    verifiedFingerprint = fingerprintAtRequest;
    credibilityWasInvalidated = false;
    status.textContent = result.score >= CREDIBILITY_THRESHOLD && !result.criticalIssue
      ? "Check passed. Publishing is now available for this version."
      : result.criticalIssue
        ? "A critical issue was found. Revise the article and check again before publishing."
        : "The score is below the publishing threshold. Revise the article and check again.";
    renderCredibilityResult();
    updatePublishingState();
  } catch (err) {
    status.textContent = err.message;
    status.classList.add("is-error");
  } finally {
    button.disabled = false;
    button.textContent = credibilityResult ? "Run Check Again" : "Run Credibility Check";
  }
}

function renderAiSuggestion() {
  const slot = document.getElementById("ai-suggestion");
  if (!slot) return;
  if (!aiSuggestion) {
    slot.hidden = true;
    slot.innerHTML = "";
    return;
  }

  const titles = [...aiSuggestion.titles];
  if (aiSuggestion.title && !titles.includes(aiSuggestion.title)) titles.unshift(aiSuggestion.title);

  let body = "";
  if (titles.length) {
    body = `
      <p class="ai-suggestion__label">Suggested title${titles.length > 1 ? "s" : ""}</p>
      <div class="ai-title-options">
        ${titles.map((title, index) => `<button type="button" data-apply-title="${index}">${escapeHtml(title)}</button>`).join("")}
      </div>
    `;
  } else if (aiSuggestion.summary) {
    body = `<p class="ai-suggestion__label">Suggested summary</p><p>${escapeHtml(aiSuggestion.summary)}</p><button class="ai-apply-btn" type="button" data-copy-value="summary">Copy summary</button>`;
  } else if (aiSuggestion.tags.length) {
    body = `<p class="ai-suggestion__label">Suggested tags</p><div class="ai-tag-list">${aiSuggestion.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div><button class="ai-apply-btn" type="button" data-copy-value="tags">Copy tags</button>`;
  } else if (aiSuggestion.content) {
    body = `<p class="ai-suggestion__label">Review polished article</p>
      <p>Check names, dates, numbers and quotations before applying. AI editing can make mistakes.</p>
      <div class="ai-compare"><section aria-label="Original article"><h3>Original</h3><div class="ai-content-preview" tabindex="0">${escapeHtml(aiSuggestion.originalContent)}</div></section>
      <section aria-label="Polished article"><h3>Polished</h3><div class="ai-content-preview" tabindex="0">${escapeHtml(aiSuggestion.content)}</div></section></div>
      <button class="ai-apply-btn" type="button" data-apply-content>Apply to article</button>`;
  } else {
    body = "<p>No suggestion was returned. Try again.</p>";
  }

  const usage = aiSuggestion.remaining === null
    ? ""
    : `<p class="ai-usage">${aiSuggestion.remaining}${aiSuggestion.limit === null ? "" : ` of ${aiSuggestion.limit}`} AI writing requests remaining.</p>`;

  slot.innerHTML = `${body}${aiSuggestion.explanation ? `<p class="ai-explanation">${escapeHtml(aiSuggestion.explanation)}</p>` : ""}${usage}<button class="ai-dismiss-btn" type="button" data-dismiss-ai>Dismiss</button>`;
  slot.hidden = false;

  slot.querySelectorAll("[data-apply-title]").forEach((button) => {
    button.addEventListener("click", () => {
      if (aiSuggestion.snapshot !== articleFingerprint()) { handleArticleInput(); return; }
      document.getElementById("field-title").value = titles[Number(button.dataset.applyTitle)];
      handleArticleInput();
      aiSuggestion = null;
      renderAiSuggestion();
      setAiStatus("Title applied. Review it before continuing.");
    });
  });
  slot.querySelector("[data-apply-content]")?.addEventListener("click", () => {
    if (aiSuggestion.snapshot !== articleFingerprint()) { handleArticleInput(); return; }
    const original = document.getElementById("field-content").value;
    const applied = aiSuggestion.content;
    document.getElementById("field-content").value = applied;
    handleArticleInput();
    writingUndo = {original, applied};
    renderWritingUndo();
    aiSuggestion = null;
    renderAiSuggestion();
    setAiStatus("Polished content applied. Review it and run a new credibility check.");
  });
  slot.querySelector("[data-copy-value]")?.addEventListener("click", async (event) => {
    const value = event.currentTarget.dataset.copyValue === "tags"
      ? aiSuggestion.tags.join(", ")
      : aiSuggestion.summary;
    try {
      await navigator.clipboard.writeText(value);
      setAiStatus("Copied to clipboard.");
    } catch {
      setAiStatus("Could not copy automatically. Select and copy the suggestion manually.", true);
    }
  });
  slot.querySelector("[data-dismiss-ai]")?.addEventListener("click", () => {
    aiSuggestion = null;
    renderAiSuggestion();
    setAiStatus("");
  });
}

function renderWritingUndo() {
  const slot = document.getElementById('writing-undo');
  if (!slot) return;
  slot.hidden = !writingUndo;
  slot.innerHTML = writingUndo ? '<button class="ai-apply-btn" type="button" data-undo-polish>Undo polished content</button>' : '';
  slot.querySelector('[data-undo-polish]')?.addEventListener('click', () => {
    if (!writingUndo || readForm().content !== writingUndo.applied) { writingUndo = null; renderWritingUndo(); return; }
    document.getElementById('field-content').value = writingUndo.original;
    writingUndo = null;
    handleArticleInput();
    setAiStatus('Original content restored. Save when ready; a new credibility check is required before publishing.');
  });
}

async function handleAiTask(task) {
  if (writingChecking) return;
  const values = readForm();
  const buttons = [...document.querySelectorAll("[data-ai-task]")];

  if (!values.content.trim()) {
    setAiStatus("Add article content before requesting AI writing assistance.", true);
    return;
  }

  writingChecking = true;
  buttons.forEach((button) => (button.disabled = true));
  aiSuggestion = null;
  renderAiSuggestion();
  setAiStatus("Generating a suggestion…");

  try {
    const fingerprintAtRequest = articleFingerprint(values);
    const suggestion = await requestWritingAssistance({ task, ...values });
    if (fingerprintAtRequest !== articleFingerprint()) {
      throw new Error("The article changed while the suggestion was being generated. Please request it again.");
    }
    if (task === 'polish' && suggestion.content === values.content.trim()) {
      setAiStatus('No wording changes were suggested. Your article has not changed.');
      return;
    }
    aiSuggestion = {...suggestion, originalContent:values.content, snapshot:fingerprintAtRequest};
    renderAiSuggestion();
    setAiStatus("Suggestion ready. Review it before applying.");
  } catch (err) {
    setAiStatus(err.message, true);
  } finally {
    writingChecking = false;
    document.querySelectorAll('[data-ai-task]').forEach(button => { button.disabled = false; });
  }
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
  const isPublished = article?.status === "published";

  if (isPublished && !hasCurrentPassingCheck()) {
    setStatus("Run and pass the credibility check before saving changes to a published article.", true);
    document.getElementById("credibility-check").scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  await saveWorkspace(values, isPublished);
}

let savingWorkspace = false;
async function saveWorkspace(values, publish) {
  if (savingWorkspace) return;
  if (!values.title.trim() || !values.content.trim()) {
    setStatus('Enter a title and article content before saving.', true);
    return;
  }
  if (publish && !values.categoryIds.length) {
    setStatus('Select a category before publishing.', true);
    return;
  }
  savingWorkspace = true;
  document.querySelectorAll('#save-draft-btn,#publish-btn').forEach(button => { button.disabled = true; });
  setStatus(publish ? 'Saving verified article…' : 'Saving draft…');
  try {
    articleId = await saveArticleWorkspace(articleId, values, publish, credibilityResult?.receiptId);
    window.history.replaceState(null, '', `article-editor.html?id=${articleId}`);
    if (publish) {
      window.location.href = 'my-articles.html';
      return;
    }
    await reloadArticle();
    setStatus('Draft saved with its categories and tags.');
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    savingWorkspace = false;
    const saveButton = document.getElementById('save-draft-btn');
    if (saveButton) saveButton.disabled = false;
    updatePublishingState();
  }
}

async function handlePublish() {
  if (!hasCurrentPassingCheck()) {
    setStatus('Run and pass the credibility check for the current article before publishing.', true);
    document.getElementById('credibility-check').scrollIntoView({behavior:'smooth',block:'start'});
    return;
  }
  await saveWorkspace(readForm(), true);
}

async function handleDelete() {
  if (!confirm("Delete this article? This cannot be undone.")) return;
  try {
    await deleteArticle(articleId);
    window.location.href = article.status === "published" ? "my-articles.html" : "drafts.html";
  } catch (err) {
    setStatus(err.message, true);
  }
}

async function handleImageUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  setStatus("Uploading…");
  try {
    await uploadArticleImage(articleId, file, article?.featured_image_url ?? null);
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
  currentUser = await requireAuth();
  if (!currentUser) return;
  subscriptionTier = getSubscriptionTier(currentUser);

  const slot = document.getElementById("editor-slot");
  slot.innerHTML = '<p class="state-message">Loading…</p>';

  try {
    [categories, tags] = await Promise.all([getCategories(), getTags()]);
  } catch (error) {
    slot.innerHTML = `<p class="state-message is-error">Could not load categories and tags. Reload to retry. ${escapeHtml(error.message)}</p>`;
    return;
  }

  if (articleId) {
    const ok = await reloadArticle();
    if (!ok) return;
  } else {
    setPageTitle("Write a New Article");
    render();
  }
}

init().catch(error => {
  document.getElementById('editor-slot').innerHTML = `<p class="state-message is-error">Could not open the editor. ${escapeHtml(error.message)}</p>`;
});
