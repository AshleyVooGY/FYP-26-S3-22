import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
async function service(path, client) {
  const source = (await readFile(new URL(path, import.meta.url), 'utf8')).replace(/import \{ supabase \} from [^;]+;/, 'const supabase = globalThis.__testClient;');
  globalThis.__testClient = client;
  return import('data:text/javascript;base64,' + Buffer.from(source + `\n// ${Math.random()}`).toString('base64'));
}
test('workspace submits primary category first and all links in one RPC', async () => {
  const calls=[];
  const api=await service('../services/feature8Service.js', {rpc:async (...args)=>{calls.push(args);return {data:59};}});
  assert.equal(await api.saveArticleWorkspace(59,{title:' News ',content:' Body ',categoryIds:['9','2','9'],tagIds:['5','5']},true,'receipt'),59);
  assert.deepEqual(calls,[['save_my_article_workspace',{p_article_id:59,p_title:'News',p_content:'Body',p_category_ids:[9,2],p_tag_ids:[5],p_publish:true,p_receipt_id:'receipt'}]]);
});
test('draft does not submit a publishing receipt',async()=>{
 const api=await service('../services/feature8Service.js',{rpc:async(name,args)=>{assert.equal(args.p_receipt_id,null);assert.equal(args.p_publish,false);return {data:1};}});
 await api.saveArticleWorkspace(null,{title:'Title',content:'Body'},false,'old-receipt');
});
test('validation rejects empty articles before any network request',async()=>{
 const api=await service('../services/feature8Service.js',{rpc:()=>{throw Error('Unexpected network call');}});
 await assert.rejects(()=>api.saveArticleWorkspace(null,{title:' ',content:'body'}),/Title is required/);
});
test('missing migration produces a recoverable message rather than insecure fallback',async()=>{
 const api=await service('../services/feature8Service.js',{rpc:async()=>({error:{code:'PGRST202'}})});
 await assert.rejects(()=>api.saveArticleWorkspace(null,{title:'Title',content:'body'}),/backend deploys/);
});
test('server review rejection is passed back without a success result',async()=>{
 const api=await service('../services/feature8Service.js',{rpc:async()=>({error:{message:'The review is expired'}})});
 await assert.rejects(()=>api.saveArticleWorkspace(1,{title:'Title',content:'body'},true,'old'),/expired/);
});
test('role changes use the guarded admin RPC instead of updating profiles directly',async()=>{
 const api=await service('../services/userManagementService.js',{rpc:async(name,args)=>{assert.equal(name,'set_user_role');assert.deepEqual(args,{p_user_id:'user',p_role:'registered_user'});return {};}});
 await api.setUserRole('user','registered_user');
});
test('credibility request includes primary category, categories and tags and returns receipt',async()=>{
 const api=await service('../services/aiPublishingService.js',{functions:{invoke:async(name,{body})=>{
  assert.equal(name,'check-article-credibility');assert.deepEqual(body.category_ids,[9,2]);assert.deepEqual(body.tag_ids,[5]);assert.equal(body.category_id,9);
  return {data:{score:90,critical_issue:false,receipt_id:'receipt'}};
 }}});
 assert.equal((await api.checkArticleCredibility({title:'Title',content:'Body',categoryId:9,categoryIds:['9','2'],tagIds:['5']})).receiptId,'receipt');
});
