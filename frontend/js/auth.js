import { getMyDisplayName } from '../../services/accountSettingsService.js?v=account-name-20261029';
import { setupNotifications } from './notifications.js?v=notifications-20261027';
import { sidebarHtml } from "./sidebar.js?v=account-settings-20261027";
import { supabase } from "../../config/supabaseClient.js";
import { upgradeMyAccountToPremium } from "../../services/userManagementService.js?v=required-category-20261022";

// ==========================================================
// LOGIN / AUTHENTICATION
// Shared helpers used by every page (auth pages + app shell).
// ==========================================================

export async function signUp(email, password, displayName, tier = "free") {
  return supabase.auth.signUp({
    email,
    password,
    options: {
      // requested_tier is only ever read once, at account creation, by the
      // handle_new_user trigger — it is never trusted again after that.
      data: { display_name: displayName, requested_tier: tier === "premium" ? "premium" : "free" },
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
// (Guest -> link to login.html, signed in -> Settings) and
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

// Wires the sidebar's "Upgrade to Premium" link (shown to Free users only,
// see applyTierVisibility). The server — guard_profile_tier_change() in
// subscription-tiers.sql — is what actually allows this one-directional
// self-service change; this is just the UI around it.
function wireUpgradeLinks() {
  document.querySelectorAll("[data-upgrade-tier]").forEach((el) => {
    el.addEventListener("click", async (event) => {
      event.preventDefault();
      if (!window.confirm("Upgrade your account to Premium? This unlocks higher optional AI writing limits. Publishing checks are available on both plans.")) {
        return;
      }
      el.style.pointerEvents = "none";
      try {
        await upgradeMyAccountToPremium();
        // Refresh the session so the app_metadata mirror (and every
        // tier-aware part of the UI) reflects Premium immediately.
        await supabase.auth.refreshSession();
        alert("You're now on Premium! Enjoy higher optional AI writing limits.");
        window.location.reload();
      } catch (error) {
        alert(`Could not upgrade your account: ${error.message}`);
        el.style.pointerEvents = "";
      }
    });
  });
}

// Keep primary navigation consistent across the shared shell. Older pages
// still contain disabled placeholders, so activate them here instead of
// maintaining a second feature-only navigation system.
const searchIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>';

function wirePrimaryNavigation() {
  document.querySelectorAll('.topbar__actions .icon-btn').forEach(button => {
    button.type = 'button';
    button.setAttribute('aria-label', 'Notifications');
    button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 6.5-2.5 8.5-2.5 8.5h17S18 14.5 18 8z"/><path d="M13.7 20a2 2 0 0 1-3.4 0"/></svg>';
  });
  const sidebar = document.querySelector('aside.sidebar');
  if (sidebar) {
    const template = document.createElement('template');
    template.innerHTML = sidebarHtml;
    sidebar.replaceWith(template.content.firstElementChild);
    const page = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.sidebar__nav a').forEach(link => {
      if (link.getAttribute('href') === page) {
        link.classList.add('is-active');
        link.setAttribute('aria-current', 'page');
      }
    });
  }
  const searchStyles = document.createElement("link");
  searchStyles.rel = "stylesheet";
  searchStyles.href = new URL("../css/search-navigation.css", import.meta.url).href;
  document.head.append(searchStyles);
  document.querySelectorAll(".topbar__nav a").forEach((link) => {
    const label = link.textContent.trim();
    const destinations = { Home: 'index.html', Trending: 'trending.html', Bookmarks: 'bookmarks.html' };
    const destination = label.startsWith('Categories') ? 'categories.html' : destinations[label];
    if (destination) {
      link.href = destination;
      link.classList.remove("is-disabled");
      link.removeAttribute("title");
    }
  });

  document.querySelectorAll(".topbar__search").forEach((input) => {
    input.disabled = false;
    input.removeAttribute("disabled");
    input.removeAttribute("title");
    input.name = "q";
    input.type = "search";
    input.setAttribute("aria-label", "Search news");

    if (document.getElementById("search-app")) {
      const entry = document.createElement("button");
      entry.type = "button";
      entry.className = "topbar-search-button";
      entry.setAttribute("aria-label", "Focus news search");
      entry.innerHTML = searchIcon;
      entry.addEventListener("click", () => document.getElementById("keyword")?.focus());
      const existingForm = input.closest("form");
      (existingForm || input).replaceWith(entry);
      return;
    }

    let form = input.closest("form");
    if (!form) {
      form = document.createElement("form");
      input.replaceWith(form);
      form.append(input);
    }
    form.action = "search.html";
    form.method = "get";
    form.classList.add("topbar-search-form");
    const button = document.createElement("button");
    button.type = "submit";
    button.className = "topbar-search-button";
    button.setAttribute("aria-label", "Search news");
    button.innerHTML = searchIcon;
    form.append(button);
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

    setupNotifications(user);
    if (user) {
      label.textContent = "Account";
      label.textContent = await getMyDisplayName(user);
      if (chip) {
        chip.href = "settings.html";
        chip.removeAttribute("data-logout");
        chip.title = "Account settings";
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

// Shows [data-tier="free"] elements (the "Upgrade to Premium" sidebar
// link) only to signed-in Free users — hidden for guests and for Premium
// accounts, who have nothing to upgrade to.
async function applyTierVisibility() {
  const freeOnlyEls = document.querySelectorAll('[data-tier="free"]');
  if (freeOnlyEls.length === 0) {
    return;
  }

  const user = await getCurrentUser();
  const tier = user?.app_metadata?.subscription_tier === "premium" ? "premium" : "free";
  const show = Boolean(user) && tier === "free";
  freeOnlyEls.forEach((el) => {
    el.hidden = !show;
  });
  if (show) {
    wireUpgradeLinks();
  }
}

wirePrimaryNavigation();
renderUserChip();
applyRoleVisibility();
applyTierVisibility();
