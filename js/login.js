function togglePassword(id) {
  const input = document.getElementById(id);
  input.type = input.type === "password" ? "text" : "password";
}

const form = document.getElementById("loginForm");
window.beginAuthWelcome?.();

async function redirectIfAlreadySignedIn() {
  const client = window.supabaseClient;
  if (!client?.auth) {
    document.body.classList.remove("login-auth-checking");
    return;
  }

  try {
    const {
      data: { user },
      error: userError,
    } = await client.auth.getUser();
    if (userError) throw userError;
    if (!user) {
      window.clearAuthWelcome?.();
      document.body.classList.remove("login-auth-checking");
      return;
    }

    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("role, status")
      .eq("id", user.id)
      .maybeSingle();
    if (profileError) throw profileError;

    if (!profile || String(profile.status || "").toLowerCase() !== "active") {
      await client.auth.signOut();
      window.clearAuthWelcome?.();
      document.body.classList.remove("login-auth-checking");
      return;
    }

    if (String(profile.role || "").toLowerCase() !== "parent") {
      await client.auth.signOut();
      window.clearAuthWelcome?.();
      document.body.classList.remove("login-auth-checking");
      return;
    }

    window.location.replace("/html/parent-dashboard.html");
    return;
  } catch (error) {
    console.warn("Could not restore the signed-in user's role:", error);
  }

  window.clearAuthWelcome?.();
  document.body.classList.remove("login-auth-checking");
}

redirectIfAlreadySignedIn();

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const loginButton = form.querySelector(".login-btn");

  loginButton.disabled = true;
  loginButton.textContent = "Signing In...";

  try {
    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value;

    const { data, error } = await window.supabaseClient.auth.signInWithPassword(
      {
        email,
        password,
      },
    );

    if (error) {
      throw error;
    }

    const {
      data: { session },
    } = await window.supabaseClient.auth.getSession();

    if (!session) {
      throw new Error("No session found.");
    }

    const { data: profile, error: profileError } = await window.supabaseClient
      .from("profiles")
      .select("*")
      .eq("id", data.user.id)
      .maybeSingle();

    if (profileError) {
      console.error(profileError);
      throw new Error(profileError.message || "Failed to fetch user profile.");
    }

    if (!profile) {
      await window.supabaseClient.auth.signOut();
      throw new Error(
        "We couldn't load your parent profile. Contact your school if you need help with your account.",
      );
    }

    if (profile.status !== "active") {
      await window.supabaseClient.auth.signOut();
      throw new Error(
        "Your account has been deactivated. Contact the system administrator.",
      );
    }

    if (String(profile.role || "").toLowerCase() !== "parent") {
      await window.supabaseClient.auth.signOut();
      throw new Error("This sign-in is for parent accounts. Contact your school for help.");
    }

    window.beginAuthWelcome?.();
    document.body.classList.add("login-auth-checking");
    showToast("Login successful!", "success");

    setTimeout(() => {
      window.location.replace("/html/parent-dashboard.html");
    }, 800);
  } catch (err) {
    showToast(err.message, "error");
    console.error(err);
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "Login";
  }
});
