import { supabase } from "../../config/supabaseClient.js";

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

async function getCurrentUser() {

    const {
        data,
        error
    } = await supabase.auth.getUser();


    if (error) {

        console.error(
            "Unable to get current user:",
            error
        );

        return null;

    }


    return data?.user ?? null;

}


// ==========================================================
// LOAD CATEGORIES
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

        throw error;

    }


    categories =
        (data || []).map(
            category => ({

                id:
                    category.id,

                name:
                    category.name,

                icon:
                    categoryIcons[
                        category.name
                    ] ??
                    "<span>●</span>"

            })
        );

}


// ==========================================================
// LOAD USER PREFERENCES
// ==========================================================

async function loadUserPreferences() {

    if (!currentUser) {

        return [];

    }


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
            "Unable to load user preferences:",
            error
        );

        throw error;

    }


    return (
        data || []
    ).map(
        row =>
            Number(
                row.category_id
            )
    );

}


// ==========================================================
// RENDER INTEREST CARDS
// ==========================================================

function renderInterestCards() {

    if (!interestGrid) {

        return;

    }


    if (categories.length === 0) {

        interestGrid.innerHTML = `

            <p class="state-message">
                No categories available.
            </p>

        `;

        return;

    }


    interestGrid.innerHTML =
        categories
            .map(
                category => {

                    const selected =
                        selectedInterests.includes(
                            category.id
                        );


                    return `

                        <div
                            class="interest-card
                            ${selected ? "selected" : ""}"
                            data-category-id="${category.id}"
                        >

                            <div class="check-box">
                                ${selected ? "✓" : ""}
                            </div>


                            <div class="category-icon">
                                ${category.icon}
                            </div>


                            <div class="category-name">
                                ${escapeHtml(
                                    category.name
                                )}
                            </div>

                        </div>

                    `;

                }
            )
            .join("");


    document
        .querySelectorAll(
            ".interest-card"
        )
        .forEach(
            card => {

                card.addEventListener(
                    "click",
                    () => {

                        toggleInterest(
                            Number(
                                card.dataset.categoryId
                            )
                        );

                    }
                );

            }
        );

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

        }
    );

}


// ==========================================================
// SAVE TO SUPABASE
// ==========================================================

async function saveCurrentPreferences() {

    if (!currentUser) {

        alert(
            "Please log in before saving your preferences."
        );

        return false;

    }


    if (
        selectedInterests.length === 0
    ) {

        alert(
            "Please select at least one interest."
        );

        return false;

    }


    // ------------------------------------------------------
    // Delete current preferences
    // ------------------------------------------------------

    const {
        error:
            deleteError
    } = await supabase
        .from("user_preferences")
        .delete()
        .eq(
            "user_id",
            currentUser.id
        );


    if (deleteError) {

        console.error(
            "Unable to remove old preferences:",
            deleteError
        );

        throw deleteError;

    }


    // ------------------------------------------------------
    // Prepare rows
    // ------------------------------------------------------

    const rows =
        selectedInterests.map(
            categoryId => ({

                user_id:
                    currentUser.id,

                category_id:
                    categoryId

            })
        );


    // ------------------------------------------------------
    // Insert new preferences
    // ------------------------------------------------------

    const {
        error:
            insertError
    } = await supabase
        .from("user_preferences")
        .insert(
            rows
        );


    if (insertError) {

        console.error(
            "Unable to save preferences:",
            insertError
        );

        throw insertError;

    }


    originalInterests =
        [...selectedInterests];


    return true;

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


                alert(
                    "Preferences saved successfully!"
                );


                showManagePage();

            } catch (error) {

                console.error(
                    error
                );


                alert(
                    "Unable to save preferences. Please try again."
                );

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


                showSuccessMessage();

            } catch (error) {

                console.error(
                    error
                );


                alert(
                    "Unable to save preferences. Please try again."
                );

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


            renderInterestCards();

            renderPreferenceList();

            renderSelectedInterestTags();

            populateInterestSelect();

        }
    );

}


// ==========================================================
// SUCCESS MESSAGE
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
        2500
    );

}


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

async function initialise() {

    try {

        // ----------------------------------------------------
        // Authentication
        // ----------------------------------------------------

        currentUser =
            await getCurrentUser();


        updateUserLabel();


        if (!currentUser) {

            alert(
                "Please log in before accessing your preferences."
            );


            window.location.href =
                "login.html";


            return;

        }


        console.log(
            "Logged-in user:",
            currentUser.id
        );


        // ----------------------------------------------------
        // Load categories
        // ----------------------------------------------------

        await loadCategories();


        // ----------------------------------------------------
        // Load saved preferences
        // ----------------------------------------------------

        selectedInterests =
            await loadUserPreferences();


        originalInterests =
            [...selectedInterests];


        // ----------------------------------------------------
        // Render
        // ----------------------------------------------------

        renderInterestCards();

        renderPreferenceList();

        renderSelectedInterestTags();

        populateInterestSelect();


        // ----------------------------------------------------
        // If user has preferences, show manage page
        // Otherwise show setup page
        // ----------------------------------------------------

        if (
            selectedInterests.length > 0
        ) {

            showManagePage();

        } else {

            if (setupPage) {

                setupPage.classList.remove(
                    "hidden"
                );

            }

            if (managePage) {

                managePage.classList.add(
                    "hidden"
                );

            }

        }


    } catch (error) {

        console.error(
            "Feature 7 initialisation failed:",
            error
        );


        if (interestGrid) {

            interestGrid.innerHTML = `

                <p class="state-message is-error">

                    Unable to load your preferences.

                    Please check your login and
                    Supabase connection.

                </p>

            `;

        }

    }

}


initialise();