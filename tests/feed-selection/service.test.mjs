import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../../services/personalizationService.js',import.meta.url),'utf8');
async function fixture(snapshotSize, cursor={session:'11111111-1111-1111-1111-111111111111',position:6}, count=6) {
 globalThis.__feedClient={
  rpc:async()=>({data:{has_preferences:true,feed_type:'personalized',articles:Array.from({length:count},(_,i)=>({id:i+1})),next_cursor:cursor},error:null}),
  from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{article_ids:Array.from({length:snapshotSize},(_,i)=>i+1)},error:null})})})})
 };
 return import('data:text/javascript;base64,'+Buffer.from(source.replace(/import \{ supabase \} from [^;]+;/,'const supabase=globalThis.__feedClient;')+'\n//'+Math.random()).toString('base64'));
}
test('legacy snapshots with 65 articles show a selection total of 12',async()=>{
 const api=await fixture(65);assert.equal((await api.getPersonalizedNews(null,6)).total,12);
});
test('last page retains selection total using incoming cursor',async()=>{
 const api=await fixture(12,null);const result=await api.getPersonalizedNews({session:'11111111-1111-1111-1111-111111111111',position:6},6);assert.equal(result.total,12);assert.equal(result.cursor,null);
});
test('single-page feed uses its actual count and oversized snapshots are rejected',async()=>{
 const api=await fixture(3,null,3);assert.equal((await api.getPersonalizedNews(null,6)).total,3);
 const bad=await fixture(1001);await assert.rejects(()=>bad.getPersonalizedNews(null,6),/page count/);
});
