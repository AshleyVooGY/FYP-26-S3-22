const headers = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Content-Type':'application/json'};
const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers});
const criteria=['evidenceCoverage','sourceReliability','crossSourceConsistency','recencyContext','internalConsistency'];
const categoryScopes={
 Business:'Companies, commerce, entrepreneurship, markets, business operations and enterprise digitalisation.',
 Technology:'Software, computing, devices, cybersecurity, AI engineering and digital infrastructure. Healthcare software may reasonably fit Technology when system design is the main focus.',
 Sports:'Competitive and recreational sport, sports programmes, training, sports facilities, swimming pools, gyms and access to sporting activities.',
 Entertainment:'Film, television, music, theatre, performances, celebrities and entertainment events.',
 Health:'Physical and mental health, nutrition, public health, healthcare services and the health effects of physical activity.',
 Politics:'Government, Parliament, legislation, public policy, diplomacy and political accountability.',
 Science:'Scientific research and explanations, astronomy, space exploration, physics, biology and planetary science.',
 Lifestyle:'Everyday living, leisure, cultural outings, museum visits, cultural heritage, gardening, travel, food and personal routines. Museum collections and heritage resources for visitors belong here even without a separate Culture category.',
 Environment:'Biodiversity, habitats, conservation, parks and green-space networks, recycling, pollution, climate and renewable energy.'
};
export function categoryPolicyPrompt(categories,selectedId){
 const selected=categories.find(c=>c.id===selectedId);
 if(!selected)throw Error('Unknown selected category');
 return `Review CATEGORY FIT, not a competition to choose the single best category.
First decide whether the SELECTED_CATEGORY is a reasonable primary home under CATEGORY_SCOPES.
Overlapping scopes are intentional. When the selected category reasonably covers the central topic, return selected_category_fit="fits", even if another category could also work. Do not demand a category absent from the allowed list.
Return "mismatch" only when the central topic is clearly outside the selected scope and an allowed alternative fits. For mismatch only, set alternative_category_name to that exact allowed name.
Return "unclear" only when the article does not establish a discernible topic or no allowed scope reasonably covers it. For fits and unclear, alternative_category_name must be null.
Examples: a museum/heritage article in Lifestyle fits; gardening in Lifestyle fits; community sports facilities in Sports fit; healthcare software engineering in Technology fits; diet and movement health benefits in Health fit. A museum article in Sports is a mismatch, normally suggesting Lifestyle.
Base the decision on the main topic, not incidental keywords, tags, the presence of URLs or photo credits. Explain the selected category's fit or the actual mismatch in English.
CATEGORY_SCOPES: ${JSON.stringify(categories.map(c=>({name:c.name,scope:categoryScopes[c.name]||'Use this category name in its ordinary editorial meaning.'})))}
SELECTED_CATEGORY: ${JSON.stringify({name:selected.name,scope:categoryScopes[selected.name]||'Use this category name in its ordinary editorial meaning.'})}`;
}
export function categoryPolicySchema(categories){
 return {type:'OBJECT',properties:{selected_category_fit:{type:'STRING',enum:['fits','mismatch','unclear']},
  alternative_category_name:{type:'STRING',nullable:true,enum:categories.map(c=>c.name)},reason:{type:'STRING'}},
  required:['selected_category_fit','alternative_category_name','reason']};
}
export function normalizeCategoryJudgement(result,categories,selectedId){
 const review=result?.category_review,selected=categories.find(c=>c.id===selectedId);
 if(!selected||!review||typeof review.reason!=='string'||!review.reason.trim()||review.reason.length>1000)throw Error('Invalid category judgement');
 let categoryId;
 if(review.selected_category_fit==='fits'&&review.alternative_category_name===null)categoryId=selected.id;
 else if(review.selected_category_fit==='unclear'&&review.alternative_category_name===null)categoryId=null;
 else if(review.selected_category_fit==='mismatch'){
  const alternative=categories.find(c=>c.name===review.alternative_category_name);
  if(!alternative||alternative.id===selected.id)throw Error('Invalid category alternative');
  categoryId=alternative.id;
 }else throw Error('Inconsistent category judgement');
 // Resolve IDs on the server; the model never maps category names to numeric IDs.
 return {...result,category_review:{category_id:categoryId,reason:review.reason.trim()}};
}
export function validatePublishAssessment(result,categories) {
 if(!result || criteria.some(k=>typeof result[k]!=='number'||!Number.isFinite(result[k])||result[k]<0||result[k]>100)
  || typeof result.explanation!=='string'||!result.explanation.trim()||result.explanation.length>5000
  || !Array.isArray(result.criticalIssues)||result.criticalIssues.length>30||result.criticalIssues.some(x=>typeof x!=='string'||x.length>1000)) throw Error('Invalid assessment');
 const category=result.category_review;
 if(!category || (category.category_id!==null && !categories.some(c=>c.id===category.category_id))
  || typeof category.reason!=='string'||!category.reason.trim()||category.reason.length>1000) throw Error('Invalid category assessment');
 const score=Math.round((result.evidenceCoverage*35+result.sourceReliability*25+result.crossSourceConsistency*20+result.recencyContext*10+result.internalConsistency*10)/100);
 const issues=result.criticalIssues.map(x=>x.trim()).filter(Boolean);
 return {score,issues,criticalIssue:issues.length>0,categoryId:category.category_id,categoryReason:category.reason.trim()};
}
export const REVIEW_POLICY_VERSION='2026-10-30-rubric-v2';
export const credibilityRubric=`Use the following anchored scoring rubric consistently. Assess claims, not writing style or article length. For each criterion select exactly one anchor: 0, 25, 50, 75, 90 or 100. Explain the material evidence gaps; do not invent verification.
EVIDENCE COVERAGE: 100 all material claims supported by identifiable primary references with dates/figures where relevant; 90 all material claims clearly attributed to named, identifiable institutions or reports; 75 most material claims attributed, but one consequential claim lacks support; 50 central claims are plausible but mostly unattributed; 25 central claims are unsupported extraordinary assertions; 0 demonstrably fabricated evidence.
SOURCE RELIABILITY: 100 accurately identified authoritative primary sources; 90 identifiable authoritative institutions explicitly attributed in the text; 75 identifiable secondary reporting; 50 vague or absent attribution; 25 anonymous or demonstrably unreliable attribution; 0 fabricated sources. A bare URL or photo credit does not establish reliability. A named authoritative institution can be attributed in prose without a URL.
CROSS-SOURCE CONSISTENCY: 100 multiple independent identifiable sources support the claims; 90 clear alignment with established knowledge and no identified contradiction; 75 plausible claims with limited independent support; 50 material uncertainty or conflicting accounts; 25 substantial contradictions; 0 directly contradicted established facts. Do not claim you browsed or checked a source live.
RECENCY/CONTEXT: 100 dates, scope and limitations fully match the article; 90 sufficient temporal context for its claims; 75 one relevant date/context is missing; 50 materially ambiguous time context; 25 outdated claims presented as current; 0 impossible chronology. Historical background and evergreen articles do not need a recent publication date: judge whether their own time framing is accurate.
INTERNAL CONSISTENCY: 100 coherent facts, figures and chronology; 90 minor imprecision without contradiction; 75 one unresolved ambiguity; 50 a material inconsistency; 25 multiple material contradictions; 0 fundamentally contradictory.
Missing citations alone are not a critical factual error. Set criticalIssues only for a specific serious factual error you can describe. Do not penalise missing images, category fit, tags, formatting or absence of photo credits in factual scores. Do not assume an unsupported claim is true merely because it is plausible.`;
export const factualFindingsPrompt=`Separate uncertainty from established factual contradiction.
Return evidenceGaps (strings describing absent attribution, dates, supporting documents, corroboration or unverifiable claims) separately from factualErrors.
An anonymous or unsupported claim, even an extraordinary one, is NOT by itself a demonstrated factual error. Missing evidence lowers the rubric scores; do not turn absence of evidence into a correction.
Use factualErrors only for a serious claim that contradicts established knowledge or another explicit fact in the article. For each error, quote the exact original claim and provide the affirmative correct fact in correction, plus a short reason explaining the actual contradiction. Do not use "no source/evidence provided" or "cannot verify" as a factual correction. If you do not know the correct fact, leave factualErrors empty and describe uncertainty in evidenceGaps.
Examples: an unnamed group claiming 500 parks will open next month -> evidenceGaps only, no factualErrors; an unnamed group claiming garden visits increased last year -> evidenceGaps only, no factualErrors; "The Earth is flat" -> factual error, correction: Earth is approximately spherical. "The Sun orbits the Earth" -> factual error, correction: Earth orbits the Sun.
The explanation must summarise the evidence gaps and any actual contradictions. Never assert live source verification.`;
export function factualFindingsSchema(){
 return {evidenceGaps:{type:'ARRAY',items:{type:'STRING'}},factualErrors:{type:'ARRAY',items:{type:'OBJECT',
  properties:{claim:{type:'STRING'},correction:{type:'STRING'},reason:{type:'STRING'}},required:['claim','correction','reason']}}};
}
export function normalizeFactualFindings(result,values){
 const gaps=result?.evidenceGaps,errors=result?.factualErrors;
 if(!Array.isArray(gaps)||gaps.length>10||gaps.some(x=>typeof x!=='string'||!x.trim()||x.length>500)
  ||!Array.isArray(errors)||errors.length>10)throw Error('Invalid factual findings');
 const article=values.title+'\n'+values.content;
 const criticalIssues=errors.map(error=>{
  if(!error||['claim','correction','reason'].some(k=>typeof error[k]!=='string'||!error[k].trim()||error[k].length>300)
   ||!article.includes(error.claim.trim())||error.claim.trim()===error.correction.trim())throw Error('Invalid factual contradiction');
  return `Claim: ${error.claim.trim()} Correct fact: ${error.correction.trim()} ${error.reason.trim()}`;
 });
 // Only structured factual contradictions can set the publishing critical flag.
 // The model cannot override it by also returning a legacy criticalIssues field.
 return {...result,evidenceGaps:gaps.map(x=>x.trim()),criticalIssues};
}
export function createPublishCheckHandler({authenticate,loadClassifications,consumeQuota,generate,issueReview,claimAssessment,completeAssessment,releaseAssessment,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}) {
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
   let raw,assessment,lease=null,cached=false;
   const context={...values,...classifications};
   try {
    if(claimAssessment){
     // Durable single-flight cache: concurrent requests never run competing model checks.
     let claim;
     for(let attempt=0;attempt<24;attempt++){
      claim=await claimAssessment(session,context);
      if(claim?.state!=='pending')break;
      await wait(2000);
     }
     if(claim?.state==='pending')return reply(409,{error:'This article version is already being checked. Wait a moment and retry.'});
     if(claim?.state==='ready'){raw=claim.result;cached=true;}
     else if(claim?.state==='claimed'&&claim.token)lease=claim.token;
     else throw Error('Invalid assessment cache');
    }
    if(!cached){
     if(!await consumeQuota(session)){
      if(lease)await releaseAssessment(session,context,lease);
      return reply(429,{error:'Hourly publishing-check limit reached (20 checks). Your draft is safe; try again later.',code:'RATE_LIMITED'});
     }
     raw=await generate(context);
     assessment=validatePublishAssessment(raw,classifications.categories);
     if(lease)await completeAssessment(session,context,lease,raw);
    }
    assessment=validatePublishAssessment(raw,classifications.categories);
   }catch{
    if(lease)try{await releaseAssessment(session,context,lease);}catch{}
    return reply(502,{error:'The publishing check is temporarily unavailable or incomplete. Your article has not changed. Save a draft and retry.'});
   }
   const review=await issueReview(session,values,assessment);
   if(!review?.receipt_id||!review.category_review?.id) throw Error('Missing trusted review');
   return reply(200,{...review,cached,score:assessment.score,explanation:raw.explanation.trim(),critical_issue:assessment.criticalIssue,
    critical_issue_message:assessment.issues.join(' ')||null,issues:assessment.issues,evidence_gaps:raw.evidenceGaps??[],sources:[],
    canPublish:assessment.score>=80&&!assessment.criticalIssue&&['ai_passed','approved'].includes(review.category_review.status),
    assessment_type:'AI-assisted preliminary assessment',disclaimer:'This assessment uses existing model knowledge, without live external verification.',
    criteria:Object.fromEntries(criteria.map(key=>[key,raw[key]]))});
  }catch{return reply(503,{error:'Publishing checks are temporarily unavailable. Save your draft and try again.'});}
 };
}
