function togglePassword(id) {
  const input = document.getElementById(id);
  input.type = input.type === "password" ? "text" : "password";
}

const form = document.getElementById("loginForm");
window.beginAuthWelcome?.();

function isActiveParentProfile(profile) {
  return (
    String(profile?.role || "").trim().toLowerCase() === "parent" &&
    String(profile?.status || "").trim().toLowerCase() === "active"
  );
}

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

    if (!isActiveParentProfile(profile)) {
      await client.auth.signOut();
      window.clearAuthWelcome?.();
      document.body.classList.remove("login-auth-checking");
      return;
    }

    window.location.replace("/html/parent-dashboard.html");
    return;
  } catch (error) {
    console.warn("Could not restore the signed-in user's role:", error);
    await client.auth.signOut();
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
      error: sessionError,
    } = await window.supabaseClient.auth.getSession();

    if (sessionError || !session) {
      await window.supabaseClient.auth.signOut();
      throw sessionError || new Error("No session found.");
    }

    const { data: profile, error: profileError } = await window.supabaseClient
      .from("profiles")
      .select("role, status")
      .eq("id", data.user.id)
      .maybeSingle();

    if (profileError) {
      console.error(profileError);
      await window.supabaseClient.auth.signOut();
      throw new Error(profileError.message || "Failed to fetch user profile.");
    }

    if (!profile || String(profile.role || "").toLowerCase() !== "parent") {
      await window.supabaseClient.auth.signOut();
      throw new Error(
        "This sign-in is for parent accounts. Contact your school for help.",
      );
    }

    if (String(profile.status || "").trim().toLowerCase() !== "active") {
      await window.supabaseClient.auth.signOut();
      throw new Error(
        "Your account has been deactivated. Contact the system administrator.",
      );
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
