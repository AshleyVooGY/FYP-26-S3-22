import { getCurrentUser as authCurrentUser } from "./auth.js?v=upgrade-cta-20261022";
import { getNewsPreferences, saveNewsPreferences } from "../../services/personalizationService.js?v=upgrade-cta-20261022";

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


// ==========================================================
// ELEMENTS
// ==========================================================

const setupPage =
    document.getElementById("setupPage");

const managePage =
    document.getElementById("managePage");

const interestGrid =
    document.getElementById("interestGrid");

const preferenceList =
    document.getElementById("preferenceList");

const selectedInterestsContainer =
    document.getElementById("selectedInterests");

const interestSelect =
    document.getElementById("interestSelect");

const savePreferencesButton =
    document.getElementById("savePreferences");

const skipPreferencesButton =
    document.getElementById("skipPreferences");

const cancelButton =
    document.getElementById("cancelButton");

const addInterestButton =
    document.getElementById("addInterest");

const saveChangesButton =
    document.getElementById("saveChanges");

const successMessage =
    document.getElementById("successMessage");

const userLabel =
    document.getElementById("user-label");


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
 allTags=loadedPreferences.tags;
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

    renderPreferenceList();

    renderSelectedInterestTags();

    populateInterestSelect();

}


// ==========================================================
// RENDER PREFERENCE LIST
// ==========================================================

function renderPreferenceList() {

    if (!preferenceList) {

        return;

    }


    preferenceList.innerHTML =
        categories
            .map(
                category => {

                    const checked =
                        selectedInterests.includes(
                            category.id
                        );


                    return `

                        <label
                            class="preference-item
                            ${checked ? "is-checked" : ""}"
                        >

                            <input
                                type="checkbox"
                                value="${category.id}"
                                ${checked ? "checked" : ""}
                            />


                            <span class="pref-icon">
                                ${category.icon}
                            </span>


                            <span>
                                ${escapeHtml(
                                    category.name
                                )}
                            </span>

                        </label>

                    `;

                }
            )
            .join("");


    preferenceList
        .querySelectorAll(
            'input[type="checkbox"]'
        )
        .forEach(
            checkbox => {

                checkbox.addEventListener(
                    "change",
                    event => {

                        const categoryId =
                            Number(
                                event.target.value
                            );


                        toggleInterest(
                            categoryId
                        );

                    }
                );

            }
        );

}


// ==========================================================
// RENDER SELECTED INTEREST TAGS
// ==========================================================

function renderSelectedInterestTags() {

    if (!selectedInterestsContainer) {

        return;

    }


    const selectedCategories =
        categories.filter(
            category =>
                selectedInterests.includes(
                    category.id
                )
        );


    if (
        selectedCategories.length === 0
    ) {

        selectedInterestsContainer.innerHTML = `

            <span>
                No interests selected.
            </span>

        `;

        return;

    }


    selectedInterestsContainer.innerHTML =
        selectedCategories
            .map(
                category => `

                    <span class="interest-tag">

                        ${escapeHtml(
                            category.name
                        )}

                        <button
                            class="remove-interest"
                            type="button"
                            data-category-id="${category.id}"
                            aria-label="Remove ${escapeHtml(
                                category.name
                            )}"
                        >
                            ×
                        </button>

                    </span>

                `
            )
            .join("");


    selectedInterestsContainer
        .querySelectorAll(
            ".remove-interest"
        )
        .forEach(
            button => {

                button.addEventListener(
                    "click",
                    event => {

                        event.stopPropagation();


                        toggleInterest(
                            Number(
                                button.dataset.categoryId
                            )
                        );

                    }
                );

            }
        );

}


// ==========================================================
// POPULATE SELECT
// ==========================================================

function populateInterestSelect() {

    if (!interestSelect) {

        return;

    }


    const available =
        categories.filter(
            category =>
                !selectedInterests.includes(
                    category.id
                )
        );


    interestSelect.innerHTML = `

        <option value="">
            Choose a category
        </option>

        ${
            available
                .map(
                    category => `

                        <option
                            value="${category.id}"
                        >
                            ${escapeHtml(
                                category.name
                            )}
                        </option>

                    `
                )
                .join("")
        }

    `;

}


// ==========================================================
// ADD INTEREST
// ==========================================================

if (addInterestButton) {

    addInterestButton.addEventListener(
        "click",
        () => {

            const categoryId =
                Number(
                    interestSelect.value
                );


            if (!categoryId) {

                setPreferenceStatus('Please choose a category.', true);

                return;

            }


            if (
                !selectedInterests.includes(
                    categoryId
                )
            ) {

                selectedInterests.push(
                    categoryId
                );

            }


            renderInterestCards();

            renderPreferenceList();

            renderSelectedInterestTags();

            populateInterestSelect();

        }
    );

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
// SAVE INITIAL PREFERENCES
// ==========================================================

if (savePreferencesButton) {

    savePreferencesButton.addEventListener(
        "click",
        async () => {

            try {

                const saved =
                    await saveCurrentPreferences();


                if (!saved) {

                    return;

                }


                setPreferenceStatus('Preferences saved successfully!');


                showManagePage();

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
// SKIP
// ==========================================================

if (skipPreferencesButton) {

    skipPreferencesButton.addEventListener(
        "click",
        () => {

            showManagePage();

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


                showManagePage();
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

            renderPreferenceList();

            renderSelectedInterestTags();

            populateInterestSelect();
            setPreferenceStatus('Changes cancelled. Your saved preferences are unchanged.');

        }
    );

}


// ==========================================================
// SUCCESS MESSAGE
// ==========================================================

function showSuccessMessage() { setPreferenceStatus('Preferences saved. Your For You feed is ready.'); }

// ==========================================================
// SHOW MANAGE PAGE
// ==========================================================

function showManagePage() {

    if (setupPage) {

        setupPage.classList.add(
            "hidden"
        );

    }


    if (managePage) {

        managePage.classList.remove(
            "hidden"
        );

    }


    renderPreferenceList();

    renderSelectedInterestTags();

    populateInterestSelect();

}


// ==========================================================
// UPDATE USER LABEL
// ==========================================================

function updateUserLabel() {

    if (!userLabel) {

        return;

    }


    if (currentUser) {

        userLabel.textContent =
            currentUser.user_metadata?.display_name ||
            currentUser.email ||
            "Account";

    } else {

        userLabel.textContent =
            "Guest";

    }

}


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
 field.innerHTML=allTags.length ? allTags.map(tag=>`<label class="preference-tag"><input type="checkbox" value="${Number(tag.id)}" ${selectedTags.includes(Number(tag.id))?'checked':''}> ${escapeHtml(tag.name)}</label>`).join('') : '<p>No tags available yet. You can still follow categories.</p>';
 field.querySelectorAll('input').forEach(input=>input.addEventListener('change',()=>{
  const id=Number(input.value);
  selectedTags=input.checked ? [...selectedTags,id] : selectedTags.filter(item=>item!==id);
  setPreferenceStatus('Unsaved changes. Save preferences to update For You.');
 }));
}
async function initialise() {
 const fields=document.getElementById('preference-fields');
 fields.disabled=true;
 document.getElementById('preferences-retry').hidden=true;
 setPreferenceStatus('Loading your preferences…');
 try {
  currentUser=await getCurrentUser();
  if(!currentUser){ window.location.href='login.html'; return; }
  updateUserLabel();
  await loadCategories();
  selectedInterests=await loadUserPreferences(); originalInterests=[...selectedInterests];
  renderInterestCards(); renderPreferenceList(); renderSelectedInterestTags(); populateInterestSelect();
  if(selectedInterests.length || selectedTags.length) showManagePage();
  else { setupPage.classList.remove('hidden');managePage.classList.add('hidden'); }
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
