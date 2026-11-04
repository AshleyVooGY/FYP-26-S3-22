import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../services/accountSettingsService.js', import.meta.url), 'utf8');
async function fixture(res = { data: 'New name' }) {
  const calls = [];
  globalThis.__settingsClient = { rpc: async (name, args) => { calls.push({ name, args }); return res; } };
  const prepared = source.replace(/import \{ supabase \} from [^;]+;/, 'const supabase = globalThis.__settingsClient;');
  const api = await import('data:text/javascript;base64,' + Buffer.from(prepared + '\n//' + Math.random()).toString('base64'));
  return { api, calls };
}
test('display name changes send a validated name only, not user ID or roles',async()=>{const f=await fixture();await f.api.updateMyDisplayName('  New name  ');assert.deepEqual(f.calls,[{name:'update_my_display_name',args:{p_display_name:'New name'}}]);});
test('invalid names are rejected before requests',async()=>{const f=await fixture();for(const name of ['', ' ', 'a'.repeat(61),'name\ninside','name\u007finside'])await assert.rejects(()=>f.api.updateMyDisplayName(name));assert.equal(f.calls.length,0);});
test('missing name backend and failed writes do not claim success',async()=>{const f=await fixture({error:{code:'PGRST202'}});await assert.rejects(()=>f.api.updateMyDisplayName('Name'),/being set up/);const g=await fixture({data:null});await assert.rejects(()=>g.api.updateMyDisplayName('Name'),/confirm/);});
test('duplicate names show a clear message instead of a database error', async () => {
  const f = await fixture({error:{code:'23505',message:'duplicate key violates profiles_display_name_normalised_key'}});
  await assert.rejects(() => f.api.updateMyDisplayName(' FISHER '), /already taken/);
});
test('availability only accepts an explicit boolean and trims the submitted name', async () => {
  const f = await fixture({data:false});
  assert.equal(await f.api.isDisplayNameAvailable(' Fisher '),false);
  assert.deepEqual(f.calls,[{name:'is_display_name_available',args:{p_display_name:'Fisher'}}]);
  const g = await fixture({data:null});
  await assert.rejects(() => g.api.isDisplayNameAvailable('Name'), /Unable to check/);
});
