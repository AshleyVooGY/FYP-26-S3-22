import { supabase } from "../../config/supabaseClient.js";

import {
    requireAuth
} from "./auth.js";

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
    setupReactions
} from "./reactions.js";

import {
    getRecommendations
} from "../features-01-02-10/featureService.js";


/* ==========================================================
   GET ARTICLE ID FROM URL
========================================================== */

const params = new URLSearchParams(
    window.location.search
);

const articleId = params.get("id");


/* ==========================================================
   ARTICLE READ ALOUD
========================================================== */

let speechChunks = [];
let speechChunkIndex = 0;
let speechSession = 0;
let speechState = "idle";


function splitSpeechText(text, maxLength = 240) {

    const sentences = String(text || "")
        .replace(/\s+/g, " ")
        .trim()
        .match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];

    const chunks = [];
    let current = "";

    sentences.forEach(sentence => {

        const cleanSentence = sentence.trim();

        if (!cleanSentence) {
            return;
        }

        if (current && `${current} ${cleanSentence}`.length > maxLength) {
            chunks.push(current);
            current = cleanSentence;
        } else {
            current = current
                ? `${current} ${cleanSentence}`
                : cleanSentence;
        }

    });

    if (current) {
        chunks.push(current);
    }

    return chunks;

}


function updateReadAloudControls(message = "Ready to read.") {

    const readButton = document.getElementById("read-aloud-btn");
    const stopButton = document.getElementById("stop-reading-btn");
    const status = document.getElementById("read-aloud-status");

    if (status) {
        status.textContent = message;
    }

    if (!readButton || !stopButton) {
        return;
    }

    if (speechState === "reading") {
        readButton.textContent = "⏸ Pause";
        readButton.setAttribute("aria-label", "Pause article reading");
        stopButton.disabled = false;
    } else if (speechState === "paused") {
        readButton.textContent = "▶ Resume";
        readButton.setAttribute("aria-label", "Resume article reading");
        stopButton.disabled = false;
    } else {
        readButton.textContent = "🔊 Read Aloud";
        readButton.setAttribute("aria-label", "Read article aloud");
        stopButton.disabled = true;
    }

}


function stopReadAloud(message = "Reading stopped.") {

    speechSession += 1;
    speechChunks = [];
    speechChunkIndex = 0;
    speechState = "idle";

    if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
    }

    updateReadAloudControls(message);

}


function speakNextChunk(sessionId) {

    if (
        sessionId !== speechSession ||
        speechChunkIndex >= speechChunks.length
    ) {
        if (sessionId === speechSession) {
            stopReadAloud("Finished reading article.");
        }
        return;
    }

    const utterance = new SpeechSynthesisUtterance(
        speechChunks[speechChunkIndex]
    );

    utterance.lang = document.documentElement.lang || "en-US";
    utterance.rate = 1;
    utterance.pitch = 1;

    utterance.onend = () => {

        if (sessionId !== speechSession) {
            return;
        }

        speechChunkIndex += 1;
        speakNextChunk(sessionId);

    };

    utterance.onerror = event => {

        if (
            sessionId !== speechSession ||
            event.error === "canceled" ||
            event.error === "interrupted"
        ) {
            return;
        }

        stopReadAloud("Unable to read this article aloud. Please try again.");

    };

    window.speechSynthesis.speak(utterance);

}


function startReadAloud(article) {

    if (!("speechSynthesis" in window)) {
        updateReadAloudControls(
            "Read Aloud is not supported by this browser."
        );
        return;
    }

    const text = `${article.title}. ${article.content}`.trim();
    speechChunks = splitSpeechText(text);

    if (speechChunks.length === 0) {
        updateReadAloudControls("There is no article content to read.");
        return;
    }

    window.speechSynthesis.cancel();
    speechSession += 1;
    speechChunkIndex = 0;
    speechState = "reading";
    updateReadAloudControls("Reading article aloud.");
    speakNextChunk(speechSession);

}


function setupReadAloud(article) {

    const readButton = document.getElementById("read-aloud-btn");
    const stopButton = document.getElementById("stop-reading-btn");

    if (!readButton || !stopButton) {
        return;
    }

    if (!("speechSynthesis" in window)) {
        readButton.disabled = true;
        updateReadAloudControls(
            "Read Aloud is not supported by this browser."
        );
        return;
    }

    readButton.addEventListener("click", () => {

        if (speechState === "reading") {
            window.speechSynthesis.pause();
            speechState = "paused";
            updateReadAloudControls("Reading paused.");
            return;
        }

        if (speechState === "paused") {
            window.speechSynthesis.resume();
            speechState = "reading";
            updateReadAloudControls("Reading article aloud.");
            return;
        }

        startReadAloud(article);

    });

    stopButton.addEventListener("click", () => {
        stopReadAloud();
    });

    updateReadAloudControls();

}


window.addEventListener("pagehide", () => {
    stopReadAloud("");
});


/* ==========================================================
   RENDER TRENDING RAIL
========================================================== */

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


    rail.innerHTML =
        others
            .map(
                article => {

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
                                    ${escapeHtml(
                                        article.title
                                    )}
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

                }
            )
            .join("");
}


/* ==========================================================
   CHECK WHETHER ARTICLE IS ALREADY BOOKMARKED
========================================================== */

async function isArticleBookmarked(
    articleId
) {

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
        .eq(
            "user_id",
            user.id
        )
        .eq(
            "article_id",
            Number(articleId)
        )
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
   SHOW BOOKMARK / UNBOOKMARK MODAL
========================================================== */

function showBookmarkModal(
    articleId,
    bookmarkButton,
    isCurrentlyBookmarked
) {

    const existingModal =
        document.querySelector(
            ".bookmark-modal"
        );


    if (existingModal) {
        return;
    }


    const action =
        isCurrentlyBookmarked
            ? "remove"
            : "add";


    const modalTitle =
        action === "remove"
            ? "Remove Bookmark"
            : "Bookmark Article";


    const modalMessage =
        action === "remove"
            ? "Are you sure you want to remove this bookmark?"
            : "Are you sure you want to bookmark this article?";


    const confirmText =
        action === "remove"
            ? "Remove"
            : "Yes";


    const modal =
        document.createElement(
            "div"
        );


    modal.className =
        "bookmark-modal";


    modal.innerHTML = `

        <div
            class="bookmark-modal__content"
        >

            <h2>
                ${modalTitle}
            </h2>

            <p>
                ${modalMessage}
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
                    ${confirmText}
                </button>

            </div>

        </div>

    `;


    document.body.appendChild(
        modal
    );


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


    const confirmButton =
        modal.querySelector(
            ".bookmark-modal__confirm"
        );


    confirmButton.addEventListener(
        "click",
        async () => {

            if (
                action === "remove"
            ) {

                await removeBookmark(
                    articleId,
                    bookmarkButton,
                    modal,
                    confirmButton
                );

            } else {

                await saveBookmark(
                    articleId,
                    bookmarkButton,
                    modal,
                    confirmButton
                );

            }

        }
    );


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


    const alreadyBookmarked =
        await isArticleBookmarked(
            articleId
        );


    if (alreadyBookmarked) {

        modal.remove();

        updateBookmarkButton(
            bookmarkButton,
            true
        );

        return;
    }


    confirmButton.disabled =
        true;

    confirmButton.textContent =
        "Saving...";


    const {
        error
    } = await supabase
        .from("bookmarks")
        .insert({

            user_id:
                user.id,

            article_id:
                Number(articleId)

        });


    if (error) {

        console.error(
            "Error saving bookmark:",
            error
        );


        confirmButton.disabled =
            false;

        confirmButton.textContent =
            "Yes";


        alert(
            "Unable to bookmark this article. Please try again."
        );

        return;
    }


    modal.remove();


    updateBookmarkButton(
        bookmarkButton,
        true
    );

}


/* ==========================================================
   REMOVE BOOKMARK
========================================================== */

async function removeBookmark(
    articleId,
    bookmarkButton,
    modal,
    confirmButton
) {

    const {
        data: {
            user
        }
    } = await supabase.auth.getUser();


    if (!user) {

        modal.remove();

        alert(
            "Please log in to manage your bookmarks."
        );

        window.location.href =
            "login.html";

        return;
    }


    confirmButton.disabled =
        true;

    confirmButton.textContent =
        "Removing...";


    const {
        error
    } = await supabase
        .from("bookmarks")
        .delete()
        .eq(
            "user_id",
            user.id
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


        confirmButton.disabled =
            false;

        confirmButton.textContent =
            "Remove";


        alert(
            "Unable to remove this bookmark. Please try again."
        );

        return;
    }


    modal.remove();


    updateBookmarkButton(
        bookmarkButton,
        false
    );

}


/* ==========================================================
   UPDATE BOOKMARK BUTTON
========================================================== */

function updateBookmarkButton(
    bookmarkButton,
    bookmarked
) {

    if (bookmarked) {

        bookmarkButton.textContent =
            "🔖 Bookmarked";

        bookmarkButton.classList.add(
            "is-bookmarked"
        );

        bookmarkButton.title =
            "Remove bookmark";

    } else {

        bookmarkButton.textContent =
            "🔖 Bookmark";

        bookmarkButton.classList.remove(
            "is-bookmarked"
        );

        bookmarkButton.title =
            "Bookmark this article";

    }

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


    const bookmarked =
        await isArticleBookmarked(
            articleId
        );


    updateBookmarkButton(
        bookmarkButton,
        bookmarked
    );


    bookmarkButton.addEventListener(
        "click",
        async () => {

            const currentState =
                await isArticleBookmarked(
                    articleId
                );


            updateBookmarkButton(
                bookmarkButton,
                currentState
            );


            showBookmarkModal(
                articleId,
                bookmarkButton,
                currentState
            );

        }
    );

}


/* ==========================================================
   RENDER ARTICLE
========================================================== */

function renderArticle(
    article
) {

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
                     READING ACCESSIBILITY - READ ALOUD
                ======================================= -->

                <section
                    class="article-read-aloud"
                    aria-label="Article read aloud controls"
                >

                    <div>

                        <strong>
                            Listen to this article
                        </strong>

                        <p
                            id="read-aloud-status"
                            aria-live="polite"
                        >
                            Ready to read.
                        </p>

                    </div>

                    <div class="article-read-aloud__actions">

                        <button
                            type="button"
                            class="article-action article-action--control is-live"
                            id="read-aloud-btn"
                            aria-label="Read article aloud"
                        >
                            🔊 Read Aloud
                        </button>

                        <button
                            type="button"
                            class="article-action article-action--control is-live"
                            id="stop-reading-btn"
                            aria-label="Stop article reading"
                            disabled
                        >
                            ■ Stop
                        </button>

                    </div>

                </section>


                <!-- ======================================
                     FEATURE 4 - REACTIONS
                     Created by reactions.js
                ======================================= -->


                <!-- ======================================
                     ARTICLE ACTIONS
                ======================================= -->

                <div
                    class="article-actions"
                >


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

                    Recommended For You

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
       FEATURE 3 - BOOKMARK
    ------------------------------------------------------ */

    setupBookmarkButton(
        articleId
    );


    /* ------------------------------------------------------
       FEATURE 4 - REACTIONS
    ------------------------------------------------------ */

    setupReactions(
        articleId
    );


    /* ------------------------------------------------------
       READING ACCESSIBILITY - READ ALOUD
    ------------------------------------------------------ */

    setupReadAloud(
        article
    );

}


/* ==========================================================
   INITIALISE ARTICLE PAGE
========================================================== */

async function init() {

    /* ------------------------------------------------------
       GUESTS ARE REDIRECTED TO THE MARKETING LANDING PAGE
    ------------------------------------------------------ */

    const user = await requireAuth("welcome.html");

    if (!user) {

        return;
    }


    /* ------------------------------------------------------
       CHECK ARTICLE ID
    ------------------------------------------------------ */

    if (!articleId) {

        const slot =
            document.getElementById(
                "article-slot"
            );


        if (slot) {

            slot.innerHTML =

                '<p class="state-message is-error">' +
                'No article was specified.' +
                '</p>';

        }

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
           LOAD RECOMMENDED ARTICLES (FEATURE 10)
        -------------------------------------------------- */

        try {

            const recommended =
                await getRecommendations(
                    articleId,
                    6
                );


            renderRail(
                recommended,
                articleId
            );


        } catch {

            /* Keep the existing trending rail as a graceful fallback. */
            try {
                const trending = await getTrendingArticles(6);
                renderRail(trending, articleId);
            } catch {
                renderRail([], articleId);
            }

        }


    } catch (err) {

        const slot =
            document.getElementById(
                "article-slot"
            );


        if (slot) {

            slot.innerHTML =

                `<p class="state-message is-error">
                    This article is unavailable:
                    ${escapeHtml(
                        err.message
                    )}
                </p>`;

        }

    }

}


/* ==========================================================
   START
========================================================== */

init();
