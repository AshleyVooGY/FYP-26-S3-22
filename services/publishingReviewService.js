import { supabase } from '../config/supabaseClient.js';
function failure(error) {
 if(['PGRST202','42P01','42883'].includes(error?.code)) return new Error('Publishing checks are being updated. Keep your draft and try again later.');
 return new Error(error?.message || 'Unable to load or save the category review. Please retry.');
}
export async function getCategoryReview(id) {
 try {
  const {data,error}=await supabase.from('article_category_reviews').select('id,status,ai_reason,suggested_category_id,review_note,expires_at').eq('id',id).maybeSingle();
  if(error)throw error;if(!data)throw new Error('This category review is unavailable. Run the publishing check again.');return data;
 }catch(error){throw failure(error);}
}
export async function requestCategoryReview(id,reason,articleId) {
 if(typeof reason!=='string'||reason.trim().length<20||reason.trim().length>2000)throw new Error('Explain your choice in 20 to 2000 characters.');
 try {const {error}=await supabase.rpc('request_article_category_review',{p_review_id:id,p_reason:reason.trim(),p_article_id:Number(articleId)});if(error)throw error;return await getCategoryReview(id);}catch(error){throw failure(error);}
}
export async function getCategoryReviewQueue(cursor=null) {
 try {const {data,error}=await supabase.rpc('get_article_category_review_queue',{p_after:cursor});if(error)throw error;
  if(!Array.isArray(data?.reviews)||data.reviews.length>24)throw new Error('Unable to read the review queue.');return data;
 }catch(error){throw failure(error);}
}
export async function decideCategoryReview(id,approve,note) {
 if(typeof approve!=='boolean'||!note?.trim()||note.trim().length>2000)throw new Error('Add a review note (up to 2000 characters).');
 try {const {error}=await supabase.rpc('decide_article_category_review',{p_review_id:id,p_approve:approve,p_note:note.trim()});if(error)throw error;}catch(error){throw failure(error);}
}

export async function getArticleCategoryReview(articleId) {
 try {const {data,error}=await supabase.from('article_category_reviews').select('id,status,ai_reason,suggested_category_id,review_note,expires_at,snapshot')
 .eq('article_id',Number(articleId)).in('status',['pending','approved','rejected']).order('created_at',{ascending:false}).limit(1).maybeSingle();if(error)throw error;return data;
 }catch(error){throw failure(error);}
}
