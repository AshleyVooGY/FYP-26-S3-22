import { getArticleComments, createArticleComment, deleteArticleComment } from '../../services/commentService.js?v=comments-20261027';
import { escapeHtml, formatRelativeTime } from './format.js';

export function setupComments(articleId) {
  const root = document.getElementById('article-comments');
  if (!root) return;
  let comments = [], cursor = null, loading = false, posting = false, deleting = false;
  let request = null, loaded = false, failedLoad = false;
  const deletedIds = new Set();
  root.innerHTML = `<h2 id="comments-heading">Comments</h2>
    <form class="comment-form"><label for="comment-body">Add a comment</label>
      <textarea id="comment-body" rows="3" maxlength="1000" placeholder="Share your thoughts about this article…" aria-describedby="comment-help"></textarea>
      <div class="comment-form__footer"><span id="comment-help">Up to 1000 characters · <span data-comment-length>0</span>/1000</span>
      <button class="article-action is-live" type="submit">Post comment</button></div>
    </form><p class="comment-status" role="status" aria-live="polite"></p>
    <div class="comment-list" aria-busy="true"></div>
    <button type="button" class="article-action is-live" data-comments-more hidden>Load more comments</button>
    <dialog class="comment-delete-dialog" aria-labelledby="comment-delete-heading"><h3 id="comment-delete-heading">Delete this comment?</h3>
      <p>This will remove the comment permanently.</p><div class="comment-dialog-actions"><button type="button" class="article-action is-live" data-comment-cancel>Cancel</button>
      <button type="button" class="article-action is-live" data-comment-confirm>Delete comment</button></div></dialog>`;
  const form = root.querySelector('form'), input = root.querySelector('textarea');
  const submit = form.querySelector('button'), list = root.querySelector('.comment-list');
  const status = root.querySelector('.comment-status'), more = root.querySelector('[data-comments-more]');
  const dialog = root.querySelector('dialog');
  let deleteTarget = null;
  function message(text, error = false) {
    status.textContent = text;
    status.classList.toggle('is-error', error);
  }
  function draw() {
    list.setAttribute('aria-busy', String(loading));
    list.innerHTML = comments.length ? comments.map(comment => `<article class="comment-item" data-comment-id="${escapeHtml(String(comment.id))}">
      <header><strong>${escapeHtml(comment.author_name || 'User')}</strong><time datetime="${escapeHtml(comment.created_at)}">${escapeHtml(formatRelativeTime(comment.created_at))}</time>
      ${comment.can_delete ? `<button type="button" class="article-action is-live" data-delete-comment="${escapeHtml(String(comment.id))}" ${deleting ? 'disabled' : ''}>Delete</button>` : ''}</header>
      <p class="comment-body">${escapeHtml(comment.body)}</p></article>`).join('')
      : `<p class="state-message">${loading ? 'Loading comments…' : failedLoad ? 'Comments could not be loaded.' : 'No comments yet. Start the conversation.'}</p>`;
    more.hidden = !cursor && !failedLoad;
    more.disabled = loading;
    more.textContent = loading ? 'Loading…' : failedLoad ? 'Try again' : 'Load more comments';
  }
  async function load() {
    if (loading) return;
    loading = true; failedLoad = false; draw();
    try {
      const page = await getArticleComments(articleId, cursor);
      const seen = new Set(comments.map(item => String(item.id)));
      comments.push(...page.comments.filter(item => !seen.has(String(item.id)) && !deletedIds.has(String(item.id))));
      cursor = page.next_cursor ?? null; loaded = true;
      message('');
    } catch (error) { failedLoad = true; message(error.message, true); }
    finally { loading = false; draw(); }
  }
  input.addEventListener('input', () => {
    root.querySelector('[data-comment-length]').textContent = String(input.value.length);
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (posting) return;
    const original = input.value, body = original.trim();
    if (!body || body.length > 1000) { message('Write a comment of 1 to 1000 characters.', true); input.focus(); return; }
    if (!request || request.body !== body) request = { body, id: crypto.randomUUID() };
    posting = true; submit.disabled = true; submit.textContent = 'Posting…'; message('Posting your comment…');
    try {
      const comment = await createArticleComment(articleId, body, request.id);
      comments = [comment, ...comments.filter(item => String(item.id) !== String(comment.id))];
      if (input.value === original) { input.value = ''; root.querySelector('[data-comment-length]').textContent = '0'; }
      request = null;
      message('Comment posted.');
      // If the initial read failed, keep its retry rather than losing older comments.
      if (!loaded) failedLoad = true;
      draw();
    } catch (error) { message(error.message, true); }
    finally { posting = false; submit.disabled = false; submit.textContent = 'Post comment'; }
  });
  more.addEventListener('click', load);
  list.addEventListener('click', event => {
    const button = event.target.closest('[data-delete-comment]');
    if (!button || deleting) return;
    deleteTarget = button.dataset.deleteComment;
    dialog.showModal();
  });
  dialog.querySelector('[data-comment-cancel]').addEventListener('click', () => { deleteTarget = null; dialog.close(); });
  dialog.querySelector('[data-comment-confirm]').addEventListener('click', async () => {
    if (!deleteTarget || deleting) return;
    const id = deleteTarget;
    deleting = true;
    dialog.close(); draw(); message('Deleting comment…');
    try {
      await deleteArticleComment(id);
      deletedIds.add(id);
      comments = comments.filter(item => String(item.id) !== id); message('Comment deleted.');
    } catch (error) { message(error.message, true); }
    finally { deleting = false; deleteTarget = null; draw(); }
  });
  document.getElementById('comment-btn')?.addEventListener('click', () => {
    root.scrollIntoView({ behavior: 'smooth', block: 'start' }); input.focus({ preventScroll: true });
  });
  if (window.location.hash === '#article-comments') root.scrollIntoView({ block: 'start' });
  load();
}
