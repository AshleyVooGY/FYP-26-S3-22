import { supabase } from '../config/supabaseClient.js';

function identifier(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid article or comment.');
  return id;
}
function failure(error) {
  if (['PGRST202', '42P01', '42883'].includes(error?.code)) {
    return new Error('Comments are being set up. Please try again later.');
  }
  return new Error(error?.message || 'Comments are unavailable. Please try again.');
}
export async function getArticleComments(articleId, cursor = null) {
  try {
    const { data, error } = await supabase.rpc('get_article_comments', {
      p_article_id: identifier(articleId), p_before_id: cursor === null ? null : identifier(cursor)
    });
    if (error) throw error;
    if (!Array.isArray(data?.comments) || data.comments.length > 20) throw new Error('Unable to load comments.');
    return data;
  } catch (error) { throw failure(error); }
}
export async function createArticleComment(articleId, body, requestId) {
  try {
    const content = String(body ?? '').trim();
    if (!content || content.length > 1000) throw new Error('Write a comment of 1 to 1000 characters.');
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(requestId ?? '')) throw new Error('Please retry your comment.');
    const { data, error } = await supabase.rpc('create_article_comment', {
      p_article_id: identifier(articleId), p_body: content, p_request_id: requestId
    });
    if (error) throw error;
    if (!data?.id) throw new Error('The server did not confirm your comment. You can retry safely.');
    return data;
  } catch (error) { throw failure(error); }
}
export async function deleteArticleComment(commentId) {
  try {
    const { error } = await supabase.rpc('delete_article_comment', { p_comment_id: identifier(commentId) });
    if (error) throw error;
  } catch (error) { throw failure(error); }
}
