const parentAnnouncementStudentKey = "tHubParentSelectedStudentId";
let parentAnnouncementRequestId = 0;

document.addEventListener("DOMContentLoaded", loadParentAnnouncementsPage);

async function loadParentAnnouncementsPage() {
  const container = document.getElementById("parentAnnouncements");
  const summary = document.getElementById("announcementStudentSummary");
  const emptyState = document.getElementById("announcementsEmptyState");
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

    const studentId = sessionStorage.getItem(parentAnnouncementStudentKey);
    if (!studentId) {
      summary.hidden = true;
      container.hidden = true;
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
      sessionStorage.removeItem(parentAnnouncementStudentKey);
      summary.hidden = true;
      container.hidden = true;
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

    renderAnnouncementStudent(student);
    await loadStudentAnnouncements(client, student);
  } catch (error) {
    console.error("Could not load parent announcements:", error);
    if (container) {
      container.replaceChildren();
      const message = document.createElement("p");
      message.className = "parent-state is-error";
      message.textContent = "Announcements could not be loaded. Return to Academics and try again.";
      container.append(message);
    }
  } finally {
    document.body.classList.remove("parent-auth-checking");
    document.querySelector(".parent-auth-loading")?.remove();
    document.documentElement.style.visibility = "";
  }
}

function renderAnnouncementStudent(student) {
  const name = student.profiles?.full_name || "Student";
  document.getElementById("announcementStudentName").textContent = name;
  document.getElementById("announcementStudentDetails").textContent =
    `Student ID: ${student.student_id || "Not assigned"} · Class: ${student.classes?.name || "Not assigned"} · School: ${student.schools?.school_name || "Not available"}`;

  const initials = document.getElementById("announcementStudentInitials");
  initials.textContent = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "S";
  const photo = document.getElementById("announcementStudentPhoto");
  photo.alt = `${name} photo`;
  const photoUrl = student.profiles?.photo_url;
  if (!photoUrl) return;
  try {
    const parsed = new URL(photoUrl, window.location.href);
    if (["https:", "http:"].includes(parsed.protocol)) {
      photo.src = parsed.href;
      photo.hidden = false;
      initials.hidden = true;
    }
  } catch {
    photo.hidden = true;
  }
  photo.onerror = () => {
    photo.hidden = true;
    initials.hidden = false;
  };
}

async function loadStudentAnnouncements(client, student) {
  const container = document.getElementById("parentAnnouncements");
  const requestId = ++parentAnnouncementRequestId;
  container.setAttribute("aria-busy", "true");
  try {
    const { data: enrollments, error: enrollmentError } = await client
      .from("student_enrollments")
      .select("enrollment_status")
      .eq("student_id", student.id)
      .eq("school_id", student.school_id);
    if (enrollmentError) throw enrollmentError;
    if (requestId !== parentAnnouncementRequestId) return;

    const hasTerminalEnrollment = (enrollments || []).some((enrollment) =>
      ["graduated", "transferred"].includes(
        String(enrollment.enrollment_status || "").trim().toLowerCase(),
      ),
    );
    if (hasTerminalEnrollment) {
      showAnnouncementMessage("Announcements are unavailable because this student’s enrollment at this school is marked graduated or transferred.");
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await client
      .from("announcements")
      .select("id, title, message, status, target_audience, expiry_date, created_at")
      .eq("school_id", student.school_id)
      .or(`expiry_date.is.null,expiry_date.gte.${today}`)
      .order("created_at", { ascending: false });
    if (error) throw error;
    if (requestId !== parentAnnouncementRequestId) return;

    const visible = (data || []).filter(isParentAnnouncementVisible);
    if (!visible.length) {
      showAnnouncementMessage("There are no current announcements for this student.");
      return;
    }

    container.replaceChildren(...visible.map((announcement) => {
      const article = document.createElement("article");
      article.className = "parent-announcement";
      article.dataset.status = ["Important", "Urgent"].includes(announcement.status)
        ? announcement.status
        : "Normal";
      const title = document.createElement("h3");
      title.textContent = announcement.title || "Announcement";
      const message = document.createElement("p");
      message.textContent = announcement.message || "";
      const meta = document.createElement("div");
      meta.className = "parent-announcement-meta";
      meta.textContent = `${announcement.status || "Normal"} · ${announcement.created_at ? new Date(announcement.created_at).toLocaleDateString() : ""}`;
      article.append(title, message, meta);
      return article;
    }));
  } catch (error) {
    console.error("Could not load student announcements:", error);
    showAnnouncementMessage("Announcements could not be loaded. Refresh and try again.", true);
  } finally {
    if (requestId === parentAnnouncementRequestId) {
      container.setAttribute("aria-busy", "false");
    }
  }
}

function showAnnouncementMessage(text, isError = false) {
  const container = document.getElementById("parentAnnouncements");
  const message = document.createElement("p");
  message.className = isError ? "parent-state is-error" : "parent-state";
  message.textContent = text;
  container.replaceChildren(message);
}

function isParentAnnouncementVisible(announcement) {
  const audiences = String(announcement?.target_audience || "")
    .split(",")
    .map((item) => item.trim().toLowerCase().replace(/s$/, ""));
  return audiences.some((audience) =>
    ["all", "everyone", "student", "parent"].includes(audience),
  );
}
