import { supabase } from "../../config/supabaseClient.js";
// ==========================================================
// FEATURE 7
// USER PREFERENCE AND INTEREST MANAGEMENT
// ==========================================================


// ==========================================================
// CATEGORY DATA
// ==========================================================

const categories = [
    {
        id: "technology",
        name: "Technology",
        icon: "▣"
    },
    {
        id: "business",
        name: "Business",
        icon: "▥"
    },
    {
        id: "sports",
        name: "Sports",
        icon: "⚝"
    },
    {
        id: "politics",
        name: "Politics",
        icon: "▤"
    },
    {
        id: "entertainment",
        name: "Entertainment",
        icon: "▷"
    },
    {
        id: "science",
        name: "Science",
        icon: "♧"
    },
    {
        id: "health",
        name: "Health",
        icon: "♡"
    },
    {
        id: "lifestyle",
        name: "Lifestyle",
        icon: "✎"
    },
    {
        id: "environment",
        name: "Environment",
        icon: "♧"
    }
];


// ==========================================================
// DEFAULT SELECTED INTERESTS
// Matches your Whimsical design
// ==========================================================

let selectedInterests = [
    "technology",
    "business",
    "sports"
];


// Used when editing preferences

let originalInterests = [
    ...selectedInterests
];


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
// CREATE INTEREST CARDS
// ==========================================================

function renderInterestCards() {

    interestGrid.innerHTML = "";


    categories.forEach(category => {

        const card =
            document.createElement("div");


        card.className =
            "interest-card";


        if (
            selectedInterests.includes(category.id)
        ) {

            card.classList.add("selected");

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


        interestGrid.appendChild(card);

    });

}


// ==========================================================
// TOGGLE INTEREST
// ==========================================================

function toggleInterest(categoryId) {

    const index =
        selectedInterests.indexOf(categoryId);


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
// RENDER PREFERENCE CHECKBOXES
// ==========================================================

function renderPreferenceList() {

    preferenceList.innerHTML = "";


    categories.forEach(category => {

        const label =
            document.createElement("label");


        label.className =
            "preference-item";


        const checked =
            selectedInterests.includes(
                category.id
            );


        label.innerHTML = `

            <input
                type="checkbox"
                value="${category.id}"
                ${checked ? "checked" : ""}
            >

            <span>
                ${category.icon}
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

                if (event.target.checked) {

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
                                id !== category.id
                        );

                }

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

    selectedInterestsContainer.innerHTML = "";


    if (selectedInterests.length === 0) {

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
                        item.id === categoryId
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
                                id !== category.id
                        );


                    renderSelectedInterestTags();

                    renderPreferenceList();

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


    categories.forEach(category => {

        if (
            !selectedInterests.includes(
                category.id
            )
        ) {

            const option =
                document.createElement("option");


            option.value =
                category.id;


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

addInterestButton.addEventListener(
    "click",
    () => {

        const categoryId =
            interestSelect.value;


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
    () => {

        if (
            selectedInterests.length === 0
        ) {

            alert(
                "Please select at least one interest."
            );

            return;

        }


        localStorage.setItem(
            "newsPreferences",
            JSON.stringify(
                selectedInterests
            )
        );


        originalInterests =
            [...selectedInterests];


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

        showManagePage();

    }
);


// ==========================================================
// SAVE MANAGED PREFERENCES
// ==========================================================

manageSaveButton.addEventListener(
    "click",
    () => {

        saveCurrentPreferences();

        showSuccessMessage();

    }
);


// ==========================================================
// SAVE CHANGES
// ==========================================================

saveChangesButton.addEventListener(
    "click",
    () => {

        saveCurrentPreferences();

        showSuccessMessage();

    }
);


// ==========================================================
// SAVE TO LOCAL STORAGE
// ==========================================================

function saveCurrentPreferences() {

    localStorage.setItem(
        "newsPreferences",
        JSON.stringify(
            selectedInterests
        )
    );


    originalInterests =
        [...selectedInterests];

}


// ==========================================================
// CANCEL
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
// LOAD SAVED PREFERENCES
// ==========================================================

function loadPreferences() {

    const saved =
        localStorage.getItem(
            "newsPreferences"
        );


    if (saved) {

        try {

            selectedInterests =
                JSON.parse(saved);

            originalInterests =
                [...selectedInterests];

        } catch (error) {

            console.error(
                "Unable to load preferences:",
                error
            );

        }

    }

}


// ==========================================================
// INITIALISE
// ==========================================================

function initialise() {

    loadPreferences();

    renderInterestCards();

}


initialise();