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
