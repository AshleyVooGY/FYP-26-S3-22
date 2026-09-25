import { signUp, getCurrentUser } from "./auth.js";

const form = document.getElementById("signup-form");
const submitBtn = document.getElementById("submit-btn");
const messageSlot = document.getElementById("form-message");

function showMessage(text, isError) {
  messageSlot.innerHTML = `<p class="auth-message ${isError ? "is-error" : "is-success"}">${text}</p>`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const displayName = document.getElementById("display-name").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  submitBtn.disabled = true;
  messageSlot.innerHTML = "";

  const { data, error } = await signUp(email, password, displayName);

  submitBtn.disabled = false;

  if (error) {
    showMessage(error.message, true);
    return;
  }

  // With email confirmation enabled, Supabase returns no session yet.
  if (!data.session) {
    showMessage(
      "Account created. Check your email to confirm before logging in.",
      false,
    );
    form.reset();
    return;
  }

  window.location.href = "index.html";
});

// If already logged in, skip straight past the signup form.
(async () => {
  const user = await getCurrentUser();
  if (user) {
    window.location.href = "index.html";
  }
})();
