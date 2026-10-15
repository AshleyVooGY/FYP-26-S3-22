import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
async function service(client) {
 const source=(await readFile(new URL('../services/readingHistoryService.js',import.meta.url),'utf8')).replace(/import \{ supabase \} from [^;]+;/,'const supabase=globalThis.__historyClient;');
 globalThis.__historyClient=client;
 return import('data:text/javascript;base64,'+Buffer.from(source+`\n// ${Math.random()}`).toString('base64'));
}
test('empty history does not query article details',async()=>{
 const api=await service({rpc:()=>({range:async()=>({data:[]})}),from:()=>assert.fail('Unexpected article request')});
 assert.deepEqual(await api.getReadingHistory(),[]);
});
test('a history read error is reported instead of shown as empty',async()=>{
 const api=await service({rpc:()=>({range:async()=>({error:{message:'History access denied'}})})});
 await assert.rejects(()=>api.getReadingHistory(),/History access denied/);
});
test('history metadata preserves latest order and omits articles no longer published',async()=>{
 const api=await service({rpc:()=>({range:async()=>({data:[{article_id:2,viewed_at:'new'},{article_id:1,viewed_at:'old'}]})}),from:table=>{
 assert.equal(table,'articles');return {select:()=>({in:(key,ids)=>{assert.equal(key,'id');assert.deepEqual(ids,[2,1]);return {eq:async(key,value)=>{assert.equal(key,'status');assert.equal(value,'published');return {data:[{id:2,title:'Visible'}]};}};}})};
 }});
 assert.deepEqual(await api.getReadingHistory(),[{article_id:2,viewed_at:'new',article:{id:2,title:'Visible'}}]);
});
test('metadata failure is retryable and not silently discarded',async()=>{
 const api=await service({rpc:()=>({range:async()=>({data:[{article_id:1}]})}),from:()=>({select:()=>({in:()=>({eq:async()=>({error:{message:'Connection failed'}})})})})});
 await assert.rejects(()=>api.getReadingHistory(),/Connection failed/);
});
test('RPC pages and metadata batches avoid the per-article request pattern',async()=>{
 let pages=0,batches=0;
 const rows=Array.from({length:501},(_,i)=>({article_id:i+1}));
 const api=await service({rpc:()=>({range:async(start,end)=>{pages++;assert.equal(end,start+499);return {data:rows.slice(start,end+1)};}}),from:()=>({select:()=>({in:(key,ids)=>({eq:async()=>{batches++;assert.ok(ids.length<=100);return {data:ids.map(id=>({id}))};}})})})});
 assert.equal((await api.getReadingHistory()).length,501);
 assert.equal(pages,2); assert.equal(batches,6);
});
