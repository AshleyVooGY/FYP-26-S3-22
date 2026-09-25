import { supabase } from "../../config/supabaseClient.js";

import { getArticleById } from "../../services/feature5Service.js";

import { formatCount, formatRelativeTime, escapeHtml } from "./format.js";

// ==========================================================
// GET CURRENT USER
// ==========================================================

async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    console.error("Unable to check login status:", error);

    return null;
  }

  return data?.user ?? null;
}

// ==========================================================
// FORMAT HISTORY DATE
// ==========================================================

function formatViewedTime(viewedAt) {
  if (!viewedAt) {
    return "";
  }

  return formatRelativeTime(viewedAt);
}

// ==========================================================
// LOAD READING HISTORY
// ==========================================================

async function loadReadingHistory() {
  const { data, error } = await supabase.rpc("get_reading_history");

  if (error) {
    console.error("Unable to load reading history:", error);

    throw error;
  }

  return data || [];
}

// ==========================================================
// LOAD ARTICLE DETAILS
// ==========================================================

async function loadArticleDetails(historyItem) {
  try {
    const article = await getArticleById(historyItem.article_id);

    return {
      ...historyItem,

      article,
    };
  } catch (error) {
    console.error(`Unable to load article ${historyItem.article_id}:`, error);

    return {
      ...historyItem,

      article: null,
    };
  }
}

// ==========================================================
// RENDER HISTORY
// ==========================================================

async function renderHistory(history) {
  const grid = document.getElementById("historyGrid");

  if (!grid) {
    return;
  }

  // --------------------------------------------------------
  // Empty history
  // --------------------------------------------------------

  if (history.length === 0) {
    grid.innerHTML = `

      <div class="history-empty">

        <h3>
          No Reading History
        </h3>

        <p>
          Articles that you view will appear here.
        </p>

      </div>

    `;

    return;
  }

  // --------------------------------------------------------
  // Load article details
  // --------------------------------------------------------

  const articles = await Promise.all(
    history.map((item) => loadArticleDetails(item)),
  );

  // --------------------------------------------------------
  // Render cards
  // --------------------------------------------------------

  grid.innerHTML = articles
    .map((item) => {
      const article = item.article;

      /*
       * If the article has been deleted,
       * don't display a broken card.
       */

      if (!article) {
        return "";
      }

      const image = article.featured_image_url
        ? `

                <img
                  src="${escapeHtml(article.featured_image_url)}"
                  alt=""
                />

              `
        : `

                <div
                  class="history-image-placeholder"
                >
                  🖼
                </div>

              `;

      const category = article.category?.name ?? "Category";

      return `

            <article
              class="history-card"
              data-article-id="${article.id}"
            >


              <div
                class="history-card__image"
              >

                ${image}

              </div>


              <div
                class="history-card__body"
              >


                <span
                  class="history-card__category"
                >

                  ${escapeHtml(category)}

                </span>


                <div
                  class="history-card__title"
                >

                  ${escapeHtml(article.title)}

                </div>


                <div
                  class="history-card__meta"
                >

                  <span>

                    ${formatViewedTime(item.viewed_at)}

                  </span>


                  <span>

                    👁
                    ${formatCount(article.view_count)}

                  </span>


                  <span>

                    ♡
                    ${formatCount(article.reaction_count)}

                  </span>

                </div>


              </div>

            </article>

          `;
    })
    .join("");

  // --------------------------------------------------------
  // Add click events
  // --------------------------------------------------------

  document.querySelectorAll(".history-card").forEach((card) => {
    card.addEventListener("click", () => {
      const id = card.dataset.articleId;

      window.location.href = `article.html?id=${id}`;
    });
  });
}

// ==========================================================
// UPDATE USER LABEL
// ==========================================================

async function updateUserLabel(user) {
  const label = document.getElementById("user-label");

  if (!label) {
    return;
  }

  if (user) {
    label.textContent = user.email ?? "Account";
  } else {
    label.textContent = "Guest";
  }
}

// ==========================================================
// INITIALISE
// ==========================================================

async function init() {
  console.log("Feature 3 Reading History initialising...");

  // --------------------------------------------------------
  // Check authentication
  // --------------------------------------------------------

  const currentUser = await getCurrentUser();

  await updateUserLabel(currentUser);

  // --------------------------------------------------------
  // Reading History requires login
  // --------------------------------------------------------

  if (!currentUser) {
    const grid = document.getElementById("historyGrid");

    if (grid) {
      grid.innerHTML = `

        <div class="history-empty">

          <h3>
            Please Log In
          </h3>

          <p>
            You must be logged in to view your reading history.
          </p>

          <br>

          <a
            href="login.html"
            class="save-button"
          >
            Log In
          </a>

        </div>

      `;
    }

    return;
  }

  // --------------------------------------------------------
  // Load history
  // --------------------------------------------------------

  try {
    const history = await loadReadingHistory();

    console.log("Reading history:", history);

    await renderHistory(history);
  } catch (error) {
    const grid = document.getElementById("historyGrid");

    if (grid) {
      grid.innerHTML = `

        <div class="history-empty">

          <h3>
            Unable to Load History
          </h3>

          <p>
            ${escapeHtml(error.message)}
          </p>

        </div>

      `;
    }
  }
}

init();
