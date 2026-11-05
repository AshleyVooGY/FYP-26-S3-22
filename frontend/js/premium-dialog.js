let activeDialog = null;

export function showPremiumUpgradeDialog({ load, request, onChange }) {
  if (activeDialog) return;
  if (!document.getElementById('premium-dialog-styles')) {
    const styles = document.createElement('link');
    styles.id = 'premium-dialog-styles';
    styles.rel = 'stylesheet';
    styles.href = new URL('../css/premium-dialog.css?v=20261105', import.meta.url).href;
    document.head.append(styles);
  }
  const dialog = document.createElement('dialog');
  dialog.className = 'premium-dialog';
  dialog.setAttribute('aria-labelledby', 'premium-dialog-title');
  dialog.setAttribute('aria-describedby', 'premium-dialog-description');
  dialog.innerHTML = `
    <div class="premium-dialog__icon" aria-hidden="true">✦</div>
    <h2 id="premium-dialog-title">Request Premium</h2>
    <p id="premium-dialog-description">Loading your plan…</p>
    <p class="premium-dialog__note">Your account stays Free until an administrator approves your request. Article publishing checks are available on both plans.</p>
    <p class="premium-dialog__status" role="status" aria-live="polite" hidden></p>
    <div class="premium-dialog__actions">
      <button type="button" class="premium-dialog__cancel" autofocus>Not now</button>
      <button type="button" class="premium-dialog__confirm" disabled>Loading…</button>
    </div>`;
  document.body.append(dialog);
  activeDialog = dialog;
  const cancel = dialog.querySelector('.premium-dialog__cancel');
  const confirm = dialog.querySelector('.premium-dialog__confirm');
  const status = dialog.querySelector('.premium-dialog__status');
  const title = dialog.querySelector('h2');
  const description = dialog.querySelector('#premium-dialog-description');
  let pending = false;
  let account = null;
  function render() {
    const premium = account.tier === 'premium';
    const waiting = !premium && account.status === 'pending';
    const rejected = !premium && account.status === 'rejected';
    title.textContent = premium ? 'You’re on Premium' : waiting ? 'Pending approval' : 'Request Premium';
    description.textContent = premium ? 'Your account has higher optional AI writing limits.'
      : waiting ? 'Your request has been sent. An administrator will review it. You can continue using your Free plan.'
      : rejected ? 'Your previous request was declined. You can submit a new request for administrator review.'
      : 'Apply for higher limits on optional AI writing assistance.';
    confirm.textContent = premium || waiting ? 'Done' : 'Submit request';
    cancel.hidden = premium || waiting;
    dialog.querySelector('.premium-dialog__note').hidden = premium;
    onChange?.(account);
  }
  async function run(action) {
    pending = true;
    confirm.disabled = cancel.disabled = true;
    confirm.textContent = account ? 'Submitting…' : 'Loading…';
    dialog.setAttribute('aria-busy', 'true');
    status.hidden = true;
    try { account = await action(); render(); }
    catch (error) {
      status.textContent = error.message || 'Please try again.';
      status.hidden = false;
      if (!account) description.textContent = 'We could not load your plan. Please retry before submitting a request.';
      confirm.textContent = 'Try again';
    } finally {
      pending = false;
      confirm.disabled = cancel.disabled = false;
      dialog.removeAttribute('aria-busy');
    }
  }
  cancel.addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', event => { if (pending) event.preventDefault(); });
  dialog.addEventListener('close', () => { activeDialog = null; dialog.remove(); });
  confirm.addEventListener('click', async () => {
    if (pending) return;
    if (!account) return run(load);
    if (account.tier === 'premium' || account.status === 'pending') { dialog.close(); return; }
    await run(request);
    confirm.focus();
  });
  dialog.showModal();
  run(load);
}
