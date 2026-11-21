const parentAcademicsStudentKey = "tHubParentSelectedStudentId";

document.addEventListener("DOMContentLoaded", loadParentAcademicsPage);

async function loadParentAcademicsPage() {
  const summary = document.getElementById("academicsStudentSummary");
  const cards = document.getElementById("academicsRecordCards");
  const emptyState = document.getElementById("academicsEmptyState");
  const client = window.supabaseClient;
  if (!summary || !cards || !emptyState || !client) return;

  try {
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

    const studentId = sessionStorage.getItem(parentAcademicsStudentKey);
    if (!studentId) {
      summary.hidden = true;
      cards.hidden = true;
      emptyState.hidden = false;
      return;
    }

    const { data: link, error: linkError } = await client
      .from("parent_student_links")
      .select("student_id")
      .eq("parent_user_id", authData.user.id)
      .eq("student_id", studentId)
      .eq("status", "active")
      .maybeSingle();
    if (linkError) throw linkError;
    if (!link) {
      sessionStorage.removeItem(parentAcademicsStudentKey);
      summary.hidden = true;
      cards.hidden = true;
      emptyState.hidden = false;
      return;
    }

    const { data: student, error: studentError } = await client
      .from("students")
      .select("id, student_id, school_id, class_id, classes:class_id(name), schools:school_id(school_name), profiles(full_name, photo_url)")
      .eq("id", studentId)
      .maybeSingle();
    if (studentError) throw studentError;
    if (!student) throw new Error("The selected student record is unavailable.");

    const name = student.profiles?.full_name || "Student";
    document.getElementById("academicsStudentName").textContent = name;
    document.getElementById("academicsStudentDetails").textContent =
      `Student ID: ${student.student_id || "Not assigned"} · Class: ${student.classes?.name || "Not assigned"} · School: ${student.schools?.school_name || "Not available"}`;

    const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "S";
    document.getElementById("academicsStudentInitials").textContent = initials;
    const photo = document.getElementById("academicsStudentPhoto");
    photo.alt = `${name} photo`;
    const photoUrl = student.profiles?.photo_url;
    if (photoUrl) {
      try {
        const parsed = new URL(photoUrl, window.location.href);
        if (["https:", "http:"].includes(parsed.protocol)) {
          photo.src = parsed.href;
          photo.hidden = false;
          document.getElementById("academicsStudentInitials").hidden = true;
        }
      } catch {
        photo.hidden = true;
      }
    }
    photo.onerror = () => {
      photo.hidden = true;
      document.getElementById("academicsStudentInitials").hidden = false;
    };
  } catch (error) {
    console.error("Could not load academics page:", error);
    summary.hidden = true;
    cards.hidden = true;
    emptyState.hidden = false;
    emptyState.textContent = "Student records could not be loaded. Return to your dashboard and try again.";
  } finally {
    document.body.classList.remove("parent-auth-checking");
    document.querySelector(".parent-auth-loading")?.remove();
    document.documentElement.style.visibility = "";
  }
}
