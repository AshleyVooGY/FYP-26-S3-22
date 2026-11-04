import { getNotificationCount, getNotifications, markNotificationsRead, watchNotificationAccount } from '../../services/notificationService.js?v=notifications-20261027';
import { escapeHtml, formatRelativeTime } from './format.js';

export function setupNotifications(user) {
  const bell = document.querySelector('.topbar__actions .icon-btn[aria-label="Notifications"]');
  if (!bell || bell.dataset.notificationsReady) return;
  bell.dataset.notificationsReady = 'true';
  bell.classList.add('notification-bell');
  bell.removeAttribute('title'); bell.removeAttribute('disabled');
  bell.setAttribute('aria-expanded', 'false'); bell.setAttribute('aria-controls', 'notification-panel');
  const badge = document.createElement('span'); badge.className = 'notification-badge'; badge.hidden = true; badge.setAttribute('aria-hidden', 'true'); bell.append(badge);
  if (!document.querySelector('[data-notification-styles]')) {
    const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = new URL('../css/notifications.css?v=notifications-20261027', import.meta.url).href;
    style.dataset.notificationStyles = ''; document.head.append(style);
  }
  const panel = document.createElement('section'); panel.id = 'notification-panel'; panel.className = 'notification-panel'; panel.hidden = true;
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-labelledby', 'notification-heading');
  panel.innerHTML = `<header><h2 id="notification-heading">Notifications</h2><button type="button" data-notifications-close aria-label="Close notifications">×</button></header>
    <div class="notification-actions"><button type="button" data-notifications-refresh>Refresh</button><button type="button" data-notifications-all>Mark all as read</button></div>
    <p class="notification-status" role="status" aria-live="polite"></p><div class="notification-list"></div>
    <button type="button" data-notifications-more hidden>Load more</button>`;
  document.body.append(panel);
  const list = panel.querySelector('.notification-list'), status = panel.querySelector('.notification-status');
  const more = panel.querySelector('[data-notifications-more]'), markAll = panel.querySelector('[data-notifications-all]');
  let activeUser = user?.id ?? null, generation = 0, items = [], cursor = null, unread = 0;
  let loading = false, reading = false, failed = false, counting = false, timer = null;
  let countRevision = 0;
  const countLabel = () => {
    badge.textContent = unread > 99 ? '99+' : String(unread); badge.hidden = !unread;
    bell.setAttribute('aria-label', unread ? `Notifications, ${unread} unread` : 'Notifications');
    markAll.disabled = !unread || reading || loading;
  };
  function close(returnFocus = false) { panel.hidden = true; bell.setAttribute('aria-expanded', 'false'); if (returnFocus) bell.focus(); }
  function message(text, error = false) { status.textContent = text; status.classList.toggle('is-error', error); }
  function draw() {
    list.setAttribute('aria-busy', String(loading));
    list.innerHTML = items.length ? items.map(item => {
      const verb = item.kind === 'comment' ? 'commented on' : 'reacted to';
      const reaction = { like: 'Like', love: 'Love', haha: 'Haha', wow: 'Wow', sad: 'Sad', angry: 'Angry' }[item.reaction_type];
      return `<a class="notification-item ${item.read_at ? '' : 'is-unread'}" href="article.html?id=${encodeURIComponent(item.article_id)}${item.kind === 'comment' ? '#article-comments' : ''}" data-notification-id="${escapeHtml(String(item.id))}">
        <span><strong>${escapeHtml(item.actor_name || 'A reader')}</strong> ${verb} “${escapeHtml(item.article_title || 'your article')}”</span>
        <small>${reaction ? `${reaction} · ` : ''}${escapeHtml(formatRelativeTime(item.created_at))}${item.read_at ? '' : ' · Unread'}</small></a>`;
    }).join('') : `<p class="notification-empty">${loading ? 'Loading notifications…' : failed ? 'Notifications could not be loaded.' : 'No notifications yet.'}</p>`;
    more.hidden = !cursor && !failed; more.disabled = loading || reading;
    more.textContent = loading ? 'Loading…' : failed ? 'Try again' : 'Load more';
    panel.querySelector('[data-notifications-refresh]').disabled = loading || reading;
    countLabel();
  }
  async function refreshCount() {
    if (!activeUser || counting || document.visibilityState === 'hidden') return;
    const token = generation, revision = countRevision;
    counting = true;
    try {
      const total = await getNotificationCount();
      if (token === generation && revision === countRevision) { unread = total; countLabel(); }
    } catch { /* Opening the panel supplies an actionable error/retry state. */ }
    finally { if (token === generation) counting = false; }
  }
  async function load(reset = false) {
    if (!activeUser || loading || reading) return;
    const token = generation, revision = countRevision;
    if (reset) { items = []; cursor = null; }
    loading = true; failed = false; message(''); draw();
    try {
      const page = await getNotifications(cursor);
      if (token !== generation) return;
      const seen = new Set(items.map(item => String(item.id)));
      items.push(...page.notifications.filter(item => !seen.has(String(item.id)))); cursor = page.next_cursor ?? null;
      if (revision === countRevision) unread = page.unread_count;
    } catch (error) { if (token === generation) { failed = true; message(error.message, true); } }
    finally { if (token === generation) { loading = false; draw(); } }
  }
  bell.addEventListener('click', () => {
    if (!activeUser) return;
    if (!panel.hidden) { close(); return; }
    panel.hidden = false; panel.style.top = `${Math.min(bell.getBoundingClientRect().bottom + 10, 120)}px`;
    bell.setAttribute('aria-expanded', 'true'); panel.querySelector('[data-notifications-close]').focus(); load(true);
  });
  panel.querySelector('[data-notifications-close]').addEventListener('click', () => close(true));
  panel.querySelector('[data-notifications-refresh]').addEventListener('click', () => load(true));
  more.addEventListener('click', () => load());
  document.addEventListener('click', event => { if (!panel.hidden && !panel.contains(event.target) && !bell.contains(event.target)) close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) { event.preventDefault(); close(true); } });
  markAll.addEventListener('click', async () => {
    if (reading || loading || !activeUser) return;
    const token = generation;
    reading = true; countRevision++; draw(); message('Marking notifications as read…');
    try {
      const total = await markNotificationsRead();
      if (token !== generation) return;
      unread = total; items = items.map(item => ({ ...item, read_at: item.read_at || new Date().toISOString() })); message('Notifications marked as read.');
    } catch (error) { if (token === generation) message(error.message, true); }
    finally { if (token === generation) { reading = false; draw(); } }
  });
  list.addEventListener('click', async event => {
    const link = event.target.closest('[data-notification-id]');
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const token = generation;
    countRevision++;
    try {
      const total = await markNotificationsRead([Number(link.dataset.notificationId)]);
      if (token === generation) {
        unread = total;
        items = items.map(item => String(item.id) === link.dataset.notificationId
          ? { ...item, read_at: item.read_at || new Date().toISOString() } : item);
      }
    }
    catch { /* Reading the article remains available if marking read fails. */ }
    if (token === generation) { draw(); close(); window.location.href = link.href; }
  });
  function switchAccount(id) {
    if (id === activeUser) return;
    activeUser = id; generation++; items = []; cursor = null; unread = 0;
    loading = false; reading = false; counting = false; failed = false; countRevision++;
    close(); message(''); bell.hidden = !id; draw(); refreshCount();
  }
  const unwatch = watchNotificationAccount(switchAccount);
  function startPolling() { clearInterval(timer); timer = setInterval(refreshCount, 30000); }
  window.addEventListener('focus', refreshCount);
  document.addEventListener('visibilitychange', refreshCount);
  window.addEventListener('pagehide', event => { clearInterval(timer); if (!event.persisted) unwatch(); });
  window.addEventListener('pageshow', event => { if (event.persisted) { startPolling(); refreshCount(); } });
  bell.hidden = !activeUser; draw(); startPolling(); refreshCount();
}
