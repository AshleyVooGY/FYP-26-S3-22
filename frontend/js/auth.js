import { supabase } from "../../config/supabaseClient.js";

// ==========================================================
// LOGIN / AUTHENTICATION
// Shared helpers used by every page (auth pages + app shell).
// ==========================================================

export async function signUp(email, password, displayName) {
  return supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName },
      emailRedirectTo: new URL("login.html", window.location.href).href
    }
  });
}

export async function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    return null;
  }
  return data.user;
}

// Guards pages that require a Registered User. Redirects guests to login.html.
export async function requireAuth(redirectTo = "login.html") {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = redirectTo;
    return null;
  }
  return user;
}

// Checks whether the signed-in user is a System Admin (server-verified
// via the is_system_admin() function Feature 1 defined for RLS).
export async function isSystemAdmin() {
  const { data, error } = await supabase.rpc("is_system_admin");
  if (error) {
    return false;
  }
  return data === true;
}

// Guards pages restricted to System Admins. Redirects guests to
// redirectTo like requireAuth(), but a signed-in non-admin simply
// gets null back so the page can render its own restricted-access
// state instead of being redirected away.
export async function requireAdmin(redirectTo = "login.html") {
  const user = await requireAuth(redirectTo);
  if (!user) {
    return null;
  }
  const admin = await isSystemAdmin();
  return admin ? user : null;
}

// ==========================================================
// APP SHELL WIRING
// Any page that imports this module gets a working user-chip
// (Guest -> link to login.html, signed in -> logout) and
// working [data-logout] links, without each page reimplementing it.
// ==========================================================

function wireLogoutLinks() {
  document.querySelectorAll("[data-logout]").forEach((el) => {
    el.addEventListener("click", async (event) => {
      event.preventDefault();
      await signOut();
      window.location.href = "login.html";
    });
  });
}

// Keep primary navigation consistent across the shared shell. Older pages
// still contain disabled placeholders, so activate them here instead of
// maintaining a second feature-only navigation system.
function wirePrimaryNavigation() {
  document.querySelectorAll(".topbar__nav a").forEach((link) => {
    if (link.textContent.trim().startsWith("Categories")) {
      link.href = "categories.html";
      link.classList.remove("is-disabled");
      link.removeAttribute("title");
    }
  });

  document.querySelectorAll(".topbar__search").forEach((input) => {
    input.disabled = false;
    input.removeAttribute("disabled");
    input.removeAttribute("title");
    input.name = "q";

    const form = input.closest("form");
    if (form) {
      form.action = "search.html";
      form.method = "get";
      return;
    }

    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const keyword = input.value.trim();
      window.location.href = `search.html${keyword ? `?q=${encodeURIComponent(keyword)}` : ""}`;
    });
  });

  document.querySelectorAll(".btn-publish").forEach((button) => {
    button.classList.add("is-live");
    button.removeAttribute("disabled");
    button.removeAttribute("title");
    if (button.tagName === "A") {
      button.href = "article-editor.html";
    } else {
      button.addEventListener("click", () => {
        window.location.href = "article-editor.html";
      });
    }
  });
}

async function renderUserChip() {
  const label = document.getElementById("user-label");
  const chip = document.getElementById("user-chip");

  if (label) {
    const user = await getCurrentUser();

    if (user) {
      label.textContent = user.user_metadata?.display_name || user.email || "Account";
      if (chip) {
        chip.href = "#";
        chip.setAttribute("data-logout", "");
        chip.title = "Log out";
      }
    } else {
      label.textContent = "Guest";
      if (chip) {
        chip.href = "login.html";
        chip.removeAttribute("data-logout");
        chip.title = "Log in";
      }
    }
  }

  wireLogoutLinks();
}

// Hides sidebar/nav items marked [data-role="admin"] from anyone who
// isn't a System Admin, so the left-hand column only ever shows links
// a given role can actually use — not just a "System Admin only" hint
// on a link anyone could still click.
async function applyRoleVisibility() {
  const adminOnlyEls = document.querySelectorAll('[data-role="admin"]');
  if (adminOnlyEls.length === 0) {
    return;
  }

  const admin = await isSystemAdmin();
  adminOnlyEls.forEach((el) => {
    el.hidden = !admin;
  });
}

wirePrimaryNavigation();
renderUserChip();
applyRoleVisibility();
