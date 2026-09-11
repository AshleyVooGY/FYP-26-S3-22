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

renderUserChip();
