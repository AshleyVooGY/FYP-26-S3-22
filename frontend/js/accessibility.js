/* ==========================================================
   FEATURE 9 - NEWS READING ACCESSIBILITY MANAGEMEN
========================================================== */

const STORAGE_KEY = "newsReleaseReadingPreferences";

const DEFAULT_PREFERENCES = {
    fontSize: 100,
    theme: "dark"
};

const MIN_FONT_SIZE = 80;
const MAX_FONT_SIZE = 150;
const FONT_SIZE_STEP = 10;

// Share each toolbar's current state with the cross-tab storage listener.
const articlePreferenceStates = new WeakMap();


/* ==========================================================
   1. LOAD SAVED PREFERENCES
========================================================== */

export function loadReadingPreferences() {
    try {
        const saved = JSON.parse(
            localStorage.getItem(STORAGE_KEY) || "{}"
        );

        const fontSize = Number(saved.fontSize);

        return {
            fontSize: Number.isFinite(fontSize)
                ? Math.min(
                    MAX_FONT_SIZE,
                    Math.max(MIN_FONT_SIZE, fontSize)
                )
                : DEFAULT_PREFERENCES.fontSize,

            theme: saved.theme === "light"
                ? "light"
                : "dark"
        };

    } catch (error) {
        console.error(
            "Unable to load reading preferences:",
            error
        );

        return { ...DEFAULT_PREFERENCES };
    }
}


/* ==========================================================
   2. SAVE PREFERENCES
========================================================== */

export function saveReadingPreferences(preferences) {
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(preferences)
        );

    } catch (error) {
        console.error(
            "Unable to save reading preferences:",
            error
        );
    }
}


/* ==========================================================
   3. APPLY GLOBAL LIGHT / DARK THEME
========================================================== */

export function applyGlobalTheme(theme) {
    const selectedTheme = theme === "light"
        ? "light"
        : "dark";

    // Apply theme to the entire HTML document
    document.documentElement.dataset.readingTheme =
        selectedTheme;

    // Apply theme to the body
    document.body.dataset.readingTheme =
        selectedTheme;

    // Update browser colour scheme where supported
    document.documentElement.style.colorScheme =
        selectedTheme;
}


/* ==========================================================
   4. INITIALISE GLOBAL THEME
========================================================== */

export function initializeGlobalTheme() {
    const preferences = loadReadingPreferences();

    applyGlobalTheme(preferences.theme);
}


/* ==========================================================
   5. APPLY ARTICLE ACCESSIBILITY PREFERENCES
========================================================== */

function applyReadingPreferences(
    articlePanel,
    articleBody,
    preferences
) {
    if (!articlePanel || !articleBody) return;

    // Apply theme globally
    applyGlobalTheme(preferences.theme);

    // Also apply theme to the article panel
    articlePanel.dataset.readingTheme =
        preferences.theme;

    // Apply article text size
    articleBody.style.setProperty(
        "--article-reading-font-size",
        `${preferences.fontSize}%`
    );

    // Update text size display
    const sizeLabel = articlePanel.querySelector(
        "#reading-size-value"
    );

    if (sizeLabel) {
        sizeLabel.textContent =
            `${preferences.fontSize}%`;
    }

    // Update selected theme buttons
    const themeButtons = articlePanel.querySelectorAll(
        ".reading-accessibility [data-reading-theme]"
    );

    themeButtons.forEach(button => {
        const selected =
            button.dataset.readingTheme === preferences.theme;

        button.classList.toggle(
            "is-selected",
            selected
        );

        button.setAttribute(
            "aria-pressed",
            String(selected)
        );
    });

    // Disable decrease button at minimum size
    const decreaseButton = articlePanel.querySelector(
        "#reading-size-decrease"
    );

    if (decreaseButton) {
        decreaseButton.disabled =
            preferences.fontSize <= MIN_FONT_SIZE;
    }

    // Disable increase button at maximum size
    const increaseButton = articlePanel.querySelector(
        "#reading-size-increase"
    );

    if (increaseButton) {
        increaseButton.disabled =
            preferences.fontSize >= MAX_FONT_SIZE;
    }
}


/* ==========================================================
   6. SET UP ACCESSIBILITY CONTROLS
========================================================== */

export function setupReadingAccessibility(
    articlePanel,
    articleBody
) {
    if (!articlePanel || !articleBody) {
        console.warn(
            "Reading accessibility could not initialise: article elements not found."
        );
        return;
    }

    // Prevent duplicate toolbar
    if (
        articlePanel.querySelector(".reading-accessibility")
    ) {
        return;
    }

    // Load previously saved preferences
    const preferences = loadReadingPreferences();
    articlePreferenceStates.set(articlePanel, preferences);

    // Create accessibility toolbar
    const toolbar = document.createElement("section");

    toolbar.className = "reading-accessibility";

    toolbar.setAttribute(
        "aria-label",
        "Reading accessibility settings"
    );

    toolbar.innerHTML = `
        <div class="reading-accessibility__group">

            <span class="reading-accessibility__label">
                Text Size
            </span>

            <div class="reading-accessibility__controls">

                <button
                    type="button"
                    id="reading-size-decrease"
                    class="reading-accessibility__button"
                    aria-label="Decrease text size"
                >
                    A−
                </button>

                <span
                    id="reading-size-value"
                    class="reading-accessibility__value"
                    aria-live="polite"
                >
                    100%
                </span>

                <button
                    type="button"
                    id="reading-size-increase"
                    class="reading-accessibility__button"
                    aria-label="Increase text size"
                >
                    A+
                </button>

            </div>
        </div>


        <div class="reading-accessibility__group">

            <span class="reading-accessibility__label">
                Reading Mode
            </span>

            <div
                class="reading-accessibility__controls"
                role="group"
                aria-label="Choose reading mode"
            >

                <button
                    type="button"
                    class="reading-accessibility__button"
                    data-reading-theme="light"
                    aria-pressed="false"
                >
                    ☀ Light
                </button>

                <button
                    type="button"
                    class="reading-accessibility__button"
                    data-reading-theme="dark"
                    aria-pressed="false"
                >
                    ☾ Dark
                </button>

            </div>
        </div>

        <span class="reading-accessibility__saved">
            Preferences are saved automatically
        </span>
    `;


    /* ======================================================
       INSERT TOOLBAR BEFORE ARTICLE CONTENT
    ====================================================== */

    articleBody.parentNode.insertBefore(
        toolbar,
        articleBody
    );


    /* ======================================================
       GET BUTTON ELEMENTS
    ====================================================== */

    const decreaseButton = toolbar.querySelector(
        "#reading-size-decrease"
    );

    const increaseButton = toolbar.querySelector(
        "#reading-size-increase"
    );

    const lightButton = toolbar.querySelector(
        '[data-reading-theme="light"]'
    );

    const darkButton = toolbar.querySelector(
        '[data-reading-theme="dark"]'
    );


    /* ======================================================
       DECREASE TEXT SIZE
    ====================================================== */

    decreaseButton.addEventListener("click", () => {

        preferences.fontSize = Math.max(
            MIN_FONT_SIZE,
            preferences.fontSize - FONT_SIZE_STEP
        );

        saveReadingPreferences(preferences);

        applyReadingPreferences(
            articlePanel,
            articleBody,
            preferences
        );
    });


    /* ======================================================
       INCREASE TEXT SIZE
    ====================================================== */

    increaseButton.addEventListener("click", () => {

        preferences.fontSize = Math.min(
            MAX_FONT_SIZE,
            preferences.fontSize + FONT_SIZE_STEP
        );

        saveReadingPreferences(preferences);

        applyReadingPreferences(
            articlePanel,
            articleBody,
            preferences
        );
    });


    /* ======================================================
       SWITCH TO LIGHT MODE
    ====================================================== */

    lightButton.addEventListener("click", () => {

        preferences.theme = "light";

        saveReadingPreferences(preferences);

        applyReadingPreferences(
            articlePanel,
            articleBody,
            preferences
        );
    });


    /* ======================================================
       SWITCH TO DARK MODE
    ====================================================== */

    darkButton.addEventListener("click", () => {

        preferences.theme = "dark";

        saveReadingPreferences(preferences);

        applyReadingPreferences(
            articlePanel,
            articleBody,
            preferences
        );
    });


    /* ======================================================
       RESTORE PREVIOUSLY SAVED PREFERENCES
    ====================================================== */

    applyReadingPreferences(
        articlePanel,
        articleBody,
        preferences
    );
}


/* ==========================================================
   7. SYNCHRONISE THEME BETWEEN BROWSER TABS
========================================================== */

window.addEventListener("storage", event => {

    if (event.key !== STORAGE_KEY) return;

    const preferences = loadReadingPreferences();

    // Update global page theme
    applyGlobalTheme(preferences.theme);

    // Update article panel if this is an article page
    const articlePanel = document.querySelector(
        ".article-panel"
    );

    const articleBody = document.querySelector(
        ".article-panel__body"
    );

    if (articlePanel && articleBody) {
        const toolbarPreferences = articlePreferenceStates.get(articlePanel);
        if (toolbarPreferences) {
            Object.assign(toolbarPreferences, preferences);
        }
        applyReadingPreferences(
            articlePanel,
            articleBody,
            preferences
        );
    }
});
