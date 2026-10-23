import { requireAuth } from "./auth.js?v=required-category-20261022";
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
  checkArticleCredibility
} from "../../services/aiPublishingService.js?v=required-category-20261022";
import { getCategoryReview,requestCategoryReview,getArticleCategoryReview } from '../../services/publishingReviewService.js?v=required-category-20261022';
import { publishingFingerprint,isPublishReviewReady } from './publish-review-state.js?v=required-category-20261022';
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
let categoryReview=null, categoryReviewFingerprint=null, publishRequest=0, publishChecking=false;

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

function articleFingerprint(values=readForm()){return publishingFingerprint(values);}

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
 return isPublishReviewReady(credibilityResult,categoryReview,verifiedFingerprint,articleFingerprint(),categoryReviewFingerprint);
}

function credibilityPanelHtml() {
  const planName = subscriptionTier === "premium" ? "Premium" : "Free";
  const planDescription = subscriptionTier === "premium"
    ? "Up to 20 optional AI writing requests per hour"
    : "Up to 5 optional AI writing requests per hour";

  return `
    <section class="ai-panel" id="credibility-check" aria-labelledby="credibility-title">
      <div class="ai-panel__heading">
        <div>
          <p class="ai-eyebrow">Required before publishing</p>
          <h2 id="credibility-title">Check before publishing</h2>
        </div>
        <span class="plan-badge plan-badge--${subscriptionTier}">${planName} plan</span>
      </div>
      <p class="ai-panel__description">
        Credibility must reach ${CREDIBILITY_THRESHOLD}% with no critical issues, and the selected category must pass AI checking or receive administrator approval.
        Editing the title, category, tags or article content after a check automatically invalidates the result.
      </p>
      <p class="plan-description">${planDescription}. The required publishing check is available to all signed-in users (up to 20 checks per hour). Publishing results expire after 30 minutes.</p>

      <div class="credibility-result" id="credibility-result" aria-live="polite"></div>

      <button class="article-editor__btn credibility-check-btn" id="check-credibility-btn" type="button">
        Check before publishing
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
  publishRequest += 1;
  publishChecking = false;
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
          <p class="classification-help">Category checking is required for everyone before publishing. Use Check before publishing to review credibility and category together.</p>
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
        <p class="publish-lock" id="publish-lock">Run Check before publishing to unlock publishing.</p>
        <p id="editor-status" class="media-row-status"></p>
      </div>

      <aside class="ai-sidebar">
        ${credibilityPanelHtml()}
        ${aiWritingPanelHtml()}
      </aside>
    </div>
  `;

  document.getElementById('field-category').addEventListener('change', handleArticleInput);
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
  if (aiSuggestion && aiSuggestion.snapshot !== articleFingerprint()) aiSuggestion = null;
  if (writingUndo && writingUndo.applied !== readForm().content) writingUndo = null;
  renderCategorySuggestion();
  renderAiSuggestion();
  renderWritingUndo();
  document.querySelectorAll('[data-ai-task]').forEach(button => { button.disabled = writingChecking; });
  if (writingChecking) setAiStatus('Generating a suggestion…');
  updatePublishingState();
}

function setCategoryStatus(message,isError=false){
 const slot=document.getElementById('category-check-status');if(!slot)return;slot.textContent=message;slot.classList.toggle('is-error',isError);
}
function setCategoryReview(record,fingerprint) {
 categoryReview=record?{...record,reason:record.reason??record.ai_reason}:null;
 categoryReviewFingerprint=fingerprint;
}
function renderCategorySuggestion(){
 const slot=document.getElementById('category-suggestion');if(!slot)return;
 slot.hidden=!categoryReview;slot.innerHTML='';if(!categoryReview)return;
 const same=categoryReviewFingerprint===articleFingerprint(),expired=Date.parse(categoryReview.expires_at)<=Date.now();
 if(!same){
  slot.innerHTML='<p>The submitted category review is for a different article version. Run a new check for your changes.</p>'+(categoryReview.snapshot?'<button class="ai-apply-btn" type="button" data-restore-review>Restore submitted version</button>':'');
  slot.querySelector('[data-restore-review]')?.addEventListener('click',()=>{
   const snap=categoryReview.snapshot;
   document.getElementById('field-title').value=snap.title;document.getElementById('field-content').value=snap.content;
   document.getElementById('field-category').value=String(snap.primary_category_id);
   document.querySelectorAll('input[name="tagIds"]').forEach(input=>input.checked=snap.tag_ids.map(String).includes(input.value));
   handleArticleInput();setCategoryStatus('Submitted version restored in the editor. Run Check before publishing to renew the credibility result.');
  });return;
 }
 const approved=['ai_passed','approved'].includes(categoryReview.status),suggested=categories.find(c=>Number(c.id)===categoryReview.suggested_category_id);
 const heading=expired?'Category check expired':categoryReview.status==='approved'?'Category approved by an administrator':categoryReview.status==='ai_passed'?'Selected category passed':categoryReview.status==='pending'?'Awaiting administrator category review':categoryReview.status==='rejected'?'Administrator requested a category change':'Category needs attention';
 slot.innerHTML=`<p class="ai-suggestion__label">${escapeHtml(heading)}</p><p>${escapeHtml(categoryReview.reason||'')}</p>
 ${categoryReview.review_note?`<p><strong>Administrator note:</strong> ${escapeHtml(categoryReview.review_note)}</p>`:''}
 ${!approved&&suggested&&String(suggested.id)!==String(readForm().categoryId)?`<p>Suggested category: ${escapeHtml(suggested.name)}</p><button class="ai-apply-btn" type="button" data-apply-category>Use suggested category</button>`:''}
 ${!approved&&!expired&&categoryReview.status==='needs_review'?'<details class="category-appeal"><summary>Disagree with the category suggestion?</summary><p>Explain why your selected category fits. An administrator can review this version while you keep it as a draft.</p><label for="category-appeal-reason">Why does your selected category fit? (20–2000 characters)</label><textarea id="category-appeal-reason" minlength="20" maxlength="2000" rows="4"></textarea><button class="ai-apply-btn" type="button" data-request-review>Request administrator review</button></details>':''}
 ${['pending','approved','rejected'].includes(categoryReview.status)?'<button class="ai-apply-btn" type="button" data-refresh-review>Check review status</button>':''}
 <p>${approved?'Credibility must also pass for this exact version. An expired check needs to be run again.':'You can save a draft while resolving the category. Changing the article requires a fresh publishing check.'}</p>`;
 slot.querySelector('[data-apply-category]')?.addEventListener('click',async event=>{
  if(savingWorkspace||publishChecking)return;
  event.currentTarget.disabled=true;
  document.getElementById('field-category').value=String(suggested.id);
  handleArticleInput();
  await handleCredibilityCheck();
 });
 slot.querySelector('[data-request-review]')?.addEventListener('click',handleCategoryAppeal);
 slot.querySelector('[data-refresh-review]')?.addEventListener('click',async event=>{
  const button=event.currentTarget;button.disabled=true;
  try{const current=await getCategoryReview(categoryReview.id);setCategoryReview({...categoryReview,...current},categoryReviewFingerprint);renderCategorySuggestion();updatePublishingState();setCategoryStatus(current.status==='pending'?'Your category request is still pending.':'Category review status updated.');}
  catch(error){setCategoryStatus(error.message,true);}finally{button.disabled=false;}
 });
}
async function handleCategoryAppeal(){
 if(savingWorkspace||publishChecking)return;
 const reason=document.getElementById('category-appeal-reason').value;
 if(reason.trim().length<20){setCategoryStatus('Explain your choice in at least 20 characters.',true);return;}
 const snapshot=articleFingerprint(),reviewId=categoryReview?.id;
 const button=document.querySelector('[data-request-review]');button.disabled=true;savingWorkspace=true;
 document.querySelectorAll('#save-draft-btn,#publish-btn').forEach(b=>b.disabled=true);
 try{
  if(snapshot!==categoryReviewFingerprint)throw new Error('The article changed. Run the publishing check again.');
  if(article?.status!=='published'){
   articleId=await saveArticleWorkspace(articleId,readForm(),false);
   article={...article,id:articleId,status:'draft'};
   window.history.replaceState(null,'',`article-editor.html?id=${articleId}`);
  }
  if(snapshot!==articleFingerprint())throw new Error('The article changed while saving. Check the new version before requesting a review.');
  const record=await requestCategoryReview(reviewId,reason,articleId);
  setCategoryReview({...categoryReview,...record},snapshot);renderCategorySuggestion();updatePublishingState();
  setCategoryStatus('Category request submitted. The submitted version is saved for review; your article has not been published.');
 }catch(error){setCategoryStatus(error.message,true);}finally{savingWorkspace=false;button.disabled=false;const save=document.getElementById('save-draft-btn');if(save)save.disabled=false;updatePublishingState();}
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
  renderCategorySuggestion();
  updatePublishingState();

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
  if (publishChecking && !credibilityResult) {
    lock.textContent = 'Checking credibility and category…';
    lock.className = 'publish-lock';
    return;
  }

  if (passed) {
    lock.textContent = `Credibility ${credibilityResult.score}% and category approved — publishing is unlocked.`;
    lock.className = "publish-lock is-ready";
  } else if (credibilityResult?.criticalIssue) {
    lock.textContent = "A critical issue was found — publishing remains locked until the article is revised and rechecked.";
    lock.className = "publish-lock is-blocked";
  } else if (credibilityResult && verifiedFingerprint===articleFingerprint() && categoryReview && !['ai_passed','approved'].includes(categoryReview.status)) {
    lock.textContent='Category checking has not passed. Choose a suitable category and recheck, or request administrator review.';
    lock.className='publish-lock is-blocked';
  } else if (credibilityResult && Date.parse(credibilityResult.expiresAt)<=Date.now()) {
    lock.textContent='Publishing checks expired. Run Check before publishing again.';lock.className='publish-lock is-blocked';
  } else if (credibilityResult) {
    lock.textContent = `Credibility score ${credibilityResult.score}% — revise the article and recheck before publishing.`;
    lock.className = "publish-lock is-blocked";
  } else if (credibilityWasInvalidated) {
    lock.textContent = "The article changed after checking. Run Check before publishing again.";
    lock.className = "publish-lock is-blocked";
  } else {
    lock.textContent = isPublished
      ? "Run Check before publishing before saving changes to this published article."
      : "Run Check before publishing to unlock publishing.";
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
        <strong>${passed ? "Credibility passed" : "Credibility needs revision"}</strong>
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
 if(publishChecking)return;
 const values=readForm(),button=document.getElementById('check-credibility-btn'),status=document.getElementById('credibility-status');
 if(!values.title.trim()||!values.content.trim()||values.categoryIds.length!==1){status.textContent='Add a title, article content and one category before checking.';status.classList.add('is-error');return;}
 publishChecking=true;const token=++publishRequest,fingerprint=articleFingerprint(values);
 credibilityResult=null;verifiedFingerprint=null;credibilityWasInvalidated=false;setCategoryReview(null,null);setCategoryStatus('');renderCredibilityResult();renderCategorySuggestion();updatePublishingState();
 button.disabled=true;button.textContent='Checking credibility and category…';status.textContent='Reviewing credibility and the selected category…';status.classList.remove('is-error');
 try{
  const result=await checkArticleCredibility(values);
  if(token!==publishRequest)return;
  if(fingerprint!==articleFingerprint())throw new Error('The article changed while checking. Run the check again for the new version.');
  credibilityResult=result;verifiedFingerprint=fingerprint;credibilityWasInvalidated=false;
  setCategoryReview(result.categoryReview,fingerprint);
  renderCredibilityResult();renderCategorySuggestion();updatePublishingState();
  status.textContent=hasCurrentPassingCheck()?'Credibility and category passed. Publishing is available for this version.':'Checks completed. Review the credibility and category results before publishing.';
 }catch(error){if(token===publishRequest){status.textContent=error.message;status.classList.add('is-error');}}
 finally{if(token===publishRequest){publishChecking=false;button.disabled=false;button.textContent='Check before publishing';updatePublishingState();}}
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
    setAiStatus('Original content restored. Save when ready; a new publishing check is required before publishing.');
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
  try {
   const review=await getArticleCategoryReview(articleId);
   if(review){const snap=review.snapshot;setCategoryReview(review,publishingFingerprint({title:snap.title,content:snap.content,categoryIds:snap.category_ids.map(String),tagIds:snap.tag_ids.map(String)}));renderCategorySuggestion();updatePublishingState();}
  } catch(error){setCategoryStatus(error.message,true);}
  return true;
}

async function handleSaveDraft() {
  const values = readForm();
  const isPublished = article?.status === "published";

  if (isPublished && !hasCurrentPassingCheck()) {
    setStatus("Run and pass the publishing checks before saving changes to a published article.", true);
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
    setStatus('Run and pass the publishing checks for the current article before publishing.', true);
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
