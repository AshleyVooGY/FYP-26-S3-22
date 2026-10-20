// No article writes: the caller reviews and explicitly applies suggestions.
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json', 'Cache-Control': 'no-store'
};
const reply = (status, body) => Response.json(body, { status, headers });
async function readBody(req) {
  const reader = req.body?.getReader();
  if (!reader) throw new Error('INVALID_BODY');
  const chunks = []; let length = 0;
  try {
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 128000) { await reader.cancel(); throw new Error('BODY_TOO_LARGE'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export function normaliseWritingResult(task, result) {
  const text = (value, max) => typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : null;
  const field = task === 'title' ? 'titles' : task === 'tags' ? 'tags' : task === 'summary' ? 'summary' : 'content';
  if (field === 'titles' || field === 'tags') {
    const values = result?.[field]; const count = field === 'titles' ? 3 : 5;
    if (!Array.isArray(values) || values.length !== count || !values.every(v => text(v, field === 'titles' ? 300 : 100))) return null;
    return {[field]: values.map(v => v.trim())};
  }
  const value = text(result?.[field], field === 'summary' ? 4000 : 20000);
  return value ? {[field]: value} : null;
}
export function createWritingHandler({authenticate, consumeQuota, generate}) {
  return async req => {
    if (req.method === 'OPTIONS') return new Response('ok', {headers});
    if (req.method !== 'POST') return reply(405, {error:'Use POST.'});
    const token = req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return reply(401, {error:'Please sign in to use writing assistance.'});
    try {
      const session = await authenticate(token);
      if (!session) return reply(401, {error:'Please sign in again.'});
      let body;
      try { body = await readBody(req); }
      catch (error) { return reply(error.message === 'BODY_TOO_LARGE' ? 413 : 400, {error:'Invalid article input.'}); }
      // Retain existing deployed aliases for older callers.
      const task = body?.task === 'improve' ? 'polish' : body?.task;
      const title = typeof body?.title === 'string' ? body.title.trim() : '';
      const content = typeof body?.content === 'string' ? body.content.trim() : '';
      if (!['title','summary','tags','polish','paragraph'].includes(task) || title.length > 300 || !content || content.length > 20000) {
        return reply(400, {error:'Choose a writing task and provide up to 20,000 characters of article content.'});
      }
      const quota = await consumeQuota(session);
      if (!quota || !Number.isInteger(quota.remaining) || quota.remaining < 0 || !Number.isInteger(quota.limit)) {
        return reply(429, {error:'Hourly writing limit reached. Try again later.',code:'RATE_LIMITED'});
      }
      let raw;
      try { raw = await generate({task,title,content}); }
      catch { return reply(502, {error:'Writing assistance is temporarily unavailable. Your article has not changed.'}); }
      const result = normaliseWritingResult(task, raw);
      if (!result) return reply(502, {error:'The AI returned an incomplete suggestion. Please try again.'});
      return reply(200, {...result, remaining: quota.remaining, limit: quota.limit});
    } catch {
      return reply(503, {error:'Writing assistance is temporarily unavailable. Please try again later.'});
    }
  };
}
