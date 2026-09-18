import {
    supabase
} from "../../config/supabaseClient.js";

import {
    getArticleById
} from "../../services/feature5Service.js";

import {
    formatCount,
    formatRelativeTime,
    escapeHtml
} from "./format.js";


// ==========================================================
// DOM ELEMENTS
// ==========================================================

const loadingElement =
    document.getElementById(
        "bookmark-loading"
    );

const errorElement =
    document.getElementById(
        "bookmark-error"
    );

const emptyElement =
    document.getElementById(
        "bookmark-empty"
    );

const gridElement =
    document.getElementById(
        "bookmark-grid"
    );


// ==========================================================
// GET CURRENT USER
// ==========================================================

async function getCurrentUser() {

    const {
        data,
        error
    } = await supabase.auth.getUser();


    if (error) {

        console.error(
            "Error getting current user:",
            error
        );

        return null;
    }


    return data?.user ?? null;

}


// ==========================================================
// UPDATE USER LABEL
// ==========================================================

async function updateUserLabel(
    user
) {

    const label =
        document.getElementById(
            "user-label"
        );

    const chip =
        document.getElementById(
            "user-chip"
        );


    if (!label) {

        return;
    }


    if (user) {

        label.textContent =
            user.email ?? "Account";


        if (chip) {

            chip.href = "#";

        }

    } else {

        label.textContent =
            "Guest";

    }

}


// ==========================================================
// SHOW ERROR
// ==========================================================

function showError(
    message
) {

    loadingElement.classList.add(
        "hidden"
    );

    emptyElement.classList.add(
        "hidden"
    );

    gridElement.innerHTML = "";


    errorElement.textContent =
        message;


    errorElement.classList.remove(
        "hidden"
    );

}


// ==========================================================
// SHOW EMPTY STATE
// ==========================================================

function showEmpty() {

    loadingElement.classList.add(
        "hidden"
    );

    errorElement.classList.add(
        "hidden"
    );

    gridElement.innerHTML = "";


    emptyElement.classList.remove(
        "hidden"
    );

}


// ==========================================================
// LOAD USER BOOKMARKS
// ==========================================================

async function loadBookmarks(
    userId
) {

    const {
        data,
        error
    } = await supabase

        .from("bookmarks")

        .select(
            "article_id, created_at"
        )

        .eq(
            "user_id",
            userId
        )

        .order(
            "created_at",
            {
                ascending: false
            }
        );


    if (error) {

        console.error(
            "Error loading bookmarks:",
            error
        );


        showError(
            "Unable to load your bookmarks."
        );


        return;
    }


    if (
        !data ||
        data.length === 0
    ) {

        showEmpty();

        return;
    }


    // ======================================================
    // GET ARTICLE INFORMATION
    // ======================================================

    const articles = [];


    for (
        const bookmark of data
    ) {

        try {

            const article =
                await getArticleById(
                    bookmark.article_id
                );


            if (article) {

                articles.push({

                    ...article,

                    bookmarked_at:
                        bookmark.created_at

                });

            }


        } catch (error) {

            console.error(
                "Could not load article:",
                bookmark.article_id,
                error
            );

        }

    }


    if (
        articles.length === 0
    ) {

        showEmpty();

        return;
    }


    loadingElement.classList.add(
        "hidden"
    );

    emptyElement.classList.add(
        "hidden"
    );

    errorElement.classList.add(
        "hidden"
    );


    renderBookmarks(
        articles
    );

}


// ==========================================================
// IMAGE HTML
// ==========================================================

function getImageHtml(
    article
) {

    if (
        article.featured_image_url
    ) {

        return `
            <img
                src="${escapeHtml(
                    article.featured_image_url
                )}"
                alt=""
            >
        `;

    }


    return `
        <div class="bookmark-card__placeholder">

            <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
                stroke-linejoin="round"
            >

                <rect
                    x="3"
                    y="3"
                    width="18"
                    height="18"
                    rx="2"
                />

                <circle
                    cx="8.5"
                    cy="8.5"
                    r="1.5"
                />

                <path
                    d="m21 15-5-5L5 21"
                />

            </svg>

        </div>
    `;

}


// ==========================================================
// RENDER BOOKMARK CARDS
// ==========================================================

function renderBookmarks(
    articles
) {

    gridElement.innerHTML =
        articles
            .map(
                article => {

                    const category =
                        article.category?.name ??
                        "News";


                    const publishedTime =
                        formatRelativeTime(
                            article.published_at
                        );


                    const views =
                        formatCount(
                            article.view_count
                        );


                    const reactions =
                        formatCount(
                            article.reaction_count
                        );


                    return `

                        <article
                            class="bookmark-card"
                        >


                            <!-- IMAGE -->

                            <a
                                href="article.html?id=${article.id}"
                                class="bookmark-card__image"
                            >

                                ${getImageHtml(
                                    article
                                )}

                            </a>


                            <!-- CARD CONTENT -->

                            <div
                                class="bookmark-card__body"
                            >


                                <!-- CATEGORY -->

                                <span class="badge">

                                    ${escapeHtml(
                                        category
                                    )}

                                </span>


                                <!-- TITLE -->

                                <h2
                                    class="bookmark-card__title"
                                >

                                    <a
                                        href="article.html?id=${article.id}"
                                    >

                                        ${escapeHtml(
                                            article.title
                                        )}

                                    </a>

                                </h2>


                                <!-- METADATA -->

                                <div
                                    class="bookmark-card__meta"
                                >

                                    <span>
                                        ${publishedTime}
                                    </span>


                                    <span>
                                        👁 ${views}
                                    </span>


                                    <span>
                                        ♡ ${reactions}
                                    </span>

                                </div>


                            </div>

                        </article>

                    `;

                }
            )
            .join("");

}


// ==========================================================
// INITIALISE
// ==========================================================

async function init() {

    try {

        const user =
            await getCurrentUser();


        // Update top-right user name

        await updateUserLabel(
            user
        );


        // --------------------------------------------------
        // User not logged in
        // --------------------------------------------------

        if (!user) {

            showError(
                "Please log in to view your bookmarks."
            );

            return;
        }


        // --------------------------------------------------
        // Load bookmarks
        // --------------------------------------------------

        await loadBookmarks(
            user.id
        );


    } catch (error) {

        console.error(
            "Bookmark page error:",
            error
        );


        showError(
            "Something went wrong while loading your bookmarks."
        );

    }

}


// ==========================================================
// START
// ==========================================================

init();