import { requireAdmin } from "./auth.js";
import { getCategoryPopularity } from "../../services/feature6Service.js";
import { formatCount, escapeHtml, forbiddenStateHtml } from "./format.js";

function renderCategories(categories) {
  const slot = document.getElementById("category-slot");

  if (categories.length === 0) {
    slot.innerHTML = '<p class="state-message">No categories yet.</p>';
    return;
  }

  const maxViews = Math.max(1, ...categories.map((c) => Number(c.total_views)));

  const rows = categories
    .map((c, i) => {
      const widthPct = Math.round((Number(c.total_views) / maxViews) * 100);
      return `
        <tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(c.category_name)}</td>
          <td class="is-numeric">${formatCount(c.article_count)}</td>
          <td class="is-numeric">${formatCount(c.total_views)}</td>
          <td class="is-numeric">${formatCount(c.total_reactions)}</td>
          <td class="is-numeric">${formatCount(c.avg_views)}</td>
          <td style="width:120px;">
            <div class="category-bar-track"><div class="category-bar-fill" style="width:${widthPct}%"></div></div>
          </td>
        </tr>
      `;
    })
    .join("");

  slot.innerHTML = `
    <div class="analytics-panel">
      <table class="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Category</th>
            <th class="is-numeric">Articles</th>
            <th class="is-numeric">Total Views</th>
            <th class="is-numeric">Total Reactions</th>
            <th class="is-numeric">Avg Views</th>
            <th>Share</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

async function init() {
  const admin = await requireAdmin();
  const slot = document.getElementById("category-slot");

  if (!admin) {
    slot.innerHTML = forbiddenStateHtml();
    return;
  }

  slot.innerHTML = '<p class="state-message">Loading…</p>';

  try {
    const categories = await getCategoryPopularity();
    renderCategories(categories);
  } catch (err) {
    slot.innerHTML = `<p class="state-message is-error">Could not load category popularity: ${escapeHtml(err.message)}</p>`;
  }
}

init();
