import { supabase } from "../../config/supabaseClient.js";

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


/* ==========================================================
   GET ARTICLE ID FROM URL
========================================================== */

const params = new URLSearchParams(
    window.location.search
);

const articleId = params.get("id");


/* ==========================================================
   RENDER TRENDING RAIL
========================================================== */

function renderRail(articles, currentId) {

    const rail =
        document.querySelector(".rail-list");

    if (!rail) {
        return;
    }


    const others = articles
        .filter(
            article =>
                String(article.id) !==
                String(currentId)
        )
        .slice(0, 4);


    if (others.length === 0) {

        rail.innerHTML =
            '<p class="state-message">' +
            'No other trending articles right now.' +
            '</p>';

        return;
    }


    rail.innerHTML = others
        .map(article => {

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


            return `
                <a
                    class="rail-item"
                    href="article.html?id=${article.id}"
                >

                    <div class="thumb">
                        ${thumb}
                    </div>

                    <div>

                        <p class="rail-item__title">
                            ${escapeHtml(article.title)}
                        </p>

                        <span class="meta-row">

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
                            </span>

                        </span>

                    </div>

                </a>
            `;
        })
        .join("");
}


/* ==========================================================
   CHECK WHETHER ARTICLE IS ALREADY BOOKMARKED
========================================================== */

async function isArticleBookmarked(articleId) {

    const {
        data: {
            user
        }
    } = await supabase.auth.getUser();


    if (!user) {
        return false;
    }


    const {
        data,
        error
    } = await supabase
        .from("bookmarks")
        .select("article_id")
        .eq("user_id", user.id)
        .eq("article_id", articleId)
        .maybeSingle();


    if (error) {

        console.error(
            "Error checking bookmark:",
            error
        );

        return false;
    }


    return Boolean(data);
}


/* ==========================================================
   CREATE BOOKMARK CONFIRMATION MODAL
========================================================== */

function showBookmarkModal(
    articleId,
    bookmarkButton
) {

    /*
       Prevent multiple modals from being created.
    */

    const existingModal =
        document.querySelector(
            ".bookmark-modal"
        );


    if (existingModal) {
        return;
    }


    /* ------------------------------------------------------
       CREATE MODAL
    ------------------------------------------------------ */

    const modal =
        document.createElement("div");

    modal.className =
        "bookmark-modal";


    modal.innerHTML = `

        <div
            class="bookmark-modal__content"
        >

            <h2>
                Bookmark Article
            </h2>


            <p>
                Are you sure you want to
                bookmark this article?
            </p>


            <div
                class="bookmark-modal__actions"
            >

                <button
                    type="button"
                    class="bookmark-modal__cancel"
                >
                    No
                </button>


                <button
                    type="button"
                    class="bookmark-modal__confirm"
                >
                    Yes
                </button>

            </div>

        </div>

    `;


    document.body.appendChild(modal);


    /* ------------------------------------------------------
       NO BUTTON
    ------------------------------------------------------ */

    const cancelButton =
        modal.querySelector(
            ".bookmark-modal__cancel"
        );


    cancelButton.addEventListener(
        "click",
        () => {

            modal.remove();

        }
    );


    /* ------------------------------------------------------
       YES BUTTON
    ------------------------------------------------------ */

    const confirmButton =
        modal.querySelector(
            ".bookmark-modal__confirm"
        );


    confirmButton.addEventListener(
        "click",
        async () => {

            await saveBookmark(
                articleId,
                bookmarkButton,
                modal,
                confirmButton
            );

        }
    );


    /* ------------------------------------------------------
       CLICK OUTSIDE MODAL
    ------------------------------------------------------ */

    modal.addEventListener(
        "click",
        event => {

            if (
                event.target === modal
            ) {

                modal.remove();

            }

        }
    );


    /* ------------------------------------------------------
       ESCAPE KEY
    ------------------------------------------------------ */

    const escapeHandler =
        event => {

            if (
                event.key === "Escape"
            ) {

                modal.remove();

                document.removeEventListener(
                    "keydown",
                    escapeHandler
                );

            }

        };


    document.addEventListener(
        "keydown",
        escapeHandler
    );

}


/* ==========================================================
   SAVE BOOKMARK
========================================================== */

async function saveBookmark(
    articleId,
    bookmarkButton,
    modal,
    confirmButton
) {

    /* ------------------------------------------------------
       GET CURRENT USER
    ------------------------------------------------------ */

    const {
        data: {
            user
        }
    } = await supabase.auth.getUser();


    if (!user) {

        modal.remove();

        alert(
            "Please log in to bookmark an article."
        );

        window.location.href =
            "login.html";

        return;
    }


    /* ------------------------------------------------------
       CHECK AGAIN BEFORE INSERTING
    ------------------------------------------------------ */

    const alreadyBookmarked =
        await isArticleBookmarked(
            articleId
        );


    if (alreadyBookmarked) {

        modal.remove();

        bookmarkButton.textContent =
            "🔖 Bookmarked";

        bookmarkButton.classList.add(
            "is-bookmarked"
        );

        return;
    }


    /* ------------------------------------------------------
       DISABLE BUTTON WHILE SAVING
    ------------------------------------------------------ */

    confirmButton.disabled = true;

    confirmButton.textContent =
        "Saving...";


    /* ------------------------------------------------------
       INSERT BOOKMARK
    ------------------------------------------------------ */

    const {
        error
    } = await supabase
        .from("bookmarks")
        .insert({

            user_id: user.id,

            article_id: Number(
                articleId
            )

        });


    /* ------------------------------------------------------
       HANDLE ERROR
    ------------------------------------------------------ */

    if (error) {

        console.error(
            "Error saving bookmark:",
            error
        );


        confirmButton.disabled = false;

        confirmButton.textContent =
            "Yes";


        alert(
            "Unable to bookmark this article. Please try again."
        );

        return;
    }


    /* ------------------------------------------------------
       SUCCESS
    ------------------------------------------------------ */

    modal.remove();


    bookmarkButton.textContent =
        "🔖 Bookmarked";


    bookmarkButton.classList.add(
        "is-bookmarked"
    );


    bookmarkButton.title =
        "Article bookmarked";

}


/* ==========================================================
   SET UP BOOKMARK BUTTON
========================================================== */

async function setupBookmarkButton(
    articleId
) {

    const bookmarkButton =
        document.getElementById(
            "bookmark-btn"
        );


    if (!bookmarkButton) {
        return;
    }


    /* ------------------------------------------------------
       CHECK LOGIN STATUS
    ------------------------------------------------------ */

    const {
        data: {
            user
        }
    } = await supabase.auth.getUser();


    if (!user) {

        bookmarkButton.addEventListener(
            "click",
            () => {

                alert(
                    "Please log in to bookmark an article."
                );

                window.location.href =
                    "login.html";

            }
        );

        return;
    }


    /* ------------------------------------------------------
       CHECK EXISTING BOOKMARK
    ------------------------------------------------------ */

    const bookmarked =
        await isArticleBookmarked(
            articleId
        );


    if (bookmarked) {

        bookmarkButton.textContent =
            "🔖 Bookmarked";

        bookmarkButton.classList.add(
            "is-bookmarked"
        );

        bookmarkButton.title =
            "Article bookmarked";

    }


    /* ------------------------------------------------------
       CLICK EVENT
    ------------------------------------------------------ */

    bookmarkButton.addEventListener(
        "click",
        () => {

            /*
               If already bookmarked,
               don't create another bookmark.
            */

            if (
                bookmarkButton.classList.contains(
                    "is-bookmarked"
                )
            ) {

                return;

            }


            showBookmarkModal(
                articleId,
                bookmarkButton
            );

        }
    );

}


/* ==========================================================
   RENDER ARTICLE
========================================================== */

function renderArticle(article) {

    const slot =
        document.getElementById(
            "article-slot"
        );


    if (!slot) {
        return;
    }


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


    /* ------------------------------------------------------
       ARTICLE HTML
    ------------------------------------------------------ */

    slot.innerHTML = `

        <div class="article-layout">


            <!-- ==========================================
                 ARTICLE
            =========================================== -->

            <article
                class="article-panel"
            >


                <span class="badge">

                    ${escapeHtml(
                        article.category?.name ?? ""
                    )}

                </span>


                <h1
                    class="article-panel__title"
                >

                    ${escapeHtml(
                        article.title
                    )}

                </h1>


                <div
                    class="article-panel__byline"
                >

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


                <div class="thumb">

                    ${thumb}

                </div>


                <div
                    class="article-panel__body"
                >

                    ${escapeHtml(
                        article.content
                    )}

                </div>


                <!-- ======================================
                     ARTICLE ACTIONS
                ======================================= -->

                <div
                    class="article-actions"
                >


                    <!-- LIKE -->

                    <button
                        type="button"
                        class="article-action"
                        title="Coming soon"
                    >

                        ♡ Like
                        (${formatCount(
                            article.reaction_count
                        )})

                    </button>


                    <!-- COMMENT -->

                    <button
                        type="button"
                        class="article-action"
                        title="Coming soon"
                    >

                        💬 Comment

                    </button>


                    <!-- BOOKMARK -->

                    <button
                        type="button"
                        class="article-action is-live"
                        id="bookmark-btn"
                        title="Bookmark this article"
                    >

                        🔖 Bookmark

                    </button>


                    <!-- SHARE -->

                    <button
                        type="button"
                        class="article-action is-live"
                        id="share-btn"
                    >

                        ↗ Share

                    </button>


                </div>


            </article>


            <!-- ==========================================
                 TRENDING RAIL
            =========================================== -->

            <aside>

                <p
                    class="rail-title"
                >

                    More Trending

                </p>


                <div
                    class="rail-list"
                >

                    <p
                        class="state-message"
                    >

                        Loading…

                    </p>

                </div>

            </aside>


        </div>

    `;


    /* ------------------------------------------------------
       SHARE BUTTON
    ------------------------------------------------------ */

    const shareButton =
        document.getElementById(
            "share-btn"
        );


    if (shareButton) {

        shareButton.addEventListener(
            "click",
            async event => {

                try {

                    await navigator.clipboard.writeText(
                        window.location.href
                    );


                    event.target.textContent =
                        "✓ Link copied";


                    setTimeout(
                        () => {

                            event.target.textContent =
                                "↗ Share";

                        },
                        2000
                    );


                } catch {

                    /*
                       Clipboard access unavailable.
                    */

                }

            }
        );

    }


    /* ------------------------------------------------------
       BOOKMARK BUTTON
    ------------------------------------------------------ */

    setupBookmarkButton(
        articleId
    );

}


/* ==========================================================
   INITIALISE ARTICLE PAGE
========================================================== */

async function init() {

    /* ------------------------------------------------------
       CHECK ARTICLE ID
    ------------------------------------------------------ */

    if (!articleId) {

        document.getElementById(
            "article-slot"
        ).innerHTML =

            '<p class="state-message is-error">' +
            'No article was specified.' +
            '</p>';

        return;
    }


    /* ------------------------------------------------------
       RECORD ARTICLE VIEW
    ------------------------------------------------------ */

    try {

        await recordArticleView(
            articleId
        );

    } catch {

        /*
           View tracking is best-effort.
           It should not stop the article
           from loading.
        */

    }


    /* ------------------------------------------------------
       LOAD ARTICLE
    ------------------------------------------------------ */

    try {

        const article =
            await getArticleById(
                articleId
            );


        renderArticle(
            article
        );


        /* --------------------------------------------------
           LOAD TRENDING ARTICLES
        -------------------------------------------------- */

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

        document.getElementById(
            "article-slot"
        ).innerHTML =

            `<p class="state-message is-error">
                This article is unavailable:
                ${escapeHtml(
                    err.message
                )}
            </p>`;

    }

}


/* ==========================================================
   START
========================================================== */

init();