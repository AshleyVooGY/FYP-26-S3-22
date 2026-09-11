import { supabase } from "../../config/supabaseClient.js";

// ==========================================================
// FEATURE 7
// USER PREFERENCE AND INTEREST MANAGEMENT
// ==========================================================

import { ICONS } from "./icons.js";


// ==========================================================
// CATEGORY ICONS
// These icons are only for display.
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
// DATA
// ==========================================================

// Categories will be loaded from Supabase.
// Each category will look like:
// {
//     id: 1,
//     name: "Technology",
//     icon: "▣"
// }

let categories = [];


// Stores the category IDs in numeric format selected by the user.
// Example:
// [1, 2, 3]

let selectedInterests = [];


// Keeps the last saved version so Cancel can restore it.

let originalInterests = [];


// ==========================================================
// PAGE ELEMENTS
// ==========================================================

const interestGrid =
    document.getElementById("interestGrid");

const setupPage =
    document.getElementById("setupPage");

const managePage =
    document.getElementById("managePage");

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

const manageSaveButton =
    document.getElementById("manageSaveButton");

const cancelButton =
    document.getElementById("cancelButton");

const addInterestButton =
    document.getElementById("addInterest");

const saveChangesButton =
    document.getElementById("saveChanges");

const successMessage =
    document.getElementById("successMessage");


// ==========================================================
// GET CURRENT LOGGED-IN USER
// ==========================================================

async function getCurrentUser() {

    const {
        data: { user },
        error
    } = await supabase.auth.getUser();


    if (error) {

        console.error(
            "Unable to get current user:",
            error
        );

        return null;
    }


    return user;
}


// ==========================================================
// LOAD CATEGORIES FROM SUPABASE
// ==========================================================

async function loadCategories() {

    const {
        data,
        error
    } = await supabase
        .from("categories")
        .select("id, name")
        .order("id");


    if (error) {

        console.error(
            "Unable to load categories:",
            error
        );

        alert(
            "Unable to load news categories."
        );

        return false;
    }


    categories = data.map(category => ({

        id: category.id,

        name: category.name,

        icon:
            categoryIcons[category.name] ??
            ICONS.tag

    }));


    console.log(
        "Categories loaded:",
        categories
    );


    return true;
}


// ==========================================================
// LOAD USER PREFERENCES FROM SUPABASE
// ==========================================================

async function loadUserPreferences(userId) {

    const {
        data,
        error
    } = await supabase
        .from("user_preferences")
        .select("category_id")
        .eq("user_id", userId);


    if (error) {

        console.error(
            "Unable to load preferences:",
            error
        );

        return false;
    }


    selectedInterests =
        data.map(
            preference =>
                preference.category_id
        );


    originalInterests =
        [...selectedInterests];


    console.log(
        "Saved preferences:",
        selectedInterests
    );


    return true;
}


// ==========================================================
// SAVE USER PREFERENCES TO SUPABASE
// ==========================================================

async function saveUserPreferences() {

    const user =
        await getCurrentUser();


    if (!user) {

        alert(
            "You must be logged in to save preferences."
        );

        return false;
    }


    // ------------------------------------------------------
    // Remove the user's previous preferences
    // ------------------------------------------------------

    const {
        error: deleteError
    } = await supabase
        .from("user_preferences")
        .delete()
        .eq("user_id", user.id);


    if (deleteError) {

        console.error(
            "Unable to remove previous preferences:",
            deleteError
        );

        alert(
            "Unable to update your preferences."
        );

        return false;
    }


    // ------------------------------------------------------
    // If the user selected nothing,
    // deleting the old preferences is enough.
    // ------------------------------------------------------

    if (
        selectedInterests.length === 0
    ) {

        originalInterests = [];

        return true;
    }


    // ------------------------------------------------------
    // Prepare rows for insertion
    // ------------------------------------------------------

    const preferenceRows =
        selectedInterests.map(
            categoryId => ({

                user_id: user.id,

                category_id: categoryId

            })
        );


    // ------------------------------------------------------
    // Insert new preferences
    // ------------------------------------------------------

    const {
        error: insertError
    } = await supabase
        .from("user_preferences")
        .insert(
            preferenceRows
        );


    if (insertError) {

        console.error(
            "Unable to save preferences:",
            insertError
        );

        alert(
            "Unable to save your preferences."
        );

        return false;
    }


    originalInterests =
        [...selectedInterests];


    console.log(
        "Preferences saved:",
        preferenceRows
    );


    return true;
}


// ==========================================================
// CREATE INTEREST CARDS
// ==========================================================

function renderInterestCards() {

    interestGrid.innerHTML = "";


    categories.forEach(
        category => {

            const card =
                document.createElement(
                    "div"
                );


            card.className =
                "interest-card";


            if (
                selectedInterests.includes(
                    category.id
                )
            ) {

                card.classList.add(
                    "selected"
                );

            }


            card.innerHTML = `

                <div class="check-box">
                    ✓
                </div>

                <div class="category-icon">
                    ${category.icon}
                </div>

                <div class="category-name">
                    ${category.name}
                </div>

            `;


            card.addEventListener(
                "click",
                () => {

                    toggleInterest(
                        category.id
                    );

                    renderInterestCards();

                }
            );


            interestGrid.appendChild(
                card
            );

        }
    );

}


// ==========================================================
// SELECT / UNSELECT INTEREST
// ==========================================================

function toggleInterest(categoryId) {

    const index =
        selectedInterests.indexOf(
            categoryId
        );


    if (index === -1) {

        selectedInterests.push(
            categoryId
        );

    } else {

        selectedInterests.splice(
            index,
            1
        );

    }

}


// ==========================================================
// RENDER MANAGE PREFERENCE CHECKBOXES
// ==========================================================

function renderPreferenceList() {

    preferenceList.innerHTML = "";


    categories.forEach(
        category => {

            const label =
                document.createElement(
                    "label"
                );


            label.className =
                "preference-item";


            const checked =
                selectedInterests.includes(
                    category.id
                );


            if (checked) {

                label.classList.add(
                    "is-checked"
                );

            }


            label.innerHTML = `

                <input
                    type="checkbox"
                    value="${category.id}"
                    ${checked ? "checked" : ""}
                >

                <span class="pref-icon">
                    ${category.icon}
                </span>

                <span>
                    ${category.name}
                </span>

            `;


            const checkbox =
                label.querySelector(
                    "input"
                );


            checkbox.addEventListener(
                "change",
                event => {

                    label.classList.toggle(
                        "is-checked",
                        event.target.checked
                    );


                    if (
                        event.target.checked
                    ) {

                        if (
                            !selectedInterests.includes(
                                category.id
                            )
                        ) {

                            selectedInterests.push(
                                category.id
                            );

                        }

                    } else {

                        selectedInterests =
                            selectedInterests.filter(
                                id =>
                                    id !==
                                    category.id
                            );

                    }


                    renderSelectedInterestTags();

                    populateInterestSelect();

                }
            );


            preferenceList.appendChild(
                label
            );

        }
    );

}


// ==========================================================
// RENDER SELECTED INTEREST TAGS
// ==========================================================

function renderSelectedInterestTags() {

    selectedInterestsContainer.innerHTML =
        "";


    if (
        selectedInterests.length === 0
    ) {

        selectedInterestsContainer.innerHTML = `

            <span>
                No interests selected.
            </span>

        `;

        return;
    }


    selectedInterests.forEach(
        categoryId => {

            const category =
                categories.find(
                    item =>
                        item.id ===
                        categoryId
                );


            if (!category) {

                return;

            }


            const tag =
                document.createElement(
                    "div"
                );


            tag.className =
                "interest-tag";


            tag.innerHTML = `

                ${category.icon}
                ${category.name}

                <button
                    class="remove-interest"
                    data-id="${category.id}"
                    title="Remove interest"
                >
                    ×
                </button>

            `;


            const removeButton =
                tag.querySelector(
                    ".remove-interest"
                );


            removeButton.addEventListener(
                "click",
                () => {

                    selectedInterests =
                        selectedInterests.filter(
                            id =>
                                id !==
                                category.id
                        );


                    renderSelectedInterestTags();

                    renderPreferenceList();

                    populateInterestSelect();

                }
            );


            selectedInterestsContainer.appendChild(
                tag
            );

        }
    );

}


// ==========================================================
// POPULATE ADD INTEREST DROPDOWN
// ==========================================================

function populateInterestSelect() {

    interestSelect.innerHTML = `

        <option value="">
            Choose a category
        </option>

    `;


    categories.forEach(
        category => {

            if (
                !selectedInterests.includes(
                    category.id
                )
            ) {

                const option =
                    document.createElement(
                        "option"
                    );


                option.value =
                    category.id;


                option.textContent =
                    category.name;


                interestSelect.appendChild(
                    option
                );

            }

        }
    );

}


// ==========================================================
// ADD INTEREST BUTTON
// ==========================================================

addInterestButton.addEventListener(
    "click",
    () => {

        const categoryId =
            Number(
                interestSelect.value
            );


        if (!categoryId) {

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


        renderSelectedInterestTags();

        renderPreferenceList();

        populateInterestSelect();

    }
);


// ==========================================================
// SAVE INITIAL PREFERENCES
// ==========================================================

savePreferencesButton.addEventListener(
    "click",
    async () => {

        if (
            selectedInterests.length === 0
        ) {

            alert(
                "Please select at least one interest."
            );

            return;

        }


        savePreferencesButton.disabled =
            true;


        const success =
            await saveUserPreferences();


        savePreferencesButton.disabled =
            false;


        if (!success) {

            return;

        }


        alert(
            "Preferences saved successfully!"
        );


        showManagePage();

    }
);


// ==========================================================
// SKIP FOR NOW
// ==========================================================

skipPreferencesButton.addEventListener(
    "click",
    () => {

        window.location.href =
            "index.html";

    }
);


// ==========================================================
// SAVE MANAGED PREFERENCES
// ==========================================================

manageSaveButton.addEventListener(
    "click",
    async () => {

        manageSaveButton.disabled =
            true;


        const success =
            await saveUserPreferences();


        manageSaveButton.disabled =
            false;


        if (success) {

            showSuccessMessage();

            renderSelectedInterestTags();

            populateInterestSelect();

        }

    }
);


// ==========================================================
// SAVE CHANGES
// ==========================================================

saveChangesButton.addEventListener(
    "click",
    async () => {

        saveChangesButton.disabled =
            true;


        const success =
            await saveUserPreferences();


        saveChangesButton.disabled =
            false;


        if (success) {

            showSuccessMessage();

        }

    }
);


// ==========================================================
// CANCEL CHANGES
// ==========================================================

cancelButton.addEventListener(
    "click",
    () => {

        selectedInterests =
            [...originalInterests];


        renderPreferenceList();

        renderSelectedInterestTags();

        populateInterestSelect();

    }
);


// ==========================================================
// SHOW SUCCESS MESSAGE
// ==========================================================

function showSuccessMessage() {

    successMessage.classList.remove(
        "hidden"
    );


    setTimeout(
        () => {

            successMessage.classList.add(
                "hidden"
            );

        },
        3000
    );

}


// ==========================================================
// SHOW MANAGE PAGE
// ==========================================================

function showManagePage() {

    setupPage.classList.add(
        "hidden"
    );


    managePage.classList.remove(
        "hidden"
    );


    renderPreferenceList();

    renderSelectedInterestTags();

    populateInterestSelect();

}


// ==========================================================
// SHOW INITIAL SETUP PAGE
// ==========================================================

function showSetupPage() {

    setupPage.classList.remove(
        "hidden"
    );


    managePage.classList.add(
        "hidden"
    );


    renderInterestCards();

}


// ==========================================================
// INITIALISE FEATURE 7
// ==========================================================

async function initialise() {

    // ------------------------------------------------------
    // Check if user is logged in
    // ------------------------------------------------------

    const user =
        await getCurrentUser();


    if (!user) {

        alert(
            "Please log in before managing your preferences."
        );

        return;

    }


    console.log(
        "Logged-in user:",
        user.id
    );


    // ------------------------------------------------------
    // Load categories
    // ------------------------------------------------------

    const categoriesLoaded =
        await loadCategories();


    if (!categoriesLoaded) {

        return;

    }


    // ------------------------------------------------------
    // Load the user's existing preferences
    // ------------------------------------------------------

    const preferencesLoaded =
        await loadUserPreferences(
            user.id
        );


    if (!preferencesLoaded) {

        return;

    }


    // ------------------------------------------------------
    // If the user has saved preferences before,
    // show Manage Preferences.
    //
    // Otherwise show first-time setup.
    // ------------------------------------------------------

    if (
        selectedInterests.length > 0
    ) {

        showManagePage();

    } else {

        showSetupPage();

    }

}


initialise();