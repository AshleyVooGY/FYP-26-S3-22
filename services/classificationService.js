import { supabase } from '../config/supabaseClient.js';

// Fetch the complete catalogue of IDs and names without relying on the API row cap.
// An ID cursor remains stable when names change or earlier rows are deleted.
export async function getClassificationList(table) {
  if (!['categories', 'tags'].includes(table)) throw new Error('Invalid classification type.');
  const items = [];
  let lastId = null;
  while (true) {
    let query = supabase.from(table).select('id, name').order('id').limit(200);
    if (lastId !== null) query = query.gt('id', lastId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    if (!Array.isArray(data)) throw new Error('Unable to load classifications. Please retry.');
    if (!data.length) break;
    for (const item of data) {
      const id = Number(item.id);
      if (!Number.isSafeInteger(id) || id <= (lastId ?? 0) || typeof item.name !== 'string') {
        throw new Error('Unable to load classifications. Please retry.');
      }
      items.push(item);
      lastId = id;
    }
    // Continue until empty, even if the server applies a cap below 200.
  }
  return items.sort((a, b) => a.name.localeCompare(b.name) || Number(a.id) - Number(b.id));
}
