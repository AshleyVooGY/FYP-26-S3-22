import { supabase } from '../config/supabaseClient.js';

export function validateDisplayName(value) {
  const name = String(value ?? '').trim();
  if (!name || [...name].length > 60 || /[\u0000-\u001f\u007f]/u.test(name)) {
    throw new Error('Enter a display name of 1–60 characters, without line breaks.');
  }
  return name;
}
function settingsError(error) {
  return new Error(['PGRST202', '42883'].includes(error?.code)
    ? 'Account settings are being set up. Please try again later.'
    : error?.message || 'Unable to update your account. Please try again.');
}
/** Read only the signed-in account's Settings name; never expose email in the header. */
export async function getMyDisplayName(user) {
  if (!user) return 'Guest';
  const fallback = typeof user.user_metadata?.display_name === 'string'
    ? user.user_metadata.display_name.trim() : '';
  try {
    const { data, error } = await supabase.from('profiles')
      .select('display_name').eq('id', user.id).maybeSingle();
    const name = typeof data?.display_name === 'string' ? data.display_name.trim() : '';
    if (!error && name) return name;
  } catch { /* A profile read failure must not break the shared navigation. */ }
  return fallback || 'Account';
}

export async function getMyAccountSettings() {
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) throw new Error('Please sign in to manage your account.');
    const result = await supabase.from('profiles').select('display_name').eq('id', user.id).single();
    if (result.error) throw result.error;
    return { displayName: result.data.display_name, email: user.email ?? '' };
  } catch (error) { throw settingsError(error); }
}
export async function updateMyDisplayName(value) {
  try {
    const name = validateDisplayName(value);
    const { data, error } = await supabase.rpc('update_my_display_name', { p_display_name: name });
    if (error) throw error;
    if (typeof data !== 'string' || !data) throw new Error('Unable to confirm your display name. Please reload and try again.');
    return data;
  } catch (error) { throw settingsError(error); }
}
export function getPasswordResetRedirect(pageUrl) {
  const page = new URL(pageUrl);
  // The project already permits its published GitHub Pages URLs. Local
  // origins are not in its Auth redirect allowlist, so do not send a link
  // that would silently fall back to the login page instead of recovery.
  if (['localhost', '127.0.0.1', '[::1]'].includes(page.hostname)) {
    return 'https://ashleyvoogy.github.io/FYP-26-S3-22/frontend/reset-password.html';
  }
  return new URL('reset-password.html', page).href;
}
export async function requestPasswordReset(email, redirectTo) {
  const address = String(email ?? '').trim();
  if (!address || address.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error('Enter a valid email address.');
  const target = new URL(redirectTo);
  if (!['https:', 'http:'].includes(target.protocol) || target.pathname.split('/').pop() !== 'reset-password.html') throw new Error('Invalid password reset destination.');
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(address, { redirectTo: target.href });
    if (error) throw error;
  } catch (error) {
    if (error?.status === 429 || ['over_email_send_rate_limit', 'over_request_rate_limit'].includes(error?.code)) throw new Error('Too many requests. Please wait a few minutes before requesting another email.');
    throw new Error('The reset email could not be requested. Please try again later.');
  }
}
let recoveryUserId = null;
export function watchPasswordRecovery(onRecovery, onSessionEnd) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY' && session?.user) { recoveryUserId = session.user.id; onRecovery(session.user.email ?? ''); }
    else if (event === 'SIGNED_OUT' || (recoveryUserId && session?.user?.id !== recoveryUserId)) { recoveryUserId = null; onSessionEnd(); }
  });
  return () => data.subscription.unsubscribe();
}
export async function finishPasswordRecovery(password) {
  const verifiedUserId = recoveryUserId;
  if (!verifiedUserId) throw new Error('Open a valid password reset link from your email first.');
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) throw new Error('Use a password of 12–128 characters.');
  // The recovery page enables this operation only after PASSWORD_RECOVERY.
  // Supabase verifies the recovery session and applies the project's password policy.
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user || user.id !== verifiedUserId || recoveryUserId !== verifiedUserId) throw new Error('Your reset session expired. Request a new reset link.');
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(error.code === 'same_password' ? 'Choose a password different from your current password.' : 'The password could not be changed. Check the password requirements or request a new reset link.');
  recoveryUserId = null;
  const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
  return { signedOut: !signOutError };
}
