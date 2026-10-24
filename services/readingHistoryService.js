import { supabase } from '../config/supabaseClient.js';

// RLS and the RPC both derive the viewer from auth.uid(), never a UI-supplied ID.
export async function getReadingHistory() {
  try {
    const history = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase.rpc('get_reading_history').range(offset, offset + 499);
      if (error) throw error;
      history.push(...(data || []));
      if ((data || []).length < 500) break;
    }
    if (!history.length) return [];
    const ids = [...new Set(history.map(item => item.article_id))];
    const articles = new Map();
    for (let offset = 0; offset < ids.length; offset += 100) {
      const { data, error } = await supabase.from('articles')
        .select('id,title,content,featured_image_url,view_count,reaction_count,category:categories!articles_category_id_fkey(name)')
        .in('id', ids.slice(offset, offset + 100)).eq('status', 'published');
      if (error) throw error;
      (data || []).forEach(article => articles.set(String(article.id), article));
    }
    return history.filter(item => articles.has(String(item.article_id))).map(item => ({
      ...item, article: articles.get(String(item.article_id))
    }));
  } catch (error) {
    throw new Error(error.message || 'Unable to load reading history. Please try again.');
  }
}
