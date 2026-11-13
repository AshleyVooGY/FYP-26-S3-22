import { requireAuth } from "./auth.js?v=user-chip-fix-20261113";
import { escapeHtml, formatCount, formatRelativeTime, thumbHtml } from "./format.js";
import { getCategories, searchArticlesPage } from "../features-01-02-10/featureService.js?v=classification-pages-20261105";

const app = document.getElementById("search-app");
const initial = new URLSearchParams(location.search);
const dateValue = name => /^\d{4}-\d{2}-\d{2}$/.test(initial.get(name) || '') ? initial.get(name) : '';
const state = {
  categories: [],
  filters: {
    keyword: initial.get('q') || '',
    categoryId: /^[1-9]\d*$/.test(initial.get('category') || '') ? initial.get('category') : '',
    startDate: dateValue('from'), endDate: dateValue('to'),
    sort: ['latest', 'oldest', 'popularity'].includes(initial.get('sort')) ? initial.get('sort') : 'latest'
  },
  pageIndex: /^\d{1,6}$/.test(initial.get('page') || '') ? Math.max(0, Number(initial.get('page')) - 1) : 0,
  total: 0, loading: false, hasSearched: false
};
let requestToken = 0;
let selectListeners;
const hasCriteria = () => Boolean(state.filters.keyword.trim() || state.filters.categoryId || state.filters.startDate || state.filters.endDate);
const filterCount = () => ['categoryId', 'startDate', 'endDate'].filter(key => state.filters[key]).length;

function enhanceSelects() {
  selectListeners?.abort();
  selectListeners = new AbortController();
  const closeMenus = () => app.querySelectorAll('.search-select').forEach(control => {
    control.querySelector('[role="listbox"]').hidden = true;
    control.querySelector('[aria-haspopup]').setAttribute('aria-expanded', 'false');
  });
  app.querySelectorAll('#category, #search-sort').forEach(select => {
    if (select.hidden) return;
    const label = app.querySelector(`label[for="${select.id}"]`);
    const control = document.createElement('div');
    control.className = 'search-select';
    select.before(control);
    control.append(select);
    select.hidden = true;
    label.id = `${select.id}-label`;
    control.insertAdjacentHTML('beforeend', `<button type="button" id="${select.id}-trigger" class="search-select-trigger" aria-haspopup="listbox" aria-expanded="false" aria-controls="${select.id}-options" aria-labelledby="${label.id} ${select.id}-value"><span id="${select.id}-value">${escapeHtml(select.selectedOptions[0].textContent)}</span><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m6 9 6 6 6-6"/></svg></button><div id="${select.id}-options" class="search-select-options" role="listbox" aria-labelledby="${label.id}" hidden>${Array.from(select.options).map(option => `<button type="button" role="option" tabindex="-1" data-value="${escapeHtml(option.value)}" aria-selected="${option.selected}">${escapeHtml(option.textContent)}<span aria-hidden="true">✓</span></button>`).join('')}</div>`);
    label.htmlFor = `${select.id}-trigger`;
    const trigger = control.querySelector('.search-select-trigger');
    const menu = control.querySelector('[role="listbox"]');
    const options = Array.from(menu.querySelectorAll('[role="option"]'));
    const open = (index = select.selectedIndex) => {
      closeMenus(); menu.hidden = false; trigger.setAttribute('aria-expanded', 'true');
      options[Math.max(0, index)]?.focus();
    };
    trigger.addEventListener('click', () => menu.hidden ? open() : closeMenus());
    trigger.addEventListener('keydown', event => {
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); open(event.key === 'End' || event.key === 'ArrowUp' ? options.length - 1 : 0);
      }
    });
    menu.addEventListener('click', event => {
      const option = event.target.closest('[role="option"]');
      if (!option) return;
      select.value = option.dataset.value;
      control.querySelector(`#${select.id}-value`).textContent = option.textContent.replace('✓', '').trim();
      options.forEach(item => item.setAttribute('aria-selected', String(item === option)));
      closeMenus(); trigger.focus();
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    menu.addEventListener('keydown', event => {
      const index = options.indexOf(document.activeElement);
      let target;
      if (event.key === 'ArrowDown') target = (index + 1) % options.length;
      if (event.key === 'ArrowUp') target = (index - 1 + options.length) % options.length;
      if (event.key === 'Home') target = 0;
      if (event.key === 'End') target = options.length - 1;
      if (target !== undefined) { event.preventDefault(); options[target].focus(); }
      else if (event.key === 'Escape') { event.preventDefault(); closeMenus(); trigger.focus(); }
      else if (event.key === 'Tab') closeMenus();
      else if (event.key.length === 1 && /[a-z0-9]/i.test(event.key)) {
        const match = [...options.slice(index + 1), ...options.slice(0, index + 1)].find(item => item.textContent.trim().toLowerCase().startsWith(event.key.toLowerCase()));
        if (match) { event.preventDefault(); match.focus(); }
      }
    });
    control.addEventListener('focusout', event => {
      if (!control.contains(event.relatedTarget)) closeMenus();
    });
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.search-select')) closeMenus();
  }, { signal: selectListeners.signal });
}

function resultCard(article) {
  return `<a class="result-card news-card-link" href="article.html?id=${article.id}">
    <div class="article-card__image">${thumbHtml(article)}</div>
    <div><h2>${escapeHtml(article.title || "Untitled article")}</h2><p>${escapeHtml((article.content || "No summary available.").slice(0, 220))}</p><div class="article-meta"><span>${formatRelativeTime(article.published_at)}</span><span>◉ ${formatCount(article.view_count)} views</span><span>♡ ${formatCount(article.reaction_count)}</span></div></div>
  </a>`;
}

function renderPage() {
  app.innerHTML = `<header class="page-head"><div><h1>Search &amp; Filter News</h1><p>Search titles, content, categories and tags, then refine the results.</p></div><span id="result-count" role="status" aria-live="polite"></span></header>
    <form id="search-form" class="toolbar search-panel">
      <div class="field"><label for="keyword">Keyword</label><div class="button-row"><input id="keyword" name="keyword" type="search" value="${escapeHtml(state.filters.keyword)}" placeholder="Search news by keyword…"><button class="button button--primary" type="submit">Search</button></div></div>
      <div class="filter-row search-classic-filters">
        <div class="field"><label for="category">Category</label><select id="category" name="category"><option value="">All categories</option>${state.categories.map(item => `<option value="${item.id}" ${String(state.filters.categoryId) === String(item.id) ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></div>
        <div class="field"><label for="start-date">From date</label><input id="start-date" name="startDate" type="date" value="${state.filters.startDate}"></div>
        <div class="field"><label for="end-date">To date</label><input id="end-date" name="endDate" type="date" value="${state.filters.endDate}"></div>
        <div class="field"><label id="classic-sort-label" for="search-sort">Sort by</label>
          <select id="search-sort" name="sort" hidden>${[['latest','Latest'],['oldest','Oldest'],['popularity','Most viewed']].map(([value,label]) => `<option value="${value}" ${state.filters.sort === value ? 'selected' : ''}>${label}</option>`).join('')}</select>
          <div class="sort-group" role="group" aria-labelledby="classic-sort-label">${[['latest','Latest'],['oldest','Oldest'],['popularity','Popularity']].map(([value,label]) => `<button class="sort-button ${state.filters.sort === value ? 'is-active' : ''}" type="button" aria-pressed="${state.filters.sort === value}" aria-label="${value === 'popularity' ? 'Most viewed' : label}" data-sort="${value}">${label}</button>`).join('')}</div>
        </div>
        <div class="button-row"><a class="button news-card-link" href="categories.html">Browse all news</a></div>
      </div>
      <span id="filter-count" class="sr-only"></span>
    </form>
    <div id="active-filters" class="active-filters" aria-label="Applied filters"></div>
    <div id="search-results" class="result-list" aria-busy="false"></div>
    <nav id="search-pagination" class="search-pagination" aria-label="Search result pages" hidden><button id="search-previous" class="button" type="button">Previous</button><span id="search-page" aria-live="polite"></span><button id="search-next" class="button" type="button">Next</button></nav>`;

  const form = app.querySelector('#search-form');
  const start = app.querySelector('#start-date'), end = app.querySelector('#end-date');
  function validateDates() {
    end.setCustomValidity(start.value && end.value && start.value > end.value ? 'Choose an end date on or after the start date.' : '');
  }
  function applyForm(submitKeyword = false) {
    validateDates();
    if (!form.reportValidity()) return;
    const values = new FormData(form);
    state.filters = { keyword: submitKeyword ? String(values.get('keyword') || '').trim() : state.filters.keyword, categoryId: values.get('category') || '', startDate: start.value, endDate: end.value, sort: values.get('sort') || 'latest' };
    state.pageIndex = 0;
    syncUrl();
    runSearch();
  }
  form.addEventListener('submit', event => { event.preventDefault(); applyForm(true); });
  [app.querySelector('#category'), start, end, app.querySelector('#search-sort')].forEach(control => {
    control.addEventListener('change', () => applyForm());
  });
  app.querySelectorAll('[data-sort]').forEach(button => button.addEventListener('click', () => {
    const select = app.querySelector('#search-sort');
    select.value = button.dataset.sort;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    app.querySelectorAll('[data-sort]').forEach(item => {
      item.classList.toggle('is-active', item === button);
      item.setAttribute('aria-pressed', String(item === button));
    });
  }));
  app.querySelector('#search-previous').addEventListener('click', () => changePage(state.pageIndex - 1));
  app.querySelector('#search-next').addEventListener('click', () => changePage(state.pageIndex + 1));
  enhanceSelects();
}

function syncUrl() {
  const url = new URL(location.href);
  const values = { q: state.filters.keyword, category: state.filters.categoryId, from: state.filters.startDate, to: state.filters.endDate, sort: state.filters.sort === 'latest' ? '' : state.filters.sort, page: state.pageIndex ? state.pageIndex + 1 : '' };
  for (const [key, value] of Object.entries(values)) value ? url.searchParams.set(key, value) : url.searchParams.delete(key);
  history.replaceState(null, '', url);
}

function resetFilters() {
  state.filters = { ...state.filters, categoryId: '', startDate: '', endDate: '' };
  state.pageIndex = 0;
  syncUrl(); renderPage(); runSearch();
}

function renderFilters() {
  const labels = {
    keyword: state.filters.keyword ? `Keyword: ${state.filters.keyword}` : '',
    categoryId: state.categories.find(item => String(item.id) === String(state.filters.categoryId))?.name || '',
    startDate: state.filters.startDate ? `From: ${state.filters.startDate}` : '',
    endDate: state.filters.endDate ? `To: ${state.filters.endDate}` : ''
  };
  app.querySelector('#filter-count').textContent = filterCount() ? `(${filterCount()})` : '';
  const region = app.querySelector('#active-filters');
  region.innerHTML = Object.entries(labels).filter(([,label]) => label).map(([key,label]) => `<button type="button" class="classification-chip" data-remove="${key}" aria-label="${escapeHtml(`Remove ${label}`)}">${escapeHtml(label)} <span aria-hidden="true">×</span></button>`).join('') + (filterCount() ? '<button class="search-clear" type="button" data-clear-filters>Clear filters</button>' : '');
  region.querySelector('[data-clear-filters]')?.addEventListener('click', resetFilters);
  region.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', () => {
    state.filters[button.dataset.remove] = '';
    state.pageIndex = 0;
    syncUrl(); renderPage(); runSearch();
  }));
}

function updatePaging() {
  const pages = Math.max(1, Math.ceil(state.total / 6));
  app.querySelector('#search-pagination').hidden = !state.hasSearched || !state.total;
  app.querySelector('#search-page').textContent = `Page ${state.pageIndex + 1} of ${pages}`;
  app.querySelector('#search-previous').disabled = state.loading || state.pageIndex === 0;
  app.querySelector('#search-next').disabled = state.loading || state.pageIndex + 1 >= pages;
}

function changePage(index) {
  if (state.loading || index < 0 || index >= Math.ceil(state.total / 6)) return;
  state.pageIndex = index;
  syncUrl();
  runSearch(true);
}

async function runSearch(scroll = false) {
  const token = ++requestToken;
  const results = app.querySelector('#search-results');
  renderFilters();
  if (!hasCriteria()) {
    state.hasSearched = false; state.loading = false; state.total = 0; state.pageIndex = 0;
    syncUrl(); updatePaging();
    app.querySelector('#result-count').textContent = '';
    results.setAttribute('aria-busy', 'false');
    results.innerHTML = '<div class="empty-state search-start"><h2>What would you like to read?</h2><p>Search by keyword, or choose a category or date range above.</p><a class="button news-card-link" href="categories.html">Browse all news</a></div>';
    return;
  }
  state.hasSearched = true; state.loading = true;
  updatePaging();
  app.querySelector('#result-count').textContent = 'Searching…';
  results.setAttribute('aria-busy', 'true');
  results.innerHTML = '<div class="loading-panel" role="status">Searching…</div>';
  try {
    const page = await searchArticlesPage({ ...state.filters }, state.pageIndex);
    if (token !== requestToken) return;
    state.total = page.total;
    const lastPage = Math.max(0, Math.ceil(page.total / 6) - 1);
    if (state.pageIndex > lastPage) {
      state.pageIndex = lastPage; syncUrl(); return runSearch(scroll);
    }
    const start = page.articles.length ? state.pageIndex * 6 + 1 : 0;
    app.querySelector('#result-count').textContent = `${state.filters.keyword ? `Results for “${state.filters.keyword}” · ` : ''}Showing ${start}–${start ? start + page.articles.length - 1 : 0} of ${page.total} result${page.total === 1 ? '' : 's'}`;
    results.innerHTML = page.articles.length ? page.articles.map(resultCard).join('') : `<div class="empty-state"><h2>${state.filters.keyword ? `No news found for “${escapeHtml(state.filters.keyword)}”` : 'No news matches these filters'}</h2><p>Try another keyword or broaden your search.</p><div class="button-row empty-actions">${filterCount() ? '<button class="button" type="button" data-clear-filters>Clear filters</button>' : ''}<a class="button news-card-link" href="categories.html">Browse all news</a></div></div>`;
    results.querySelector('[data-clear-filters]')?.addEventListener('click', resetFilters);
    if (scroll) app.querySelector('.page-head').scrollIntoView({ block: 'start' });
  } catch (error) {
    if (token !== requestToken) return;
    app.querySelector('#result-count').textContent = '';
    state.total = 0;
    console.error(error);
    results.innerHTML = `<div class="empty-state"><h2>Search unavailable</h2><p>${escapeHtml(error?.message || 'Please try again.')}</p><button class="button" data-retry>Try again</button></div>`;
    results.querySelector('[data-retry]')?.addEventListener('click', () => runSearch());
  } finally {
    if (token === requestToken) {
      state.loading = false;
      results.setAttribute('aria-busy', 'false');
      updatePaging();
    }
  }
}

async function init() {
  const user = await requireAuth('welcome.html');
  if (!user) return;
  state.categories = await getCategories();
  renderPage();
  await runSearch();
}

init().catch(error => {
  console.error(error);
  app.innerHTML = `<div class="empty-state"><h2>Search unavailable</h2><p>${escapeHtml(error?.message || 'Please try again.')}</p></div>`;
});
