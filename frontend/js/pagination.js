// Shared numbered-pagination control (Prev / 1 … n / Next), used by
// any page that paginates a client-side list: trending.js today,
// analytics-articles.js as of Feature 6.

export function renderPagination(container, { page, totalItems, pageSize, onPageChange }) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  if (totalPages <= 1) {
    container.innerHTML = "";
    return;
  }

  const buttons = [];
  buttons.push(`<button data-page="${page - 1}" ${page === 1 ? "disabled" : ""}>← Prev</button>`);

  const pageNumbers = new Set([1, totalPages, page]);
  const sorted = [...pageNumbers].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);

  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) {
      buttons.push(`<span class="pagination__ellipsis">…</span>`);
    }
    buttons.push(`<button data-page="${p}" class="${p === page ? "is-active" : ""}">${p}</button>`);
    prev = p;
  }

  buttons.push(`<button data-page="${page + 1}" ${page === totalPages ? "disabled" : ""}>Next →</button>`);

  container.innerHTML = buttons.join("");

  container.querySelectorAll("button[data-page]").forEach((btn) => {
    btn.addEventListener("click", () => onPageChange(Number(btn.dataset.page)));
  });
}
