import { requireAdmin } from "./auth.js?v=premium-approval-20261105";
import { getAllProfiles, setUserRole, setUserSubscriptionTier } from "../../services/userManagementService.js?v=required-category-20261022";
import { getPendingPremiumRequests, reviewPremiumUpgrade } from "../../services/premiumService.js?v=premium-approval-20261105";
import { escapeHtml, forbiddenStateHtml } from "./format.js";

let currentAdminId = null;
let profiles = [];
let premiumRequests = [];
let pendingChange = null;
let updating = false;
const roleName = role => role === 'system_admin' ? 'System Admin' : 'Registered User';
const tierName = tier => tier === 'premium' ? 'Premium' : 'Free';

function rowHtml(p) {
  const isAdmin = p.role === 'system_admin';
  const isSelf = p.id === currentAdminId;
  const isPremium = p.subscription_tier === 'premium';
  return `<tr>
    <td>${escapeHtml(p.display_name)}${isSelf ? ' (you)' : ''}<small class="user-account-id">ID: ${escapeHtml(p.id)}</small></td>
    <td><span class="badge">${roleName(p.role)}</span></td>
    <td><button class="article-action is-live" data-id="${escapeHtml(p.id)}" data-next-role="${isAdmin ? 'registered_user' : 'system_admin'}" ${isSelf ? 'disabled title="Can\'t change your own role"' : ''}>${isAdmin ? 'Demote to User' : 'Promote to Admin'}</button></td>
    <td><span class="plan-badge plan-badge--${isPremium ? 'premium' : 'free'}">${tierName(p.subscription_tier)}</span></td>
    <td><button class="article-action is-live" data-id="${escapeHtml(p.id)}" data-next-tier="${isPremium ? 'free' : 'premium'}">${isPremium ? 'Downgrade to Free' : 'Upgrade to Premium'}</button></td>
  </tr>`;
}

function feedback(message, error = false) {
  const status = document.getElementById('user-change-status');
  status.textContent = message;
  status.classList.toggle('is-error', error);
}

function render() {
  document.getElementById('users-table').innerHTML = `<div class="analytics-panel"><table class="data-table">
    <thead><tr><th>Name / Account ID</th><th>Role</th><th></th><th>Plan</th><th></th></tr></thead>
    <tbody>${profiles.map(rowHtml).join('')}</tbody></table></div>`;
}

function renderPremiumRequests() {
  const slot = document.getElementById('premium-requests-list');
  slot.innerHTML = premiumRequests.length ? `<div class="premium-request-list">${premiumRequests.map(request => `
    <div class="premium-request-row">
      <div><strong>${escapeHtml(request.display_name)}</strong><small class="user-account-id">ID: ${escapeHtml(request.user_id)}</small><small>Requested ${escapeHtml(new Date(request.requested_at).toLocaleString())}</small></div>
      <div class="premium-request-actions"><button type="button" class="article-action is-live" data-request-id="${escapeHtml(request.user_id)}" data-request-action="reject">Reject</button><button type="button" class="article-action is-live" data-request-id="${escapeHtml(request.user_id)}" data-request-action="approve">Approve</button></div>
    </div>`).join('')}</div>` : '<p class="state-message">No pending Premium requests.</p>';
}
async function refreshPremiumRequests() {
  const button = document.getElementById('premium-requests-refresh');
  button.disabled = true;
  try { premiumRequests = await getPendingPremiumRequests(); renderPremiumRequests(); }
  catch (error) { document.getElementById('premium-requests-list').textContent = error.message; }
  finally { button.disabled = false; }
}
function openPremiumConfirmation(button) {
  if (updating) return;
  const request = premiumRequests.find(item => item.user_id === button.dataset.requestId);
  if (!request) return;
  const approve = button.dataset.requestAction === 'approve';
  pendingChange = { id: request.user_id, kind: 'premium_request', approve, requestedAt: request.requested_at, displayName: request.display_name };
  document.getElementById('user-confirm-title').textContent = approve ? 'Approve Premium request?' : 'Reject Premium request?';
  document.getElementById('user-confirm-account').textContent = request.display_name;
  document.getElementById('user-confirm-id').textContent = request.user_id;
  document.getElementById('user-confirm-change').textContent = approve ? 'Free → Premium' : 'Keep Free plan';
  document.getElementById('user-confirm-impact').textContent = approve ? 'This grants higher optional AI writing limits. The account’s role stays the same.' : 'The account stays on Free. The user can see the result and submit a new request later.';
  document.getElementById('user-confirm-error').textContent = '';
  document.getElementById('user-change-dialog').showModal();
}

function openConfirmation(button) {
  if (updating) return;
  const profile = profiles.find(p => p.id === button.dataset.id);
  if (!profile) return;
  const kind = button.dataset.nextRole ? 'role' : 'plan';
  if (kind === 'role' && profile.id === currentAdminId) return;
  const field = kind === 'role' ? 'role' : 'subscription_tier';
  const next = kind === 'role' ? button.dataset.nextRole : button.dataset.nextTier;
  const name = kind === 'role' ? roleName : tierName;
  pendingChange = { id: profile.id, kind, field, previous: profile[field], next };
  document.getElementById('user-confirm-title').textContent = `Confirm ${kind} change`;
  document.getElementById('user-confirm-account').textContent = profile.display_name;
  document.getElementById('user-confirm-id').textContent = profile.id;
  document.getElementById('user-confirm-change').textContent = `${name(profile[field])} → ${name(next)}`;
  document.getElementById('user-confirm-impact').textContent = kind === 'plan'
    ? 'This changes subscription features only. The account’s role and administrator permissions will stay the same.'
    : next === 'system_admin'
      ? 'This account will gain access to user, classification, content and analytics management.'
      : 'This account will lose access to administrator functions. Its subscription plan will stay the same.';
  document.getElementById('user-confirm-error').textContent = '';
  document.getElementById('user-change-dialog').showModal();
}

async function confirmChange() {
  if (!pendingChange || updating) return;
  const change = { ...pendingChange };
  const dialog = document.getElementById('user-change-dialog');
  const confirm = document.getElementById('user-confirm-submit');
  const cancel = document.getElementById('user-confirm-cancel');
  const error = document.getElementById('user-confirm-error');
  updating = true;
  confirm.disabled = cancel.disabled = true;
  confirm.textContent = 'Updating…';
  error.textContent = '';
  try {
    if (change.kind === 'premium_request') {
      await reviewPremiumUpgrade(change.id, change.approve, change.requestedAt);
      premiumRequests = premiumRequests.filter(request => request.user_id !== change.id);
      if (change.approve) profiles = profiles.map(profile => profile.id === change.id ? { ...profile, subscription_tier: 'premium' } : profile);
      renderPremiumRequests();
      render();
      pendingChange = null;
      dialog.close();
      feedback(`Premium request ${change.approve ? 'approved' : 'rejected'}: ${change.displayName}.`);
      return;
    }
    // Recheck the displayed value before writing: another admin may have
    // changed the account while this confirmation was open.
    const fresh = await getAllProfiles();
    const target = fresh.find(p => p.id === change.id);
    if (!target || target[change.field] !== change.previous) {
      profiles = fresh;
      render();
      pendingChange = null;
      dialog.close();
      feedback('This account changed or is no longer available. Review the updated list before trying again.', true);
      return;
    }
    if (change.kind === 'role') await setUserRole(change.id, change.next);
    else await setUserSubscriptionTier(change.id, change.next);
    profiles = fresh.map(p => p.id === change.id ? { ...p, [change.field]: change.next } : p);
    render();
    if (change.kind === 'plan' && change.next === 'premium') { premiumRequests = premiumRequests.filter(request => request.user_id !== change.id); renderPremiumRequests(); }
    pendingChange = null;
    dialog.close();
    const label = change.kind === 'role' ? roleName(change.next) : tierName(change.next);
    feedback(`${change.kind === 'role' ? 'Role' : 'Plan'} updated successfully: ${target.display_name} (ID: ${target.id}) → ${label}.`);
  } catch (err) {
    error.textContent = `Could not update ${change.kind === 'premium_request' ? 'Premium request' : change.kind}: ${err.message}. No successful change was confirmed. You can retry or cancel.`;
  } finally {
    updating = false;
    confirm.disabled = cancel.disabled = false;
    confirm.textContent = 'Confirm change';
  }
}

async function init() {
  const admin = await requireAdmin();
  const slot = document.getElementById('users-slot');
  if (!admin) { slot.innerHTML = forbiddenStateHtml(); return; }
  currentAdminId = admin.id;
  slot.innerHTML = `<p id="user-change-status" class="state-message" role="status" aria-live="polite"></p>
    <section class="analytics-panel premium-requests-panel" aria-labelledby="premium-requests-title">
      <div class="premium-requests-heading"><h2 id="premium-requests-title">Premium requests</h2><button type="button" id="premium-requests-refresh" class="article-action is-live">Refresh</button></div>
      <div id="premium-requests-list"><p class="state-message">Loading requests…</p></div>
    </section>
    <div id="users-table"><p class="state-message">Loading…</p></div>
    <dialog id="user-change-dialog" aria-labelledby="user-confirm-title" aria-describedby="user-confirm-impact">
      <h2 id="user-confirm-title"></h2>
      <p><strong>Account:</strong> <span id="user-confirm-account"></span><small class="user-account-id">ID: <span id="user-confirm-id"></span></small></p>
      <p id="user-confirm-change" class="user-confirm-change"></p><p id="user-confirm-impact"></p>
      <p id="user-confirm-error" class="state-message is-error" role="alert"></p>
      <div class="user-confirm-actions"><button id="user-confirm-cancel" class="article-action is-live" type="button" autofocus>Cancel</button><button id="user-confirm-submit" class="article-action is-live" type="button">Confirm change</button></div>
    </dialog>`;
  const dialog = document.getElementById('user-change-dialog');
  dialog.addEventListener('cancel', event => { if (updating) event.preventDefault(); });
  dialog.addEventListener('close', () => { pendingChange = null; });
  document.getElementById('user-confirm-cancel').addEventListener('click', () => { if (!updating) dialog.close(); });
  document.getElementById('user-confirm-submit').addEventListener('click', confirmChange);
  document.getElementById('users-table').addEventListener('click', event => {
    const button = event.target.closest('button[data-id]');
    if (button && !button.disabled) openConfirmation(button);
  });
  document.getElementById('premium-requests-refresh').addEventListener('click', refreshPremiumRequests);
  document.getElementById('premium-requests-list').addEventListener('click', event => {
    const button = event.target.closest('button[data-request-id]');
    if (button) openPremiumConfirmation(button);
  });
  refreshPremiumRequests();
  try { profiles = await getAllProfiles(); render(); }
  catch (err) { feedback(`Could not load users: ${err.message}`, true); document.getElementById('users-table').innerHTML = ''; }
}
init();
