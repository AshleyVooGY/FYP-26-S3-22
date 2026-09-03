export function formatCount(value) {
  const n = Number(value) || 0;

  if (n >= 1000) {
    return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  }

  return String(n);
}

export function formatRelativeTime(dateString) {
  if (!dateString) {
    return "";
  }

  const then = new Date(dateString).getTime();
  const diffMs = Date.now() - then;
  const minutes = Math.floor(diffMs / 60000);

  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days}d ago`;
  }

  return new Date(dateString).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

export function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}
