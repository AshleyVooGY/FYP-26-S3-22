import { supabase } from "../../config/supabaseClient.js";

// ==========================================================
// FEATURE 7
// USER PREFERENCE AND INTEREST MANAGEMENT
// ==========================================================


// ==========================================================
// CATEGORY ICONS
// ==========================================================

const categoryIcons = {
    Technology: "▣",
    Business: "▥",
    Sports: "⚝",
    Politics: "▤",
    Entertainment: "▷",
    Science: "♧",
    Health: "♡",
    Lifestyle: "✎",
    Environment: "♧"
};


// ==========================================================
// VARIABLES
// ==========================================================

// Categories will be loaded from Supabase
let categories = [];

// Selected category IDs
let selectedInterests = [];

// Used when cancelling changes
let originalInterests = [];

// Currently logged-in Supabase user
let currentUser = null;


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
// CHECK LOGIN STATUS
// ==========================================================

async function checkLoggedInUser() {

    try {

        const {
            data,
            error
        } = await supabase.auth.getUser();


        if (error) {

            console.error(
                "Error checking authentication:",
                error
            );

            currentUser = null;

            return null;
        }


        currentUser =
            data?.user ?? null;


        if (currentUser) {

            console.log(
                "Logged-in user:",
                currentUser.email
            );

        } else {

            console.log(
                "No user is currently logged in."
            );

            console.log(
                "Preference page is running in demo mode."
            );

        }


        return currentUser;

    } catch (error) {

        console.error(
            "Authentication check failed:",
            error
        );

        currentUser = null;

        return null;
    }
}


// ==========================================================
// LOAD CATEGORIES FROM SUPABASE
// ==========================================================

async function loadCategories() {

    try {

        const {
            data,
            error
        } = await supabase
            .from("categories")
            .select("id, name")
            .order("id");


        if (error) {

            console.error(
                "Error loading categories:",
                error
            );

            alert(
                "Unable to load news categories from the database."
            );

            return false;
        }


        categories = data || [];


        console.log(
            "Categories loaded from Supabase:",
            categories
        );


        if (categories.length === 0) {

            console.warn(
                "No categories were found in the categories table."
            );

            alert(
                "No news categories were found in the database."
            );

            return false;
        }


        return true;

    } catch (error) {

        console.error(
            "Unexpected error loading categories:",
            error
        );

        return false;
    }
}


// ==========================================================
// SET DEFAULT INTERESTS FOR DEMO MODE
// ==========================================================

// When the user is NOT logged in,
// use the three categories from the original design:
// Technology, Business and Sports.

function setDefaultInterests() {

    const defaultCategoryNames = [
        "Technology",
        "Business",
        "Sports"
    ];


    selectedInterests =
        categories
            .filter(category =>
                defaultCategoryNames.includes(
                    category.name
                )
            )
            .map(category =>
                Number(category.id)
            );


    originalInterests =
        [...selectedInterests];


    console.log(
        "Default demo interests:",
        selectedInterests
    );
}


// ==========================================================
// LOAD USER PREFERENCES FROM SUPABASE
// ==========================================================

async function loadUserPreferences() {

    // ------------------------------------------------------
    // If no user is logged in
    // ------------------------------------------------------

    if (!currentUser) {

        setDefaultInterests();

        return;
    }


    // ------------------------------------------------------
    // Logged-in user
    // ------------------------------------------------------

    try {

        const {
            data,
            error
        } = await supabase
            .from("user_preferences")
            .select("category_id")
            .eq(
                "user_id",
                currentUser.id
            );


        if (error) {

            console.error(
                "Error loading user preferences:",
                error
            );

            selectedInterests = [];

            originalInterests = [];

            return;
        }


        selectedInterests =
            (data || []).map(
                item =>
                    Number(item.category_id)
            );


        originalInterests =
            [...selectedInterests];


        console.log(
            "Saved user preferences:",
            selectedInterests
        );


    } catch (error) {

        console.error(
            "Unexpected error loading preferences:",
            error
        );

        selectedInterests = [];

        originalInterests = [];
    }
}


// ==========================================================
// RENDER INTEREST CARDS
// ==========================================================

function renderInterestCards() {

    if (!interestGrid) {
        return;
    }


    interestGrid.innerHTML = "";


    categories.forEach(category => {

        const categoryId =
            Number(category.id);


        const isSelected =
            selectedInterests.includes(
                categoryId
            );


        const card =
            document.createElement("div");


        card.className =
            "interest-card";


        if (isSelected) {

            card.classList.add(
                "selected"
            );

        }


        card.dataset.categoryId =
            categoryId;


        card.innerHTML = `

            <div class="check-box">
                ${isSelected ? "✓" : ""}
            </div>

            <div class="category-icon">
                ${categoryIcons[category.name] || "●"}
            </div>

            <div class="category-name">
                ${category.name}
            </div>

        `;


        card.addEventListener(
            "click",
            () => {

                toggleInterest(
                    categoryId
                );

            }
        );


        interestGrid.appendChild(
            card
        );

    });

}


// ==========================================================
// TOGGLE INTEREST
// ==========================================================

function toggleInterest(categoryId) {

    const index =
        selectedInterests.indexOf(
            categoryId
        );


    if (index === -1) {

        // Add interest

        selectedInterests.push(
            categoryId
        );

    } else {

        // Remove interest

        selectedInterests.splice(
            index,
            1
        );

    }


    // Update all parts of the interface

    renderInterestCards();

    renderPreferenceList();

    renderSelectedInterestTags();

    populateInterestSelect();
}


// ==========================================================
// RENDER PREFERENCE CHECKBOXES
// ==========================================================

function renderPreferenceList() {

    if (!preferenceList) {
        return;
    }


    preferenceList.innerHTML = "";


    categories.forEach(category => {

        const categoryId =
            Number(category.id);


        const checked =
            selectedInterests.includes(
                categoryId
            );


        const label =
            document.createElement("label");


        label.className =
            "preference-item";


        label.innerHTML = `

            <input
                type="checkbox"
                value="${categoryId}"
                ${checked ? "checked" : ""}
            >

            <span>
                ${categoryIcons[category.name] || "●"}
                &nbsp;
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

                if (
                    event.target.checked
                ) {

                    if (
                        !selectedInterests.includes(
                            categoryId
                        )
                    ) {

                        selectedInterests.push(
                            categoryId
                        );

                    }

                } else {

                    selectedInterests =
                        selectedInterests.filter(
                            id =>
                                id !== categoryId
                        );

                }


                renderInterestCards();

                renderSelectedInterestTags();

                populateInterestSelect();

            }
        );


        preferenceList.appendChild(
            label
        );

    });

}


// ==========================================================
// RENDER SELECTED INTEREST TAGS
// ==========================================================

function renderSelectedInterestTags() {

    if (!selectedInterestsContainer) {
        return;
    }


    selectedInterestsContainer.innerHTML = "";


    // ------------------------------------------------------
    // No interests
    // ------------------------------------------------------

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


    // ------------------------------------------------------
    // Display selected interests
    // ------------------------------------------------------

    selectedInterests.forEach(
        categoryId => {

            const category =
                categories.find(
                    item =>
                        Number(item.id) ===
                        Number(categoryId)
                );


            if (!category) {
                return;
            }


            const tag =
                document.createElement("div");


            tag.className =
                "interest-tag";


            tag.innerHTML = `

                ${category.name}

                <button
                    type="button"
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
                event => {

                    // Prevent any parent click behaviour
                    event.stopPropagation();


                    selectedInterests =
                        selectedInterests.filter(
                            id =>
                                Number(id) !==
                                Number(category.id)
                        );


                    renderInterestCards();

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

    if (!interestSelect) {
        return;
    }


    interestSelect.innerHTML = `

        <option value="">
            Choose a category
        </option>

    `;


    categories.forEach(category => {

        const categoryId =
            Number(category.id);


        // Only show categories that
        // have not already been selected

        if (
            !selectedInterests.includes(
                categoryId
            )
        ) {

            const option =
                document.createElement("option");


            option.value =
                categoryId;


            option.textContent =
                category.name;


            interestSelect.appendChild(
                option
            );

        }

    });

}


// ==========================================================
// ADD NEW INTEREST
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

                alert(
                    "Please choose a category."
                );

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


            // Reset dropdown

            interestSelect.value = "";

        }
    );

}


// ==========================================================
// SAVE PREFERENCES TO SUPABASE
// ==========================================================

async function saveCurrentPreferences() {

    // ------------------------------------------------------
    // Authentication check
    // ------------------------------------------------------

    if (!currentUser) {

        alert(
            "Please log in before saving your preferences."
        );

        return false;
    }


    // ------------------------------------------------------
    // At least one interest required
    // ------------------------------------------------------

    if (
        selectedInterests.length === 0
    ) {

        alert(
            "Please select at least one interest."
        );

        return false;
    }


    try {

        // --------------------------------------------------
        // Delete existing preferences
        // --------------------------------------------------

        const {
            error: deleteError
        } = await supabase
            .from("user_preferences")
            .delete()
            .eq(
                "user_id",
                currentUser.id
            );


        if (deleteError) {

            console.error(
                "Error deleting old preferences:",
                deleteError
            );

            alert(
                "Unable to update your preferences."
            );

            return false;
        }


        // --------------------------------------------------
        // Prepare new preference records
        // --------------------------------------------------

        const preferenceRows =
            selectedInterests.map(
                categoryId => ({

                    user_id:
                        currentUser.id,

                    category_id:
                        Number(categoryId)

                })
            );


        // --------------------------------------------------
        // Insert new preferences
        // --------------------------------------------------

        const {
            error: insertError
        } = await supabase
            .from("user_preferences")
            .insert(
                preferenceRows
            );


        if (insertError) {

            console.error(
                "Error inserting preferences:",
                insertError
            );

            alert(
                "Unable to save your preferences."
            );

            return false;
        }


        // --------------------------------------------------
        // Update original state
        // --------------------------------------------------

        originalInterests =
            [...selectedInterests];


        console.log(
            "Preferences successfully saved:",
            selectedInterests
        );


        return true;


    } catch (error) {

        console.error(
            "Unexpected error saving preferences:",
            error
        );

        alert(
            "An unexpected error occurred while saving your preferences."
        );

        return false;
    }
}


// ==========================================================
// SAVE INITIAL PREFERENCES
// ==========================================================

if (savePreferencesButton) {

    savePreferencesButton.addEventListener(
        "click",
        async () => {

            const success =
                await saveCurrentPreferences();


            if (!success) {
                return;
            }


            alert(
                "Preferences saved successfully!"
            );


            showManagePage();

        }
    );

}


// ==========================================================
// SKIP FOR NOW
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
// SAVE MANAGED PREFERENCES
// ==========================================================

if (manageSaveButton) {

    manageSaveButton.addEventListener(
        "click",
        async () => {

            const success =
                await saveCurrentPreferences();


            if (!success) {
                return;
            }


            showSuccessMessage();

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

            const success =
                await saveCurrentPreferences();


            if (!success) {
                return;
            }


            showSuccessMessage();

        }
    );

}


// ==========================================================
// CANCEL CHANGES
// ==========================================================

if (cancelButton) {

    cancelButton.addEventListener(
        "click",
        () => {

            // Restore the preferences
            // from before the changes

            selectedInterests =
                [...originalInterests];


            renderInterestCards();

            renderPreferenceList();

            renderSelectedInterestTags();

            populateInterestSelect();

        }
    );

}


// ==========================================================
// SHOW SUCCESS MESSAGE
// ==========================================================

function showSuccessMessage() {

    if (!successMessage) {
        return;
    }


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

    // Hide setup page

    if (setupPage) {

        setupPage.classList.add(
            "hidden"
        );

    }


    // Show manage page

    if (managePage) {

        managePage.classList.remove(
            "hidden"
        );

    }


    // Refresh manage page

    renderPreferenceList();

    renderSelectedInterestTags();

    populateInterestSelect();

}


// ==========================================================
// SHOW SETUP PAGE
// ==========================================================

function showSetupPage() {

    // Show setup page

    if (setupPage) {

        setupPage.classList.remove(
            "hidden"
        );

    }


    // Hide manage page

    if (managePage) {

        managePage.classList.add(
            "hidden"
        );

    }


    renderInterestCards();

}


// ==========================================================
// INITIALISE
// ==========================================================

async function initialise() {

    console.log(
        "========================================"
    );

    console.log(
        "Feature 7 initialising..."
    );

    console.log(
        "========================================"
    );


    // ------------------------------------------------------
    // STEP 1
    // Check authentication
    // ------------------------------------------------------

    await checkLoggedInUser();


    // ------------------------------------------------------
    // STEP 2
    // Load categories
    // ------------------------------------------------------

    const categoriesLoaded =
        await loadCategories();


    if (!categoriesLoaded) {

        console.error(
            "Feature 7 could not load categories."
        );

        return;
    }


    // ------------------------------------------------------
    // STEP 3
    // Load preferences
    // ------------------------------------------------------

    await loadUserPreferences();


    // ------------------------------------------------------
    // STEP 4
    // Render all UI components
    // ------------------------------------------------------

    renderInterestCards();

    renderPreferenceList();

    renderSelectedInterestTags();

    populateInterestSelect();


    // ------------------------------------------------------
    // STEP 5
    // Decide which page to show
    // ------------------------------------------------------

    if (
        currentUser &&
        selectedInterests.length > 0
    ) {

        /*
         * Logged in + existing preferences
         *
         * Show Manage Preferences
         */

        showManagePage();

    } else {

        /*
         * Not logged in OR no preferences yet
         *
         * Show Choose Your Interests
         */

        showSetupPage();

    }


    console.log(
        "========================================"
    );

    console.log(
        "Feature 7 initialisation complete."
    );

    console.log(
        "========================================"
    );

}


// ==========================================================
// START FEATURE 7
// ==========================================================

initialise();