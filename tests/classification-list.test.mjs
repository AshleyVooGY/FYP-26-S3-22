import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../services/classificationService.js', import.meta.url), 'utf8');
let fixtureId = 0;
async function fixture(rows, { cap = 200, failOn = 0, malformed = false } = {}) {
  let calls = 0;
  const key = `classificationFixture${++fixtureId}`;
  globalThis[key] = { from(table) {
    assert.ok(['tags', 'categories'].includes(table));
    const query = {
      cursor: 0, size: 0,
      select(columns) { assert.equal(columns, 'id, name'); return this; },
      order(column) { assert.equal(column, 'id'); return this; },
      limit(size) { this.size = size; return this; },
      gt(column, value) { assert.equal(column, 'id'); this.cursor = value; return this; },
      then(resolve, reject) {
        calls++;
        const data = rows.filter(row => Number(row.id) > this.cursor).sort((a, b) => Number(a.id) - Number(b.id)).slice(0, Math.min(cap, this.size));
        const response = calls === failOn ? { error: { message: 'Database unavailable' } }
          : { data: malformed && calls === 2 ? [rows[0]] : data, error: null };
        return Promise.resolve(response).then(resolve, reject);
      }
    };
    return query;
  } };
  try {
    const code = source.replace(/^import .*?;\n/, `const supabase = globalThis[${JSON.stringify(key)}];\n`);
    const module = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
    return { load: module.getClassificationList, calls: () => calls };
  } finally { delete globalThis[key]; }
}
test('loads more than 1000 tags with gapped IDs, without omission or duplication', async () => {
  const rows = Array.from({ length: 1205 }, (_, i) => ({ id: (i + 1) * 3, name: `Topic ${String(1205 - i).padStart(4, '0')}` }));
  const f = await fixture(rows);
  const result = await f.load('tags');
  assert.equal(result.length, 1205);
  assert.equal(new Set(result.map(row => row.id)).size, 1205);
  assert.deepEqual(result, [...rows].sort((a, b) => a.name.localeCompare(b.name)));
  assert.equal(f.calls(), 8);
});
test('continues when the configured server cap is smaller than the requested batch', async () => {
  const rows = Array.from({ length: 75 }, (_, i) => ({ id: i + 1, name: `Tag ${i}` }));
  const f = await fixture(rows, { cap: 17 });
  assert.equal((await f.load('tags')).length, 75);
  assert.equal(f.calls(), 6);
});
test('an empty catalogue completes in one request', async () => {
  const f = await fixture([]);
  assert.deepEqual(await f.load('categories'), []);
  assert.equal(f.calls(), 1);
});
test('a later page failure is reported instead of returning an incomplete catalogue', async () => {
  const f = await fixture([{ id: 1, name: 'A' }, { id: 2, name: 'B' }], { cap: 1, failOn: 2 });
  await assert.rejects(f.load('tags'), /Database unavailable/);
});
test('a stalled or repeated ID fails rather than looping indefinitely', async () => {
  const f = await fixture([{ id: 1, name: 'A' }, { id: 2, name: 'B' }], { cap: 1, malformed: true });
  await assert.rejects(f.load('tags'), /Unable to load classifications/);
  assert.equal(f.calls(), 2);
});
test('only classification tables may be requested', async () => {
  const f = await fixture([]);
  await assert.rejects(f.load('profiles'), /Invalid classification type/);
  assert.equal(f.calls(), 0);
});
