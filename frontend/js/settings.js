import { requireAuth } from './auth.js?v=account-name-20261029';
import { getMyAccountSettings, updateMyDisplayName, requestPasswordReset, getPasswordResetRedirect } from '../../services/accountSettingsService.js?v=account-settings-20261027';
const nameInput = document.getElementById('display-name');
const saveButton = document.getElementById('save-name');
const resetButton = document.getElementById('send-reset');
const loading = document.getElementById('settings-loading');
const retry = document.getElementById('settings-retry');
const resetDestination = getPasswordResetRedirect(window.location.href);
if (new URL(resetDestination).origin !== window.location.origin) {
  document.getElementById('reset-destination').hidden = false;
}
let account = null, saving = false, sending = false;
function status(id, text, error = false) {
  const node = document.getElementById(id); node.textContent = text; node.classList.toggle('is-error', error);
}
async function load() {
  retry.hidden = true; loading.hidden = false; loading.classList.remove('is-error'); loading.textContent = 'Loading account settings…';
  try {
    account = await getMyAccountSettings();
    nameInput.value = account.displayName;
    document.getElementById('settings-email').textContent = account.email;
    resetButton.disabled = !account.email;
    document.getElementById('settings-forms').hidden = false; loading.hidden = true;
  } catch (error) { loading.textContent = error.message; loading.classList.add('is-error'); retry.hidden = false; }
}
retry.addEventListener('click', load);
document.getElementById('display-name-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!account || saving) return;
  const submitted = nameInput.value; saving = true; saveButton.disabled = true; status('name-status', 'Saving display name…');
  try {
    const name = await updateMyDisplayName(submitted); account.displayName = name;
    const unchanged = nameInput.value === submitted;
    if (unchanged) nameInput.value = name;
    const label = document.getElementById('user-label'); if (label) label.textContent = name;
    status('name-status', unchanged ? 'Display name saved successfully.' : 'Display name saved. Your newer edits are not saved yet.');
  } catch (error) { status('name-status', error.message, true); }
  finally { saving = false; saveButton.disabled = false; }
});
resetButton.addEventListener('click', async () => {
  if (!account?.email || sending) return;
  sending = true; resetButton.disabled = true; status('reset-status', 'Requesting a reset email…');
  try {
    await requestPasswordReset(account.email, resetDestination);
    status('reset-status', 'Reset email requested. Check your inbox and spam folder. Only the latest reset link should be used.');
    window.setTimeout(() => { sending = false; resetButton.disabled = false; }, 60000);
  } catch (error) { status('reset-status', error.message, true); sending = false; resetButton.disabled = false; }
});
(async () => { const user = await requireAuth(); if (user) await load(); })();
