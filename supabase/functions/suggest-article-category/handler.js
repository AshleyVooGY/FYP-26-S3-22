// Dependencies are provided by index.ts; classification never writes an article.
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store'
};
const reply = (status, body) => Response.json(body, { status, headers });

async function readBody(req) {
  const reader = req.body?.getReader();
  if (!reader) throw new Error('INVALID_BODY');
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 128000) { await reader.cancel(); throw new Error('BODY_TOO_LARGE'); }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const buffer = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(buffer));
}

export function createCategorySuggestionHandler({ authenticate, loadCategories, consumeQuota, generate }) {
  return async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers });
    if (req.method !== 'POST') return reply(405, { error: 'Use POST.' });
    const token = req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return reply(401, { error: 'Please sign in to check a category.' });
    try {
      const session = await authenticate(token);
      if (!session) return reply(401, { error: 'Please sign in again.' });
      let body;
      try { body = await readBody(req); }
      catch (error) { return reply(error.message === 'BODY_TOO_LARGE' ? 413 : 400, { error: 'Invalid article input.' }); }
      const title = typeof body?.title === 'string' ? body.title.trim() : '';
      const content = typeof body?.content === 'string' ? body.content.trim() : '';
      const currentCategoryId = body?.category_id ?? null;
      if (!title || !content || title.length > 300 || content.length > 20000
        || (currentCategoryId !== null && (!Number.isSafeInteger(currentCategoryId) || currentCategoryId <= 0))) {
        return reply(400, { error: 'Provide a title, article content and a valid category.' });
      }
      const categories = await loadCategories(session);
      if (!categories.length) return reply(409, { error: 'No categories are available yet.' });
      if (currentCategoryId !== null && !categories.some(item => item.id === currentCategoryId)) {
        return reply(400, { error: 'The selected category is no longer available.' });
      }
      if (!await consumeQuota(session)) {
        return reply(429, { error: 'Hourly category check limit reached. Try again later.', code: 'RATE_LIMITED' });
      }
      let result;
      try { result = await generate({ title, content, currentCategoryId, categories }); }
      catch { return reply(502, { error: 'The AI category check is unavailable. Try again later.' }); }
      const category = categories.find(item => item.id === result?.category_id);
      if (!result || (result.category_id !== null && !category)
        || typeof result.reason !== 'string' || !result.reason.trim() || result.reason.length > 1000) {
        return reply(502, { error: 'The AI returned an invalid category suggestion.' });
      }
      return reply(200, {
        category_id: category?.id ?? null,
        category_name: category?.name ?? null,
        matches_current: Boolean(category && category.id === currentCategoryId),
        reason: result.reason.trim()
      });
    } catch {
      return reply(503, { error: 'Category suggestions are temporarily unavailable.' });
    }
  };
}
