import { supabase } from '../config/supabaseClient.js';
function id(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error('Invalid notification.');
  return number;
}
function failure(error) {
  return new Error(['PGRST202', '42P01', '42883'].includes(error?.code)
    ? 'Notifications are being set up. Please try again later.'
    : error?.message || 'Notifications are unavailable. Please try again.');
}
function count(value) {
  const number = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isSafeInteger(number) || number < 0) throw new Error('Unable to read notification count.');
  return number;
}
export async function getNotificationCount() {
  try {
    const { data, error } = await supabase.rpc('get_article_notification_count');
    if (error) throw error;
    return count(data);
  } catch (error) { throw failure(error); }
}
export async function getNotifications(cursor = null) {
  try {
    const { data, error } = await supabase.rpc('get_article_notifications', { p_before_id: cursor === null ? null : id(cursor) });
    if (error) throw error;
    if (!Array.isArray(data?.notifications) || data.notifications.length > 20) throw new Error('Unable to load notifications.');
    return { ...data, unread_count: count(data.unread_count) };
  } catch (error) { throw failure(error); }
}
export async function markNotificationsRead(ids = null) {
  try {
    if (ids !== null && (!Array.isArray(ids) || ids.length > 1000)) throw new Error('Invalid notification selection.');
    const { data, error } = await supabase.rpc('mark_article_notifications_read', { p_ids: ids === null ? null : ids.map(id) });
    if (error) throw error;
    return count(data);
  } catch (error) { throw failure(error); }
}
export function watchNotificationAccount(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    // Defer work outside Supabase's auth callback to avoid nested auth locks.
    setTimeout(() => callback(session?.user?.id ?? null), 0);
  });
  return () => data.subscription.unsubscribe();
}
