import {
    getArticleById,
    getTrendingArticles,
    recordArticleView
} from "../../services/feature5Service.js";

import {
    formatCount,
    formatRelativeTime,
    escapeHtml
} from "./format.js";

import {
    supabase
} from "../../config/supabaseClient.js";


// ==========================================================
// GET ARTICLE ID
// ==========================================================

const params =
    new URLSearchParams(
        window.location.search
    );

const articleId =
    params.get("id");


// ==========================================================
// CURRENT USER
// ==========================================================

let currentUser = null;


// ==========================================================
// GET CURRENT USER
// ==========================================================

async function getCurrentUser() {

    try {

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


    } catch (error) {

        console.error(
            "Authentication check failed:",
            error
        );

        return null;
    }
}


// ==========================================================
// CHECK WHETHER ARTICLE IS ALREADY BOOKMARKED
// ==========================================================

async function checkBookmark(
    articleId,
    userId
) {

    if (!userId) {

        return false;
    }


    try {

        const {
            data,
            error
        } = await supabase
            .from("bookmarks")
            .select("article_id")
            .eq(
                "user_id",
                userId
            )
            .eq(
                "article_id",
                articleId
            )
            .maybeSingle();


        if (error) {

            console.error(
                "Error checking bookmark:",
                error
            );

            return false;
        }


        return !!data;


    } catch (error) {

        console.error(
            "Unexpected bookmark check error:",
            error
        );

        return false;
    }
}


// ==========================================================
// SAVE BOOKMARK
// ==========================================================

async function saveBookmark(
    articleId,
    userId
) {

    if (!userId) {

        return {
            success: false,
            message: "Please log in to bookmark articles."
        };
    }


    try {

        const {
            error
        } = await supabase
            .from("bookmarks")
            .insert({
                user_id: userId,
                article_id: Number(articleId)
            });


        if (error) {

            console.error(
                "Error saving bookmark:",
                error
            );


            // Duplicate bookmark

            if (
                error.code === "23505"
            ) {

                return {
                    success: false,
                    message: "This article is already bookmarked."
                };

            }


            return {
                success: false,
                message: "Unable to bookmark this article."
            };
        }


        return {
            success: true,
            message: "Article bookmarked successfully."
        };


    } catch (error) {

        console.error(
            "Unexpected bookmark error:",
            error
        );


        return {
            success: false,
            message: "An unexpected error occurred."
        };
    }
}


// ==========================================================
// REMOVE BOOKMARK
// ==========================================================

async function removeBookmark(
    articleId,
    userId
) {

    if (!userId) {

        return false;
    }


    try {

        const {
            error
        } = await supabase
            .from("bookmarks")
            .delete()
            .eq(
                "user_id",
                userId
            )
            .eq(
                "article_id",
                Number(articleId)
            );


        if (error) {

            console.error(
                "Error removing bookmark:",
                error
            );

            return false;
        }


        return true;


    } catch (error) {

        console.error(
            "Unexpected remove bookmark error:",
            error
        );

        return false;
    }
}


// ==========================================================
// CREATE BOOKMARK CONFIRMATION MODAL
// ==========================================================

function showBookmarkModal(
    onConfirm
) {

    // Remove existing modal if one exists

    const existingModal =
        document.getElementById(
            "bookmark-modal"
        );

    if (existingModal) {

        existingModal.remove();

    }


    const modal =
        document.createElement("div");


    modal.id =
        "bookmark-modal";


    modal.className =
        "bookmark-modal";


    modal.innerHTML = `

        <div class="bookmark-modal__overlay"></div>

        <div
            class="bookmark-modal__content"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bookmark-modal-title"
        >

            <h2 id="bookmark-modal-title">
                Bookmark Article
            </h2>

            <p>
                Are you sure you want to bookmark
                this article?
            </p>

            <div class="bookmark-modal__actions">

                <button
                    type="button"
                    class="bookmark-modal__button bookmark-modal__button--cancel"
                    id="bookmark-no"
                >
                    No
                </button>

                <button
                    type="button"
                    class="bookmark-modal__button bookmark-modal__button--confirm"
                    id="bookmark-yes"
                >
                    Yes
                </button>

            </div>

        </div>
    `;


    document.body.appendChild(
        modal
    );


    const closeModal =
        () => {

            modal.remove();

        };


    document
        .getElementById("bookmark-no")
        .addEventListener(
            "click",
            closeModal
        );


    document
        .querySelector(
            ".bookmark-modal__overlay"
        )
        .addEventListener(
            "click",
            closeModal
        );


    document
        .getElementById("bookmark-yes")
        .addEventListener(
            "click",
            async () => {

                await onConfirm();

                closeModal();

            }
        );

}


// ==========================================================
// SHOW TOAST MESSAGE
// ==========================================================

function showBookmarkMessage(
    message,
    isError = false
) {

    const existing =
        document.getElementById(
            "bookmark-message"
        );

    if (existing) {

        existing.remove();

    }


    const messageBox =
        document.createElement("div");


    messageBox.id =
        "bookmark-message";


    messageBox.className =
        "bookmark-message";


    if (isError) {

        messageBox.classList.add(
            "bookmark-message--error"
        );

    }


    messageBox.textContent =
        message;


    document.body.appendChild(
        messageBox
    );


    setTimeout(
        () => {

            messageBox.classList.add(
                "bookmark-message--hide"
            );


            setTimeout(
                () => {

                    messageBox.remove();

                },
                250
            );

        },
        2500
    );

}


// ==========================================================
// UPDATE BOOKMARK BUTTON
// ==========================================================

function updateBookmarkButton(
    isBookmarked
) {

    const button =
        document.getElementById(
            "bookmark-btn"
        );


    if (!button) {

        return;
    }


    if (isBookmarked) {

        button.textContent =
            "🔖 Bookmarked";

        button.classList.add(
            "is-bookmarked"
        );

        button.title =
            "Remove bookmark";


    } else {

        button.textContent =
            "🔖 Bookmark";

        button.classList.remove(
            "is-bookmarked"
        );

        button.title =
            "Bookmark this article";

    }

}


// ==========================================================
// SETUP BOOKMARK BUTTON
// ==========================================================

async function setupBookmarkButton(
    articleId
) {

    const button =
        document.getElementById(
            "bookmark-btn"
        );


    if (!button) {

        return;
    }


    // Check login status

    currentUser =
        await getCurrentUser();


    // Guest user

    if (!currentUser) {

        button.addEventListener(
            "click",
            () => {

                showBookmarkMessage(
                    "Please log in to bookmark articles.",
                    true
                );

            }
        );

        return;
    }


    // Check existing bookmark

    let isBookmarked =
        await checkBookmark(
            articleId,
            currentUser.id
        );


    updateBookmarkButton(
        isBookmarked
    );


    // Handle click

    button.addEventListener(
        "click",
        () => {

            // Already bookmarked
            // Ask whether to remove it

            if (isBookmarked) {

                showBookmarkModal(
                    async () => {

                        const removed =
                            await removeBookmark(
                                articleId,
                                currentUser.id
                            );


                        if (!removed) {

                            showBookmarkMessage(
                                "Unable to remove bookmark.",
                                true
                            );

                            return;
                        }


                        isBookmarked =
                            false;


                        updateBookmarkButton(
                            false
                        );


                        showBookmarkMessage(
                            "Bookmark removed."
                        );

                    }
                );


                return;
            }


            // Not bookmarked
            // Ask whether to save it

            showBookmarkModal(
                async () => {

                    const result =
                        await saveBookmark(
                            articleId,
                            currentUser.id
                        );


                    if (!result.success) {

                        showBookmarkMessage(
                            result.message,
                            true
                        );

                        return;
                    }


                    isBookmarked =
                        true;


                    updateBookmarkButton(
                        true
                    );


                    showBookmarkMessage(
                        "Article bookmarked successfully."
                    );

                }
            );

        }
    );

}


// ==========================================================
// RENDER TRENDING RAIL
// ==========================================================

function renderRail(
    articles,
    currentId
) {

    const rail =
        document.querySelector(
            ".rail-list"
        );


    if (!rail) {

        return;
    }


    const others =
        articles
            .filter(
                (a) =>
                    String(a.id) !==
                    String(currentId)
            )
            .slice(0, 4);


    if (
        others.length === 0
    ) {

        rail.innerHTML =
            '<p class="state-message">No other trending articles right now.</p>';

        return;
    }


    rail.innerHTML =
        others
            .map(
                (a) => {

                    const thumb =
                        a.featured_image_url

                            ? `
                                <img
                                    src="${escapeHtml(a.featured_image_url)}"
                                    alt=""
                                />
                              `

                            : "🖼";


                    return `

                        <a
                            class="rail-item"
                            href="article.html?id=${a.id}"
                        >

                            <div class="thumb">
                                ${thumb}
                            </div>

                            <div>

                                <p class="rail-item__title">
                                    ${escapeHtml(a.title)}
                                </p>

                                <span class="meta-row">

                                    <span>
                                        ${formatRelativeTime(
                                            a.published_at
                                        )}
                                    </span>

                                    <span>
                                        👁
                                        ${formatCount(
                                            a.view_count
                                        )}
                                    </span>

                                </span>

                            </div>

                        </a>

                    `;

                }
            )
            .join("");

}


// ==========================================================
// RENDER ARTICLE
// ==========================================================

function renderArticle(
    article
) {

    const slot =
        document.getElementById(
            "article-slot"
        );


    const thumb =
        article.featured_image_url

            ? `
                <img
                    src="${escapeHtml(
                        article.featured_image_url
                    )}"
                    alt=""
                />
              `

            : "🖼";


    const authorName =
        article.author?.display_name ??
        "Staff Writer";


    slot.innerHTML = `

        <div class="article-layout">


            <article class="article-panel">


                <!-- CATEGORY -->

                <span class="badge">
                    ${escapeHtml(
                        article.category?.name ?? ""
                    )}
                </span>


                <!-- TITLE -->

                <h1 class="article-panel__title">

                    ${escapeHtml(
                        article.title
                    )}

                </h1>


                <!-- BYLINE -->

                <div class="article-panel__byline">

                    <span>
                        👤 By
                        ${escapeHtml(
                            authorName
                        )}
                    </span>

                    <span>
                        ${formatRelativeTime(
                            article.published_at
                        )}
                    </span>

                    <span>
                        👁
                        ${formatCount(
                            article.view_count
                        )}
                        views
                    </span>

                </div>


                <!-- IMAGE -->

                <div class="thumb">

                    ${thumb}

                </div>


                <!-- ARTICLE CONTENT -->

                <div class="article-panel__body">

                    ${escapeHtml(
                        article.content
                    )}

                </div>


                <!-- ARTICLE ACTIONS -->

                <div class="article-actions">


                    <!-- EXISTING LIKE BUTTON -->

                    <button
                        class="article-action"
                        title="Coming soon"
                    >
                        ♡ Like
                        (${formatCount(
                            article.reaction_count
                        )})
                    </button>


                    <!-- EXISTING COMMENT BUTTON -->

                    <button
                        class="article-action"
                        title="Coming soon"
                    >
                        💬 Comment
                    </button>


                    <!-- FEATURE 3 BOOKMARK -->

                    <button
                        class="article-action"
                        id="bookmark-btn"
                        type="button"
                        title="Bookmark this article"
                    >
                        🔖 Bookmark
                    </button>


                    <!-- EXISTING SHARE BUTTON -->

                    <button
                        class="article-action is-live"
                        id="share-btn"
                        type="button"
                    >
                        ↗ Share
                    </button>


                </div>


            </article>


            <!-- TRENDING RAIL -->

            <aside>

                <p class="rail-title">
                    More Trending
                </p>


                <div class="rail-list">

                    <p class="state-message">
                        Loading…
                    </p>

                </div>

            </aside>


        </div>

    `;


    // ======================================================
    // SHARE BUTTON
    // ======================================================

    document
        .getElementById("share-btn")
        .addEventListener(
            "click",
            async (e) => {

                try {

                    await navigator
                        .clipboard
                        .writeText(
                            window.location.href
                        );


                    e.target.textContent =
                        "✓ Link copied";


                    setTimeout(
                        () => {

                            e.target.textContent =
                                "↗ Share";

                        },
                        2000
                    );


                } catch {

                    /* Clipboard unavailable */

                }

            }
        );


    // ======================================================
    // BOOKMARK BUTTON
    // ======================================================

    setupBookmarkButton(
        articleId
    );

}


// ==========================================================
// INITIALISE ARTICLE
// ==========================================================

async function init() {


    // ------------------------------------------------------
    // Check article ID
    // ------------------------------------------------------

    if (!articleId) {

        document
            .getElementById(
                "article-slot"
            )
            .innerHTML =
                `
                    <p class="state-message is-error">
                        No article was specified.
                    </p>
                `;

        return;
    }


    // ------------------------------------------------------
    // Record article view
    // ------------------------------------------------------

    try {

        await recordArticleView(
            articleId
        );

    } catch {

        /*
         * View tracking is best-effort.
         * It should not stop the user
         * from reading the article.
         */

    }


    // ------------------------------------------------------
    // Load article
    // ------------------------------------------------------

    try {

        const article =
            await getArticleById(
                articleId
            );


        renderArticle(
            article
        );


        // --------------------------------------------------
        // Load trending articles
        // --------------------------------------------------

        try {

            const trending =
                await getTrendingArticles(
                    6
                );


            renderRail(
                trending,
                articleId
            );


        } catch {

            renderRail(
                [],
                articleId
            );

        }


    } catch (err) {

        document
            .getElementById(
                "article-slot"
            )
            .innerHTML =
                `
                    <p class="state-message is-error">

                        This article is unavailable:
                        ${escapeHtml(
                            err.message
                        )}

                    </p>
                `;

    }

}


// ==========================================================
// START
// ==========================================================

init();