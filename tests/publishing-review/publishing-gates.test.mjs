import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const load=async path=>import('data:text/javascript;base64,'+Buffer.from(await readFile(new URL(path,import.meta.url),'utf8')).toString('base64'));
const {createPublishCheckHandler}=await load('../../supabase/functions/check-article-credibility/handler.js');
const {publishingFingerprint,isPublishReviewReady}=await load('../../frontend/js/publish-review-state.js');
const categories=[{id:1,name:'Technology'},{id:2,name:'Health'}];
const body={title:'Hospital care programme',content:'A hospital introduced a care programme.',category_id:1,category_ids:[1],tag_ids:[10]};
const assessment={evidenceCoverage:95,sourceReliability:95,crossSourceConsistency:95,recencyContext:95,internalConsistency:95,explanation:'Supported by the supplied information.',criticalIssues:[],category_review:{category_id:2,reason:'Patient care is the main topic.'}};
function fixture(overrides={}){
 const calls=[];
 const handler=createPublishCheckHandler({authenticate:async()=>({id:'server-verified-user'}),loadClassifications:async()=>({categories,tags:[{id:10,name:'AI'}]}),consumeQuota:async()=>true,
 generate:async()=>assessment,issueReview:async(session,values,result)=>{calls.push({session,values,result});return {receipt_id:'trusted',expires_at:new Date(Date.now()+60000).toISOString(),category_review:{id:'review',status:result.categoryId===values.categoryId?'ai_passed':'needs_review'}}},...overrides});
 return {handler,calls};
}
const request=(value=body,token=true)=>new Request('https://example.test/check',{method:'POST',headers:token?{Authorization:'Bearer checked-token'}:{},body:JSON.stringify(value)});
test('combined publishing check rejects guests and invalid sessions before model or receipt issuance',async()=>{
 for(const f of [fixture(),fixture({authenticate:async()=>null})]){assert.equal((await f.handler(request(body,f===null))).status,401);assert.deepEqual(f.calls,[]);}
 const f=fixture({authenticate:async()=>null});assert.equal((await f.handler(request())).status,401);
});
test('one category and known classification IDs are required before quota/model access',async()=>{
 let quota=0;const f=fixture({consumeQuota:async()=>{quota++;return true}});
 for(const value of [null,[],{...body,category_ids:[]},{...body,category_ids:[1,2]},{...body,category_id:2},{...body,tag_ids:[999]},{...body,category_ids:[999],category_id:999}])assert.equal((await f.handler(request(value))).status,400);
 assert.equal(quota,0);assert.deepEqual(f.calls,[]);
});
test('credible article with a wrong category is checked but cannot publish',async()=>{
 const f=fixture(),response=await f.handler(request()),result=await response.json();assert.equal(response.status,200);assert.equal(result.score,95);assert.equal(result.canPublish,false);assert.equal(result.category_review.status,'needs_review');
 assert.equal(f.calls[0].session.id,'server-verified-user');assert.equal(f.calls[0].result.categoryId,2);
});
test('matching category can publish only with passing credibility and a trusted review',async()=>{
 const f=fixture({generate:async()=>({...assessment,category_review:{category_id:1,reason:'The topic fits.'}})});const result=await (await f.handler(request({...body,user_id:'forged-user',category_review:{status:'approved'}}))).json();
 assert.equal(result.canPublish,true);assert.equal(f.calls[0].session.id,'server-verified-user');
});
test('critical factual issues keep publishing locked despite a matching category',async()=>{
 const f=fixture({generate:async()=>({...assessment,criticalIssues:['A specific serious factual error.'],category_review:{category_id:1,reason:'Fits.'}})});
 assert.equal((await (await f.handler(request())).json()).canPublish,false);
});
test('unclear category requires manual resolution rather than auto passing',async()=>{
 const f=fixture({generate:async()=>({...assessment,category_review:{category_id:null,reason:'There is insufficient topic information.'}})});
 const result=await (await f.handler(request())).json();assert.equal(result.canPublish,false);assert.equal(f.calls[0].result.categoryId,null);
});
test('missing, invented and invalid model category results never issue receipts',async()=>{
 for(const category_review of [undefined,{category_id:999,reason:'Invented category'},{category_id:1,reason:''},{category_id:[1,2],reason:'Two categories'}]){
  const f=fixture({generate:async()=>({...assessment,category_review})});assert.equal((await f.handler(request())).status,502);assert.equal(f.calls.length,0);
 }
});
test('model failure, invalid scores and quota refusal preserve fail-closed publishing',async()=>{
 const cases=[{generate:async()=>{throw Error('provider')}},{generate:async()=>({...assessment,evidenceCoverage:101})}];
 for(const overrides of cases){const f=fixture(overrides);assert.equal((await f.handler(request())).status,502);assert.equal(f.calls.length,0);}
 const f=fixture({consumeQuota:async()=>false,generate:async()=>{throw Error('must not call model')}});assert.equal((await f.handler(request())).status,429);assert.equal(f.calls.length,0);
});
test('receipt failure does not manufacture a successful check',async()=>{
 const f=fixture({issueReview:async()=>{throw Error('db secret')}});const response=await f.handler(request());assert.equal(response.status,503);assert.ok(!(await response.text()).includes('db secret'));
});
test('published UI requires both checks, current content and unexpired receipt/approval',()=>{
 const now=Date.now(),expires=new Date(now+60000).toISOString();
 const result={receiptId:'r',score:90,criticalIssue:false,expiresAt:expires},review={status:'ai_passed',expires_at:expires};
 assert.equal(isPublishReviewReady(result,review,'same','same','same',now),true);
 for(const status of ['needs_review','pending','rejected','superseded'])assert.equal(isPublishReviewReady(result,{...review,status},'same','same','same',now),false);
 assert.equal(isPublishReviewReady(result,{...review,status:'approved'},'same','same','same',now),true);
 assert.equal(isPublishReviewReady({...result,score:79},{...review,status:'approved'},'same','same','same',now),false);
 assert.equal(isPublishReviewReady(result,review,'old','new','old',now),false);
 assert.equal(isPublishReviewReady(result,review,'same','same','old',now),false);
 assert.equal(isPublishReviewReady(result,review,'same','same','same',now+60001),false);
});
test('snapshot changes invalidate checks for title, body, category and tags, while tag order does not',()=>{
 const original={title:'Title',content:'Body',categoryIds:['1'],tagIds:['10','20']},fingerprint=publishingFingerprint(original);
 assert.equal(publishingFingerprint({...original,tagIds:['20','10']}),fingerprint);
 for(const change of [{title:'New'},{content:'New body'},{categoryIds:['2']},{tagIds:['10']}])assert.notEqual(publishingFingerprint({...original,...change}),fingerprint);
});
