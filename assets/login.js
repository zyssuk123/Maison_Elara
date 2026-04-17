const LOGIN_API_BASE = "/api";

function normalizeLoggedInUser(payload) {
  return payload?.user || payload?.admin || null;
}

async function login() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  const errorElement = document.getElementById("error");

  errorElement.style.display = "none";

  try {
    const response = await fetch(`${LOGIN_API_BASE}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Invalid credentials");
    }

    const loggedInUser = normalizeLoggedInUser(data);
    if (!loggedInUser) {
      throw new Error("Login response is missing user information");
    }

    localStorage.setItem("maison_user", JSON.stringify(loggedInUser));
    localStorage.setItem("maison_auth_token", data.token);

    if (loggedInUser.role === "admin") {
      sessionStorage.setItem("maison_admin", JSON.stringify(loggedInUser));
      sessionStorage.setItem("maison_admin_token", data.token);
    } else {
      sessionStorage.removeItem("maison_admin");
      sessionStorage.removeItem("maison_admin_token");
    }

    window.location.href = "index.html";
  } catch (error) {
    errorElement.textContent = error.message;
    errorElement.style.display = "block";
  }
}

try {
  const existingUser = JSON.parse(localStorage.getItem("maison_user") || "null");
  if (existingUser && typeof existingUser === "object") {
    window.location.href = "index.html";
  }
} catch (error) {
  localStorage.removeItem("maison_user");
  localStorage.removeItem("maison_auth_token");
}

window.login = login;
