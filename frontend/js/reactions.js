import { supabase } from "../../config/supabaseClient.js";


/* ==========================================================
   FEATURE 4
   NEWS REACTION MANAGEMENT

   Supported reactions:
   - like
   - love
   - haha
   - wow
   - sad
   - angry
========================================================== */


/* ==========================================================
   REACTION DEFINITIONS
========================================================== */

const REACTIONS = [
    {
        type: "like",
        label: "Like",
        icon: "👍"
    },
    {
        type: "love",
        label: "Love",
        icon: "❤️"
    },
    {
        type: "haha",
        label: "Haha",
        icon: "😂"
    },
    {
        type: "wow",
        label: "Wow",
        icon: "😮"
    },
    {
        type: "sad",
        label: "Sad",
        icon: "😢"
    },
    {
        type: "angry",
        label: "Angry",
        icon: "😡"
    }
];


/* ==========================================================
   GET CURRENT USER
========================================================== */

async function getCurrentUser() {

    const {
        data: {
            user
        },
        error
    } = await supabase.auth.getUser();


    if (error) {

        console.error(
            "Error getting current user:",
            error
        );

        return null;
    }


    return user;
}


/* ==========================================================
   GET USER'S CURRENT REACTION
========================================================== */

async function getUserReaction(
    articleId
) {

    const user =
        await getCurrentUser();


    if (!user) {
        return null;
    }


    const {
        data,
        error
    } = await supabase
        .from("reactions")
        .select("reaction_type")
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
            "Error getting user reaction:",
            error
        );

        return null;
    }


    return data?.reaction_type ?? null;
}


/* ==========================================================
   GET REACTION COUNTS
========================================================== */

async function getReactionCounts(
    articleId
) {

    const {
        data,
        error
    } = await supabase.rpc(
        "get_article_reactions",
        {
            p_article_id:
                Number(articleId)
        }
    );


    if (error) {

        console.error(
            "Error getting reaction counts:",
            error
        );

        throw error;
    }


    /*
       Start all six reactions at zero.

       The SQL function only returns reaction
       types that currently have at least one
       reaction.
    */

    const counts = {};

    REACTIONS.forEach(
        reaction => {

            counts[
                reaction.type
            ] = 0;

        }
    );


    /*
       Insert values returned by Supabase.
    */

    (data ?? []).forEach(
        row => {

            counts[
                row.reaction_type
            ] = Number(
                row.reaction_count
            );

        }
    );


    return counts;
}


/* ==========================================================
   INSERT NEW REACTION
========================================================== */

async function addReaction(
    articleId,
    reactionType
) {

    const user =
        await getCurrentUser();


    if (!user) {

        return {
            success: false,
            requiresLogin: true
        };

    }


    const {
        error
    } = await supabase
        .from("reactions")
        .insert({

            user_id:
                user.id,

            article_id:
                Number(articleId),

            reaction_type:
                reactionType

        });


    if (error) {

        console.error(
            "Error adding reaction:",
            error
        );

        throw error;
    }


    return {
        success: true
    };
}


/* ==========================================================
   UPDATE EXISTING REACTION
========================================================== */

async function updateReaction(
    articleId,
    reactionType
) {

    const user =
        await getCurrentUser();


    if (!user) {

        return {
            success: false,
            requiresLogin: true
        };

    }


    const {
        error
    } = await supabase
        .from("reactions")
        .update({

            reaction_type:
                reactionType

        })
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
            "Error updating reaction:",
            error
        );

        throw error;
    }


    return {
        success: true
    };
}


/* ==========================================================
   DELETE REACTION
========================================================== */

async function removeReaction(
    articleId
) {

    const user =
        await getCurrentUser();


    if (!user) {

        return {
            success: false,
            requiresLogin: true
        };

    }


    const {
        error
    } = await supabase
        .from("reactions")
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
            "Error removing reaction:",
            error
        );

        throw error;
    }


    return {
        success: true
    };
}


/* ==========================================================
   FORMAT NUMBER
========================================================== */

function formatReactionCount(
    number
) {

    const value =
        Number(number) || 0;


    if (value >= 1000000) {

        return (
            (value / 1000000)
                .toFixed(
                    value >= 10000000
                        ? 0
                        : 1
                ) +
            "M"
        );

    }


    if (value >= 1000) {

        return (
            (value / 1000)
                .toFixed(
                    value >= 10000
                        ? 0
                        : 1
                ) +
            "K"
        );

    }


    return String(value);
}


/* ==========================================================
   UPDATE SELECTED BUTTON
========================================================== */

function updateSelectedReaction(
    container,
    selectedReaction
) {

    const buttons =
        container.querySelectorAll(
            ".reaction-btn"
        );


    buttons.forEach(
        button => {

            const type =
                button.dataset.reaction;


            if (
                type === selectedReaction
            ) {

                button.classList.add(
                    "is-selected"
                );

                button.setAttribute(
                    "aria-pressed",
                    "true"
                );

            } else {

                button.classList.remove(
                    "is-selected"
                );

                button.setAttribute(
                    "aria-pressed",
                    "false"
                );

            }

        }
    );
}


/* ==========================================================
   RENDER REACTION COUNTS
========================================================== */

function renderReactionCounts(
    container,
    counts
) {

    const countsContainer =
        container.querySelector(
            ".reaction-counts"
        );


    if (!countsContainer) {
        return;
    }


    countsContainer.innerHTML =
        REACTIONS
            .map(
                reaction => {

                    const count =
                        counts[
                            reaction.type
                        ] ?? 0;


                    return `
                        <span
                            class="reaction-count"
                        >

                            <span>
                                ${reaction.icon}
                            </span>

                            <span
                                class="reaction-count__number"
                            >
                                ${formatReactionCount(
                                    count
                                )}
                            </span>

                        </span>
                    `;

                }
            )
            .join("");
}


/* ==========================================================
   SET LOADING STATE
========================================================== */

function setLoadingState(
    container,
    loading
) {

    const buttons =
        container.querySelectorAll(
            ".reaction-btn"
        );


    buttons.forEach(
        button => {

            button.disabled =
                loading;

        }
    );


    const counts =
        container.querySelector(
            ".reaction-counts"
        );


    if (counts) {

        counts.classList.toggle(
            "is-loading",
            loading
        );

    }
}


/* ==========================================================
   SHOW ERROR
========================================================== */

function showReactionError(
    container,
    message
) {

    let errorElement =
        container.querySelector(
            ".reaction-error"
        );


    if (!errorElement) {

        errorElement =
            document.createElement(
                "p"
            );

        errorElement.className =
            "reaction-error";

        container.appendChild(
            errorElement
        );

    }


    errorElement.textContent =
        message;
}


/* ==========================================================
   CLEAR ERROR
========================================================== */

function clearReactionError(
    container
) {

    const errorElement =
        container.querySelector(
            ".reaction-error"
        );


    if (errorElement) {
        errorElement.remove();
    }
}


/* ==========================================================
   CREATE REACTION UI
========================================================== */

function createReactionUI() {

    const section =
        document.createElement(
            "section"
        );


    section.className =
        "reaction-section";


    section.innerHTML = `

        <p
            class="reaction-section__title"
        >
            How do you feel about this article?
        </p>


        <div
            class="reaction-bar"
        >

            ${REACTIONS
                .map(
                    reaction => `

                        <button
                            type="button"
                            class="reaction-btn"
                            data-reaction="${reaction.type}"
                            aria-pressed="false"
                            title="${reaction.label}"
                        >

                            <span>
                                ${reaction.icon}
                            </span>

                            <span>
                                ${reaction.label}
                            </span>

                        </button>

                    `
                )
                .join("")
            }

        </div>


        <div
            class="reaction-counts"
            aria-label="Reaction counts"
        >

            ${REACTIONS
                .map(
                    reaction => `

                        <span
                            class="reaction-count"
                        >

                            <span>
                                ${reaction.icon}
                            </span>

                            <span
                                class="reaction-count__number"
                            >
                                0
                            </span>

                        </span>

                    `
                )
                .join("")
            }

        </div>

    `;


    return section;
}


/* ==========================================================
   HANDLE REACTION CLICK
========================================================== */

async function handleReactionClick(
    container,
    articleId,
    reactionType
) {

    clearReactionError(
        container
    );


    const user =
        await getCurrentUser();


    if (!user) {

        alert(
            "Please log in to react to an article."
        );

        window.location.href =
            "login.html";

        return;
    }


    setLoadingState(
        container,
        true
    );


    try {

        const currentReaction =
            await getUserReaction(
                articleId
            );


        /*
           Clicking the currently selected
           reaction removes it.
        */

        if (
            currentReaction ===
            reactionType
        ) {

            await removeReaction(
                articleId
            );

        }

        /*
           User has no reaction yet.
        */

        else if (
            !currentReaction
        ) {

            await addReaction(
                articleId,
                reactionType
            );

        }

        /*
           User is changing their reaction.
        */

        else {

            await updateReaction(
                articleId,
                reactionType
            );

        }


        /*
           Reload current reaction and
           counts after the database update.
        */

        const [
            updatedReaction,
            counts
        ] = await Promise.all([

            getUserReaction(
                articleId
            ),

            getReactionCounts(
                articleId
            )

        ]);


        updateSelectedReaction(
            container,
            updatedReaction
        );


        renderReactionCounts(
            container,
            counts
        );


    } catch (error) {

        console.error(
            "Feature 4 reaction error:",
            error
        );


        showReactionError(
            container,
            "Unable to save your reaction. Please try again."
        );

    } finally {

        setLoadingState(
            container,
            false
        );

    }

}


/* ==========================================================
   INITIALISE REACTIONS
========================================================== */

export async function setupReactions(
    articleId
) {

    if (!articleId) {
        return;
    }


    /*
       Find the article body.
    */

    const articlePanel =
        document.querySelector(
            ".article-panel"
        );


    if (!articlePanel) {
        return;
    }


    /*
       Prevent duplicate reaction sections.
    */

    const existing =
        articlePanel.querySelector(
            ".reaction-section"
        );


    if (existing) {
        existing.remove();
    }


    /*
       Create Feature 4 UI.
    */

    const reactionSection =
        createReactionUI();


    /*
       Place reactions before
       the article action buttons.
    */

    const articleActions =
        articlePanel.querySelector(
            ".article-actions"
        );


    if (articleActions) {

        articlePanel.insertBefore(
            reactionSection,
            articleActions
        );

    } else {

        articlePanel.appendChild(
            reactionSection
        );

    }


    /*
       Load initial state.
    */

    setLoadingState(
        reactionSection,
        true
    );


    try {

        const [
            currentReaction,
            counts
        ] = await Promise.all([

            getUserReaction(
                articleId
            ),

            getReactionCounts(
                articleId
            )

        ]);


        updateSelectedReaction(
            reactionSection,
            currentReaction
        );


        renderReactionCounts(
            reactionSection,
            counts
        );


    } catch (error) {

        console.error(
            "Error initialising reactions:",
            error
        );


        showReactionError(
            reactionSection,
            "Unable to load reaction information."
        );

    } finally {

        setLoadingState(
            reactionSection,
            false
        );

    }


    /*
       Add click handlers.
    */

    const buttons =
        reactionSection.querySelectorAll(
            ".reaction-btn"
        );


    buttons.forEach(
        button => {

            button.addEventListener(
                "click",
                () => {

                    handleReactionClick(
                        reactionSection,
                        articleId,
                        button.dataset.reaction
                    );

                }
            );

        }
    );

}