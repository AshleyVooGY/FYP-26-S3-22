import { requireAdmin } from "./auth.js";
import { getAllProfiles, setUserRole } from "../../services/userManagementService.js";
import { escapeHtml, forbiddenStateHtml } from "./format.js";

let currentAdminId = null;

function rowHtml(p) {
  const isAdmin = p.role === "system_admin";
  const isSelf = p.id === currentAdminId;

  return `
    <tr>
      <td>${escapeHtml(p.display_name)}${isSelf ? " (you)" : ""}</td>
      <td><span class="badge">${isAdmin ? "System Admin" : "Registered User"}</span></td>
      <td>
        <button class="article-action is-live" data-id="${p.id}" data-next-role="${isAdmin ? "registered_user" : "system_admin"}" ${isSelf ? "disabled title=\"Can't change your own role\"" : ""}>
          ${isAdmin ? "Demote to User" : "Promote to Admin"}
        </button>
      </td>
    </tr>
  `;
}

async function render(profiles) {
  document.getElementById("users-slot").innerHTML = `
    <div class="analytics-panel">
      <table class="data-table">
        <thead><tr><th>Name</th><th>Role</th><th></th></tr></thead>
        <tbody>${profiles.map(rowHtml).join("")}</tbody>
      </table>
    </div>
  `;

  document.querySelectorAll("[data-next-role]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await setUserRole(btn.dataset.id, btn.dataset.nextRole);
        await reload();
      } catch (err) {
        alert(`Could not update role: ${err.message}`);
        btn.disabled = false;
      }
    });
  });
}

async function reload() {
  const profiles = await getAllProfiles();
  await render(profiles);
}

async function init() {
  const admin = await requireAdmin();
  const slot = document.getElementById("users-slot");

  if (!admin) {
    slot.innerHTML = forbiddenStateHtml();
    return;
  }

  currentAdminId = admin.id;
  slot.innerHTML = '<p class="state-message">Loading…</p>';

  try {
    await reload();
  } catch (err) {
    slot.innerHTML = `<p class="state-message is-error">Could not load users: ${escapeHtml(err.message)}</p>`;
  }
}

init();
