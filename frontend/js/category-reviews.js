import { requireAdmin } from './auth.js?v=account-settings-20261027';
import { getCategoryReviewQueue,decideCategoryReview } from '../../services/publishingReviewService.js?v=required-category-20261022';
import { getCategories } from '../../services/feature8Service.js?v=apply-tags-20261024';
import { escapeHtml,forbiddenStateHtml } from './format.js';
const list=document.getElementById('category-review-list'),status=document.getElementById('review-status'),more=document.getElementById('review-more'),refresh=document.getElementById('review-refresh');
let viewer=null,cursor=null,loading=false,categories=[];
const name=id=>categories.find(item=>Number(item.id)===Number(id))?.name||'No clear category';
function card(item){const chosen=item.snapshot.primary_category_id,self=item.user_id===viewer.id;
 return `<article class="category-review-card" data-review-id="${escapeHtml(item.id)}"><h2>${escapeHtml(item.snapshot.title)}</h2><p>Author: ${escapeHtml(item.author_name)} · ${escapeHtml(new Date(item.created_at).toLocaleString())}</p>
 <p><strong>Selected category:</strong> ${escapeHtml(name(chosen))}<br><strong>AI suggestion:</strong> ${escapeHtml(name(item.suggested_category_id))}</p>
 <p><strong>AI explanation:</strong> ${escapeHtml(item.ai_reason)}</p><p><strong>Author’s reason:</strong> ${escapeHtml(item.author_reason)}</p>
 <details><summary>Read the submitted article version</summary><p class="review-article-body">${escapeHtml(item.snapshot.content)}</p></details>
 ${self?'<p>Another administrator must review your own request.</p>':`<label for="note-${escapeHtml(item.id)}">Review note (required)</label><textarea id="note-${escapeHtml(item.id)}" maxlength="2000"></textarea><div class="review-actions"><button class="article-action is-live" data-decision="approve" type="button">Approve selected category</button><button class="article-action is-live" data-decision="reject" type="button">Request a category change</button></div>`}
 <p class="review-item-status" role="status"></p></article>`;}
async function load(reset=false){if(loading)return;loading=true;more.disabled=true;refresh.disabled=true;if(reset){cursor=null;list.innerHTML='';more.hidden=true;}status.textContent='Loading category reviews…';
 try{const result=await getCategoryReviewQueue(cursor);list.insertAdjacentHTML('beforeend',result.reviews.map(card).join(''));cursor=result.next_cursor;more.hidden=!cursor;
 status.textContent=list.children.length?`${list.children.length} pending reviews loaded`:'No pending category reviews.';
 }catch(error){status.textContent=error.message;}finally{loading=false;more.disabled=false;refresh.disabled=false;}}
list.addEventListener('click',async event=>{const button=event.target.closest('[data-decision]');if(!button)return;const row=button.closest('[data-review-id]'),note=row.querySelector('textarea').value,local=row.querySelector('.review-item-status');
 const buttons=[...row.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);local.textContent='Saving decision…';
 try{await decideCategoryReview(row.dataset.reviewId,button.dataset.decision==='approve',note);local.textContent=button.dataset.decision==='approve'?'Category approved. The author can refresh their check status and publish once credibility passes.':'Category change requested. The author can read your note in the editor.';status.textContent='Decision saved. Refresh to see the remaining pending requests.';row.querySelector('.review-actions').remove();row.querySelector('textarea').disabled=true;}
 catch(error){local.textContent=error.message;buttons.forEach(b=>b.disabled=false);}});
refresh.addEventListener('click',()=>load(true));more.addEventListener('click',()=>load());
async function init(){viewer=await requireAdmin();if(!viewer){list.innerHTML=forbiddenStateHtml();refresh.hidden=true;return;}
 try{categories=await getCategories();await load(true);}catch(error){status.textContent=error.message;}}
init();
