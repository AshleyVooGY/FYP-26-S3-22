import { supabase } from '../config/supabaseClient.js';

async function call(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(['PGRST202', '42883'].includes(error.code)
    ? 'Premium requests are not available yet. Please try again later.'
    : error.message || 'Unable to load Premium requests. Please try again.');
  return data;
}
function checkedStatus(data) {
  if (!data || !['free', 'premium'].includes(data.tier)
    || !['none', 'pending', 'approved', 'rejected'].includes(data.status)) {
    throw new Error('Unable to confirm your plan. Please try again.');
  }
  return data;
}
export async function getMyPremiumStatus() {
  return checkedStatus(await call('get_my_premium_status'));
}
export async function requestPremiumUpgrade() {
  return checkedStatus(await call('request_premium_upgrade'));
}
export async function getPendingPremiumRequests() {
  const data = await call('get_pending_premium_requests');
  if (!Array.isArray(data)) throw new Error('Unable to load Premium requests.');
  return data;
}
export async function reviewPremiumUpgrade(userId, approve, requestedAt) {
  await call('review_premium_upgrade', { p_user_id: userId, p_approve: approve, p_requested_at: requestedAt });
}
