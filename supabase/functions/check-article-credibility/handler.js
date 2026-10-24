const headers = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Content-Type':'application/json'};
const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers});
const criteria=['evidenceCoverage','sourceReliability','crossSourceConsistency','recencyContext','internalConsistency'];
export function validatePublishAssessment(result,categories) {
 if(!result || criteria.some(k=>typeof result[k]!=='number'||!Number.isFinite(result[k])||result[k]<0||result[k]>100)
  || typeof result.explanation!=='string'||!result.explanation.trim()||result.explanation.length>5000
  || !Array.isArray(result.criticalIssues)||result.criticalIssues.length>30||result.criticalIssues.some(x=>typeof x!=='string'||x.length>1000)) throw Error('Invalid assessment');
 const category=result.category_review;
 if(!category || (category.category_id!==null && !categories.some(c=>c.id===category.category_id))
  || typeof category.reason!=='string'||!category.reason.trim()||category.reason.length>1000) throw Error('Invalid category assessment');
 const score=Math.round(result.evidenceCoverage*.35+result.sourceReliability*.25+result.crossSourceConsistency*.2+result.recencyContext*.1+result.internalConsistency*.1);
 const issues=result.criticalIssues.map(x=>x.trim()).filter(Boolean);
 return {score,issues,criticalIssue:issues.length>0,categoryId:category.category_id,categoryReason:category.reason.trim()};
}
export function createPublishCheckHandler({authenticate,loadClassifications,consumeQuota,generate,issueReview}) {
 return async req=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers});
  if(req.method!=='POST') return reply(405,{error:'Use POST.'});
  const token=req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if(!token)return reply(401,{error:'Please sign in to check your article.'});
  try {
   const session=await authenticate(token);
   if(!session)return reply(401,{error:'Please sign in again.'});
   if(Number(req.headers.get('content-length'))>128000)return reply(413,{error:'Article input is too large.'});
   let body;
   try {const text=await req.text();if(new TextEncoder().encode(text).length>128000)return reply(413,{error:'Article input is too large.'});body=JSON.parse(text);}catch{return reply(400,{error:'Invalid article input.'});}
   if(!body||typeof body!=='object'||Array.isArray(body))return reply(400,{error:'Invalid article input.'});
   const title=typeof body.title==='string'?body.title.trim():'';
   const content=typeof body.content==='string'?body.content.trim():'';
   const categoryId=body.category_id;
   const ids=value=>Array.isArray(value)&&value.length<=100&&value.every(id=>Number.isSafeInteger(id)&&id>0);
   const categoryIds=body.category_ids??[categoryId],tagIds=body.tag_ids??[];
   if(!title||title.length>300||!content||content.length>20000||!ids(categoryIds)||categoryIds.length!==1||categoryIds[0]!==categoryId||!ids(tagIds))
    return reply(400,{error:'Add a title, article content and exactly one category before checking.'});
   const values={title,content,categoryId,categoryIds,tagIds:[...new Set(tagIds)]};
   const classifications=await loadClassifications(session,values);
   if(!classifications.categories.some(c=>c.id===categoryId)||values.tagIds.some(id=>!classifications.tags.some(t=>t.id===id)))
    return reply(400,{error:'A selected category or tag is no longer available.'});
   if(!await consumeQuota(session)) return reply(429,{error:'Hourly publishing-check limit reached (20 checks). Your draft is safe; try again later.',code:'RATE_LIMITED'});
   let raw,assessment;
   try {raw=await generate({...values,...classifications});assessment=validatePublishAssessment(raw,classifications.categories);}
   catch{return reply(502,{error:'The publishing check is temporarily unavailable or incomplete. Your article has not changed. Save a draft and retry.'});}
   const review=await issueReview(session,values,assessment);
   if(!review?.receipt_id||!review.category_review?.id) throw Error('Missing trusted review');
   return reply(200,{...review,score:assessment.score,explanation:raw.explanation.trim(),critical_issue:assessment.criticalIssue,
    critical_issue_message:assessment.issues.join(' ')||null,issues:assessment.issues,sources:[],
    canPublish:assessment.score>=80&&!assessment.criticalIssue&&['ai_passed','approved'].includes(review.category_review.status),
    assessment_type:'AI-assisted preliminary assessment',disclaimer:'This assessment uses existing model knowledge, without live external verification.',
    criteria:Object.fromEntries(criteria.map(key=>[key,raw[key]]))});
  }catch{return reply(503,{error:'Publishing checks are temporarily unavailable. Save your draft and try again.'});}
 };
}
