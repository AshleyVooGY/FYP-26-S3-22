import { getCurrentUser as authCurrentUser } from "./auth.js?v=session-check-fix-20261113";
import { getNewsPreferences, saveNewsPreferences } from "../../services/personalizationService.js?v=news-page-totals-20261023";

import { ICONS } from "./icons.js";


// ==========================================================
// CATEGORY ICONS
// ==========================================================

const categoryIcons = {

    Technology: ICONS.cpu,

    Business: ICONS.building,

    Sports: ICONS.runner,

    Politics: ICONS.government,

    Entertainment: ICONS.play,

    Science: ICONS.shareHub,

    Health: ICONS.heartPulse,

    Lifestyle: ICONS.pencilSquare,

    Environment: ICONS.mountain

};


// ==========================================================
// STATE
// ==========================================================

let categories = [];

let selectedInterests = [];

let originalInterests = [];

let currentUser = null;
let allTags = [];
let selectedTags = [];
let originalTags = [];
let originalActivity = true;
let loadedPreferences;
let preferencesSaving = false;
const TAG_PAGE_SIZE = 12;
let tagPage = 1;


// ==========================================================
// ELEMENTS
// ==========================================================

const setupPage =
    document.getElementById("setupPage");

const interestGrid =
    document.getElementById("interestGrid");

const skipPreferencesButton =
    document.getElementById("skipPreferences");

const cancelButton =
    document.getElementById("cancelButton");

const saveChangesButton =
    document.getElementById("saveChanges");

// ==========================================================
// AUTHENTICATION
// ==========================================================

async function getCurrentUser() { return authCurrentUser(); }

// ==========================================================
// LOAD CATEGORIES
// ==========================================================

async function loadCategories() {
 loadedPreferences=await getNewsPreferences();
 categories=loadedPreferences.categories.map(category=>({...category,id:Number(category.id),icon:categoryIcons[category.name] || ICONS.cpu}));
 allTags=[...loadedPreferences.tags].sort((a,b)=>a.name.localeCompare(b.name) || Number(a.id)-Number(b.id));
 originalActivity=loadedPreferences.useActivity;
 document.getElementById('use-reading-activity').checked=originalActivity;
 selectedTags=[...loadedPreferences.tagIds]; originalTags=[...selectedTags];
 renderTagPreferences();
}

// ==========================================================
// LOAD USER PREFERENCES
// ==========================================================

async function loadUserPreferences() { return [...loadedPreferences.categoryIds]; }

// ==========================================================
// RENDER INTEREST CARDS
// ==========================================================

function renderInterestCards() {
 if (!interestGrid) return;
 interestGrid.innerHTML=categories.length ? categories.map(category=>`<button type="button" class="interest-card ${selectedInterests.includes(category.id)?'selected':''}" data-category-id="${category.id}" aria-pressed="${selectedInterests.includes(category.id)}"><span class="check-box">${selectedInterests.includes(category.id)?'✓':''}</span><span class="category-icon">${category.icon}</span><span class="category-name">${escapeHtml(category.name)}</span></button>`).join('') : '<p class="state-message">No categories available.</p>';
 interestGrid.querySelectorAll('[data-category-id]').forEach(card=>card.addEventListener('click',()=>{if(!preferencesSaving)toggleInterest(Number(card.dataset.categoryId));}));
}

// ==========================================================
// TOGGLE INTEREST
// ==========================================================

function toggleInterest(
    categoryId
) {

    if (
        selectedInterests.includes(
            categoryId
        )
    ) {

        selectedInterests =
            selectedInterests.filter(
                id =>
                    id !== categoryId
            );

    } else {

        selectedInterests.push(
            categoryId
        );

    }


    setPreferenceStatus('Unsaved changes. Save preferences to update For You.');
    renderInterestCards();

}


// ==========================================================
// SAVE TO SUPABASE
// ==========================================================

async function saveCurrentPreferences() {
 if (preferencesSaving) return false;
 if (!currentUser) { setPreferenceStatus('Please sign in before saving preferences.',true); return false; }
 preferencesSaving=true;
 const categorySnapshot=[...selectedInterests],tagSnapshot=[...selectedTags],activitySnapshot=document.getElementById('use-reading-activity').checked;
 document.getElementById('preference-fields').disabled=true;
 setPreferenceStatus('Saving preferences…');
 try {
  await saveNewsPreferences(categorySnapshot,tagSnapshot,activitySnapshot);
  originalInterests=categorySnapshot; originalTags=tagSnapshot; originalActivity=activitySnapshot;
  return true;
 } finally {
  preferencesSaving=false;
  document.getElementById('preference-fields').disabled=false;
 }
}

// ==========================================================
// SKIP
// ==========================================================

if (skipPreferencesButton) {

    skipPreferencesButton.addEventListener(
        "click",
        () => {

            document.getElementById('preference-tag-search').focus();

        }
    );

}


// ==========================================================
// SAVE CHANGES
// ==========================================================

if (saveChangesButton) {

    saveChangesButton.addEventListener(
        "click",
        async () => {

            try {

                const saved =
                    await saveCurrentPreferences();


                if (!saved) {

                    return;

                }


                renderInterestCards();
                showSuccessMessage();

            } catch (error) {

                console.error(
                    error
                );


                setPreferenceStatus(error.message || 'Unable to save preferences. Please try again.', true);

            }

        }
    );

}


// ==========================================================
// CANCEL
// ==========================================================

if (cancelButton) {

    cancelButton.addEventListener(
        "click",
        () => {

            selectedInterests =
                [...originalInterests];


            selectedTags = [...originalTags];
            document.getElementById('use-reading-activity').checked=originalActivity;
            renderTagPreferences();
            renderInterestCards();
            setPreferenceStatus('Changes cancelled. Your saved preferences are unchanged.');

        }
    );

}


// ==========================================================
// SUCCESS MESSAGE
// ==========================================================

function showSuccessMessage() { setPreferenceStatus('Preferences saved. Your For You feed is ready.'); }

// The shared auth module renders the Settings display name in the header.

// ==========================================================
// ESCAPE HTML
// ==========================================================

function escapeHtml(
    value
) {

    return String(
        value ?? ""
    )
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );

}


// ==========================================================
// INITIALISE
// ==========================================================

function setPreferenceStatus(message,isError=false) {
 const status=document.getElementById('preferences-status');
 status.textContent=message; status.classList.toggle('is-error',isError);
}
function renderTagPreferences() {
 const field=document.getElementById('tag-preferences');
 const query=document.getElementById('preference-tag-search').value.trim().toLocaleLowerCase();
 const matches=allTags.filter(tag=>tag.name.toLocaleLowerCase().includes(query));
 const pages=Math.max(1,Math.ceil(matches.length/TAG_PAGE_SIZE));
 tagPage=Math.max(1,Math.min(tagPage,pages));
 const start=(tagPage-1)*TAG_PAGE_SIZE;
 const followed=new Set(selectedTags);
 const selected=allTags.filter(tag=>followed.has(Number(tag.id)));
 document.getElementById('followed-tag-count').textContent=`(${selected.length})`;
 document.getElementById('clear-followed-tags').hidden=selectedTags.length===0;
 document.getElementById('followed-tags').innerHTML=selected.length
  ? selected.map(tag=>`<button class="followed-tag" type="button" data-remove-tag="${Number(tag.id)}" aria-label="Unfollow ${escapeHtml(tag.name)}"><span>${escapeHtml(tag.name)}</span><span aria-hidden="true">×</span></button>`).join('')
  : '<p class="tag-picker__hint">No tags selected yet. Choose topics below or just follow categories.</p>';
 field.innerHTML=matches.length ? matches.slice(start,start+TAG_PAGE_SIZE).map(tag=>`<label class="preference-tag" title="${escapeHtml(tag.name)}"><input id="preference-tag-${Number(tag.id)}" type="checkbox" value="${Number(tag.id)}" ${followed.has(Number(tag.id))?'checked':''}><span>${escapeHtml(tag.name)}</span></label>`).join('')
  : `<p class="tag-picker__hint">${allTags.length ? 'No tags match your search. Try another topic.' : 'No tags available yet. You can still follow categories.'}</p>`;
 document.getElementById('preference-tag-results').textContent=matches.length ? `Showing ${start+1}–${Math.min(start+TAG_PAGE_SIZE,matches.length)} of ${matches.length} tags` : '0 tags';
 document.getElementById('clear-tag-search').hidden=!document.getElementById('preference-tag-search').value;
 document.getElementById('preference-tag-pagination').hidden=pages===1;
 document.getElementById('preference-tag-page').textContent=`Page ${tagPage} of ${pages}`;
 document.getElementById('previous-tag-page').disabled=tagPage===1;
 document.getElementById('next-tag-page').disabled=tagPage===pages;
}
function markTagsChanged() {
 setPreferenceStatus('Unsaved changes. Save preferences to update For You.');
 renderTagPreferences();
}
document.getElementById('tag-preferences').addEventListener('change',event=>{
 if(preferencesSaving || !event.target.matches('input[type="checkbox"]')) return;
 const input=event.target,id=Number(input.value),focusId=input.id;
 selectedTags=input.checked ? [...new Set([...selectedTags,id])] : selectedTags.filter(item=>item!==id);
 markTagsChanged();
 document.getElementById(focusId)?.focus({preventScroll:true});
});
document.getElementById('followed-tags').addEventListener('click',event=>{
 const button=event.target.closest('[data-remove-tag]');
 if(preferencesSaving || !button) return;
 selectedTags=selectedTags.filter(id=>id!==Number(button.dataset.removeTag));
 markTagsChanged();
 document.getElementById('preference-tag-search').focus({preventScroll:true});
});
document.getElementById('clear-followed-tags').addEventListener('click',()=>{
 if(preferencesSaving) return;
 selectedTags=[];
 markTagsChanged();
 document.getElementById('preference-tag-search').focus({preventScroll:true});
});
document.getElementById('preference-tag-search').addEventListener('input',()=>{tagPage=1;renderTagPreferences();});
document.getElementById('preference-tag-search').addEventListener('keydown',event=>{
 if(event.key!=='Enter' || event.isComposing) return;
 event.preventDefault();
 tagPage=1;
 renderTagPreferences();
});
document.getElementById('clear-tag-search').addEventListener('click',()=>{
 document.getElementById('preference-tag-search').value='';tagPage=1;renderTagPreferences();
 document.getElementById('preference-tag-search').focus();
});
document.getElementById('previous-tag-page').addEventListener('click',()=>{tagPage--;renderTagPreferences();});
document.getElementById('next-tag-page').addEventListener('click',()=>{tagPage++;renderTagPreferences();});
async function initialise() {
 const fields=document.getElementById('preference-fields');
 fields.disabled=true;
 document.getElementById('preferences-retry').hidden=true;
 setPreferenceStatus('Loading your preferences…');
 try {
  currentUser=await getCurrentUser();
  if(!currentUser){ window.location.href='login.html'; return; }
  await loadCategories();
  selectedInterests=await loadUserPreferences(); originalInterests=[...selectedInterests];
  renderInterestCards();
  setupPage.classList.remove('hidden');
  setPreferenceStatus('Choose categories and tags for For You. You can clear all selections at any time.');
  fields.disabled=false;
 } catch(error) {
  setPreferenceStatus(error.message || 'Unable to load preferences. Please try again.',true);
  document.getElementById('preferences-retry').hidden=false;
 }
}
document.getElementById('use-reading-activity').addEventListener('change',()=>setPreferenceStatus('Unsaved changes. Save preferences to update For You.'));
document.getElementById('preferences-retry').addEventListener('click',initialise);
initialise();
