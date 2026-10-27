import { requestPasswordReset, watchPasswordRecovery, finishPasswordRecovery, getPasswordResetRedirect } from '../../services/accountSettingsService.js?v=account-settings-20261027';
const requestForm = document.getElementById('reset-request-form');
const passwordForm = document.getElementById('new-password-form');
const requestButton = document.getElementById('request-reset');
const updateButton = document.getElementById('update-password');
const message = document.getElementById('recovery-message');
const description = document.getElementById('recovery-description');
let verified = false, busy = false, completed = false;
function show(text, error = false) {
  const paragraph = document.createElement('p'); paragraph.className = `auth-message ${error ? 'is-error' : 'is-success'}`;
  paragraph.textContent = text; message.replaceChildren(paragraph);
}
const stopWatching = watchPasswordRecovery(email => {
  if (completed) return;
  verified = true; requestForm.hidden = true; passwordForm.hidden = false; message.replaceChildren();
  description.textContent = `Set a new password for ${email || 'your account'}.`;
}, () => {
  verified = false;
  if (!completed) { passwordForm.hidden = true; requestForm.hidden = false; description.textContent = 'Your reset session has ended. Request a new reset link.'; }
});
// Supabase consumes and validates the recovery token. A normal signed-in
// session, or a hand-written URL flag, does not unlock the password form.
const url = new URL(window.location.href);
const hash = new URLSearchParams(url.hash.slice(1));
if (url.searchParams.has('error') || hash.has('error')) {
  show('This reset link is invalid or has expired. Request a new reset email.', true);
  window.history.replaceState(null, '', url.pathname);
}
requestForm.addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return;
  busy = true; requestButton.disabled = true;
  try {
    await requestPasswordReset(document.getElementById('reset-email').value, getPasswordResetRedirect(window.location.href));
    show('If an account exists for this email, a reset link will be sent. Check your inbox and spam folder.');
    window.setTimeout(() => { busy = false; requestButton.disabled = false; }, 60000);
  } catch (error) { show(error.message, true); busy = false; requestButton.disabled = false; }
});
passwordForm.addEventListener('submit', async event => {
  event.preventDefault(); if (!verified || busy) return;
  const password = document.getElementById('new-password').value;
  if (password !== document.getElementById('confirm-password').value) { show('The passwords do not match.', true); return; }
  busy = true; updateButton.disabled = true;
  try {
    // Signed-out events after a successful update must not reopen the form.
    completed = true;
    const result = await finishPasswordRecovery(password);
    verified = false; passwordForm.reset(); passwordForm.hidden = true; requestForm.hidden = true;
    description.textContent = 'Your password has been updated.';
    show(result.signedOut ? 'Password changed successfully. You can now log in with your new password.' : 'Password changed successfully. Please log out of this browser before logging in with your new password.');
    window.history.replaceState(null, '', window.location.pathname);
  } catch (error) {
    completed = false; show(error.message, true);
    if (!verified) { passwordForm.reset(); passwordForm.hidden = true; requestForm.hidden = false; description.textContent = 'Your reset session has ended. Request a new reset link.'; }
  }
  finally { busy = false; updateButton.disabled = false; }
});
window.addEventListener('pagehide', () => stopWatching(), { once: true });

window.addEventListener('pageshow', event => {
  if (event.persisted && !completed) {
    verified = false; passwordForm.reset(); passwordForm.hidden = true; requestForm.hidden = false;
    description.textContent = 'Request a new reset link to continue securely.';
  }
});
