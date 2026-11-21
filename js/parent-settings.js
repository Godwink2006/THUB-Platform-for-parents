document.addEventListener("DOMContentLoaded", loadParentSettings);

async function loadParentSettings() {
  try {
    const client = window.supabaseClient;
    if (!client) throw new Error("The parent portal could not connect.");
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError || !authData?.user) {
      window.location.replace("/index.html");
      return;
    }

    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("role, status")
      .eq("id", authData.user.id)
      .single();
    if (profileError) throw profileError;
    if (
      String(profile?.role || "").toLowerCase() !== "parent" ||
      String(profile?.status || "").toLowerCase() !== "active"
    ) {
      await client.auth.signOut();
      window.location.replace("/index.html");
      return;
    }

    await window.initPushNotificationSetup?.({
      buttonId: "parentPushToggle",
      statusId: "parentPushStatus",
    });
  } catch (error) {
    console.error("Could not load parent settings:", error);
    const status = document.getElementById("parentPushStatus");
    if (status) status.textContent = "Settings could not be loaded. Refresh and try again.";
  } finally {
    document.body.classList.remove("parent-auth-checking");
    document.querySelector(".parent-auth-loading")?.remove();
    document.documentElement.style.visibility = "";
  }
}
