import { requireAuth } from './auth.js?v=account-name-20261029';
import { getPersonalizedNews } from '../../services/personalizationService.js?v=news-page-totals-20261023';
import { escapeHtml, thumbHtml, formatRelativeTime, formatCount } from './format.js';
const grid=document.getElementById('feed-grid'),status=document.getElementById('feed-status'),state=document.getElementById('feed-state');
const previous=document.getElementById('feed-previous'),next=document.getElementById('feed-next'),refresh=document.getElementById('feed-refresh');
const navigation=document.getElementById('feed-pagination'),label=document.getElementById('feed-page');
const PAGE_SIZE=6;
let pages=[],pageIndex=0,loading=false;
function card(article) {
 return `<a class="article-card news-card-link" href="article.html?id=${Number(article.id)}"><div class="article-card__image">${thumbHtml(article)}</div><div class="article-card__body"><span class="badge">${escapeHtml(article.category_name || 'Uncategorised')}</span><h2>${escapeHtml(article.title || 'Untitled article')}</h2><p>${escapeHtml(article.content || '')}</p><div class="article-meta"><span>${escapeHtml(formatRelativeTime(article.published_at))}</span><span>◉ ${formatCount(article.view_count)} views</span><span>♡ ${formatCount(article.reaction_count)}</span></div></div></a>`;
}
function updateControls() {
 previous.disabled=loading||pageIndex===0;
 next.disabled=loading||!pages[pageIndex]?.cursor;
 refresh.disabled=loading;
 grid.setAttribute('aria-busy',String(loading));
 navigation.hidden=!pages[pageIndex]?.articles.length;
}
function renderPage(index,scroll=false) {
 pageIndex=index;
 const page=pages[index];
 grid.innerHTML=page.articles.map(card).join('');
 const start=index*PAGE_SIZE+1;
 status.textContent=page.articles.length?`Showing ${start}–${start+page.articles.length-1} of ${page.total} articles`:'No articles to show.';
 status.classList.remove('is-error');
 label.textContent=`Page ${index+1} of ${Math.max(1,Math.ceil(page.total/PAGE_SIZE))}`;
 state.innerHTML=!page.articles.length?'<div class="empty-state"><h2>You’re all caught up</h2><p>Check back for new stories, update your interests, or browse all news.</p><a class="button" href="categories.html">Browse news</a></div>':!page.hasPreferences?'<p class="feed-intro">Discover news to get started, or <a href="preferences.html">choose your interests</a> to shape your feed.</p>':'';
 refresh.hidden=false;updateControls();
 if(scroll)document.querySelector('#for-you-app .page-head').scrollIntoView({block:'start'});
}
async function loadPage(index=0,reset=false) {
 if(loading||index<0||(!reset&&index>pages.length))return;
 if(!reset&&pages[index]){renderPage(index,true);return;}
 const cursor=reset?null:pages.at(-1)?.cursor;
 if(!reset&&!cursor)return;
 loading=true;updateControls();
 status.textContent=reset?'Loading your news…':`Loading page ${index+1}…`;status.classList.remove('is-error');
 state.querySelector('#feed-retry')?.remove();
 try {
  const result=await getPersonalizedNews(cursor,PAGE_SIZE);
  // Keep the existing page until a new request succeeds, including refreshes.
  if(!reset&&!result.articles.length){
   pages.at(-1).cursor=null;renderPage(pageIndex);
   status.textContent='No more stories are available. Refresh for new recommendations.';
  }else{
   if(reset)pages=[result];else pages.push(result);
   renderPage(reset?0:index,!reset||grid.children.length>0);
  }
 }catch(error){
  status.textContent=error.message||'Unable to load your news. Please try again.';status.classList.add('is-error');
  state.insertAdjacentHTML('beforeend','<button class="button" type="button" id="feed-retry">Try again</button>');
  document.getElementById('feed-retry').addEventListener('click',()=>loadPage(index,reset));refresh.hidden=false;
 }finally{loading=false;updateControls();}
}
previous.addEventListener('click',()=>loadPage(pageIndex-1));next.addEventListener('click',()=>loadPage(pageIndex+1));refresh.addEventListener('click',()=>loadPage(0,true));
async function init(){if(await requireAuth())await loadPage(0,true);}
init();
window.addEventListener('pageshow',event=>{if(event.persisted)loadPage(0,true);});
