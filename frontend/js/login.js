import { signIn, getCurrentUser } from "./auth.js";

const form = document.getElementById("login-form");
const submitBtn = document.getElementById("submit-btn");
const messageSlot = document.getElementById("form-message");

function showMessage(text, isError) {
  messageSlot.innerHTML = `<p class="auth-message ${isError ? "is-error" : "is-success"}">${text}</p>`;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  submitBtn.disabled = true;
  messageSlot.innerHTML = "";

  const { error } = await signIn(email, password);

  submitBtn.disabled = false;

  if (error) {
    showMessage(error.message, true);
    return;
  }

  window.location.href = "index.html";
});

// If already logged in, skip straight past the login form.
(async () => {
  const user = await getCurrentUser();
  if (user) {
    window.location.href = "index.html";
  }
})();
