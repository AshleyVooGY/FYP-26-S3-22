import { supabase } from '../config/supabaseClient.js';

function failure(error) {
  if (['42P01','PGRST202','PGRST205','42883'].includes(error?.code)) return new Error('News preferences are being updated. Please try again later.');
  if (/Premium feature|Upgrade your plan/i.test(error?.message || '')) return Object.assign(new Error(error.message), { premiumRequired: true });
  if(error?.code==='42501') return new Error('Please sign in again to use your news preferences.');
  if(error?.code==='22023' && /Preferences changed|feed has expired/i.test(error.message || '')) return new Error(error.message);
  if(error instanceof Error && !error.code) return error;
  return new Error('Unable to load or save your news preferences. Please try again.');
}
async function viewer() {
  const {data,error}=await supabase.auth.getUser();
  if (error || !data?.user) throw new Error('Please sign in to manage your news preferences.');
  return data.user;
}
function ids(values) {
  if (!Array.isArray(values)) throw new Error('Invalid preference selection.');
  const normalized=[...new Set(values.map(Number))];
  if (normalized.length>200 || normalized.some(id=>!Number.isSafeInteger(id)||id<=0)) throw new Error('Invalid preference selection.');
  return normalized;
}
export async function getNewsPreferences() {
  const user=await viewer();
  try {
    const results=await Promise.all([
      supabase.from('categories').select('id,name').order('name'),
      supabase.from('tags').select('id,name').order('name'),
      supabase.from('user_preferences').select('category_id').eq('user_id',user.id),
      supabase.from('user_tag_preferences').select('tag_id').eq('user_id',user.id),
      supabase.from('user_feed_settings').select('use_activity').eq('user_id',user.id).maybeSingle()
    ]);
    for(const result of results) if(result.error) throw result.error;
    return {useActivity:results[4].data?.use_activity ?? true,categories:results[0].data||[],tags:results[1].data||[],categoryIds:(results[2].data||[]).map(r=>Number(r.category_id)),tagIds:(results[3].data||[]).map(r=>Number(r.tag_id))};
  } catch(error) { throw failure(error); }
}
export async function saveNewsPreferences(categoryIds,tagIds,useActivity=true) {
  const categories=ids(categoryIds),tags=ids(tagIds);
  if(typeof useActivity!=='boolean') throw new Error('Invalid activity setting.');
  try {
    const {error}=await supabase.rpc('set_my_news_preferences',{p_category_ids:categories,p_tag_ids:tags,p_use_activity:useActivity});
    if(error) throw error;
  } catch(error) { throw failure(error); }
}
export async function getPersonalizedNews(cursor=null) {
  try {
    const {data,error}=await supabase.rpc('get_my_news_feed',{p_cursor:cursor,p_limit:24});
    if(error) throw error;
    if(!data || typeof data.has_preferences!=='boolean' || !Array.isArray(data.articles) || data.articles.length>24 ||
      data.articles.some(a=>!Number.isSafeInteger(Number(a.id))||Number(a.id)<=0) ||
      (data.next_cursor!==null && (typeof data.next_cursor!=='object'||Array.isArray(data.next_cursor)))) throw new Error('Unable to read the recommendations. Please refresh and try again.');
    return {feedType:data.feed_type,hasPreferences:data.has_preferences,articles:data.articles,cursor:data.next_cursor};
  } catch(error) { throw failure(error); }
}
