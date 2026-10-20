import { requireAuth } from './auth.js';
import { getPersonalizedNews } from '../../services/personalizationService.js?v=for-you-20261020';
import { escapeHtml, thumbHtml, formatRelativeTime, formatCount } from './format.js';
const grid=document.getElementById('feed-grid'),status=document.getElementById('feed-status'),state=document.getElementById('feed-state');
const more=document.getElementById('feed-more'),refresh=document.getElementById('feed-refresh');
let cursor=null,loading=false,seen=new Set();
function card(article) {
 return `<a class="article-card news-card-link" href="article.html?id=${Number(article.id)}"><div class="article-card__image">${thumbHtml(article)}</div><div class="article-card__body"><span class="badge">${escapeHtml(article.category_name || 'Uncategorised')}</span><h2>${escapeHtml(article.title || 'Untitled article')}</h2><p>${escapeHtml(article.content || '')}</p><div class="article-meta"><span>${escapeHtml(formatRelativeTime(article.published_at))}</span><span>◉ ${formatCount(article.view_count)} views</span><span>♡ ${formatCount(article.reaction_count)}</span></div></div></a>`;
}
async function load(reset=false) {
 if(loading) return;
 loading=true;more.disabled=true;refresh.disabled=true;
 if(reset){cursor=null;seen=new Set();grid.innerHTML='';state.innerHTML='';more.hidden=true;refresh.hidden=true;}
 status.textContent=reset?'Loading your news…':'Loading more news…';status.classList.remove('is-error');
 try {
  const result=await getPersonalizedNews(cursor);
  state.innerHTML='';
  if(!result.hasPreferences) state.innerHTML='<p class="feed-intro">Discover news to get started, or <a href="preferences.html">choose your interests</a> to shape your feed.</p>';
  for(const article of result.articles) if(!seen.has(String(article.id))){seen.add(String(article.id));grid.insertAdjacentHTML('beforeend',card(article));}
  cursor=result.cursor;more.hidden=!cursor;refresh.hidden=false;
  status.textContent=`Showing ${seen.size} article${seen.size===1?'':'s'}`;
  if(!seen.size)state.innerHTML='<div class="empty-state"><h2>You’re all caught up</h2><p>Check back for new stories, update your interests, or browse all news.</p><a class="button" href="categories.html">Browse news</a></div>';
 } catch(error) {
  if(error.premiumRequired){
   status.textContent='';
   state.innerHTML='<div class="empty-state"><h2>For You is a Premium feature</h2><p>'+escapeHtml(error.message)+'</p></div>';
   more.hidden=true;refresh.hidden=true;
   return;
  }
  status.textContent=error.message || 'Unable to load your news. Please try again.';status.classList.add('is-error');
  state.innerHTML='<button class="button" type="button" id="feed-retry">Try again</button>';
  document.getElementById('feed-retry').addEventListener('click',()=>load(reset));refresh.hidden=false;
 } finally {loading=false;more.disabled=false;refresh.disabled=false;}
}
more.addEventListener('click',()=>load());refresh.addEventListener('click',()=>load(true));
async function init(){if(await requireAuth()) await load(true);}
init();

window.addEventListener('pageshow',event=>{if(event.persisted)load(true);});
