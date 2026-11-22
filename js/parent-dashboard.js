const selectedParentStudentStorageKey = "tHubParentSelectedStudentId";
const parentDashboardCachePrefix = "tHubParentDashboardCache:";

document.addEventListener("DOMContentLoaded", loadParentDashboard);

async function loadParentDashboard() {
  document.getElementById("parentRefresh")?.addEventListener("click", () => {
    window.location.reload();
  });
  const container = document.getElementById("parentChildren");
  const client = window.supabaseClient;
  if (!container || !client) return;

  try {
    const {
      data: { session },
      error: sessionError,
    } = await client.auth.getSession();
    const user = session?.user;
    if (sessionError || !user) {
      window.location.replace("/index.html");
      return;
    }

    const cacheKey = `${parentDashboardCachePrefix}${user.id}`;
    const cachedDashboard = readParentDashboardCache(cacheKey, user.id);
    if (cachedDashboard) {
      window.renderParentPortalProfile(cachedDashboard.profile, user);
      if (cachedDashboard.children.length) {
        renderParentChildren(cachedDashboard.children, cacheKey);
        selectParentStudent(
          findPreferredStudent(cachedDashboard.children, cachedDashboard.selectedStudentId),
          cacheKey,
        );
      } else {
        renderNoLinkedStudents(container);
      }
      container.setAttribute("aria-busy", "false");
    } else {
      container.innerHTML = '<p class="parent-state">Checking your linked students…</p>';
    }

    // Keep the current list visible while Supabase verifies access and refreshes it.
    void refreshParentDashboard(user, container, cacheKey, cachedDashboard);
  } catch (error) {
    console.error("Could not check the parent session:", error);
    window.location.replace("/index.html");
  }
}

async function refreshParentDashboard(user, container, cacheKey, cachedDashboard) {
  const client = window.supabaseClient;
  try {
    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError || !authData?.user || authData.user.id !== user.id) {
      window.location.replace("/index.html");
      return;
    }

    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("id, full_name, role, status, photo_url")
      .eq("id", user.id)
      .single();

    window.renderParentPortalProfile(profile, user);

    if (profileError) throw profileError;
    if (
      profile.role !== "parent" ||
      String(profile.status).toLowerCase() !== "active"
    ) {
      localStorage.removeItem(cacheKey);
      await client.auth.signOut();
      window.location.replace("/index.html");
      return;
    }

    const { data: links, error: linksError } = await client
      .from("parent_student_links")
      .select("student_id, relationship")
      .eq("parent_user_id", user.id)
      .eq("status", "active");
    if (linksError) throw linksError;

    const studentIds = [...new Set((links || []).map((link) => link.student_id))];
    let children = [];
    if (studentIds.length) {
      const { data: students, error: studentsError } = await client
        .from("students")
        .select(
          "id, student_id, school_id, class_id, classes:class_id(name), schools:school_id(school_name), profiles(full_name, photo_url)",
        )
        .in("id", studentIds);
      if (studentsError) throw studentsError;

      const relationshipByStudent = new Map(
        (links || []).map((link) => [link.student_id, link.relationship]),
      );
      children = (students || [])
        .map((student) => ({
          ...student,
          relationship:
            relationshipByStudent.get(student.id) || "Parent/guardian",
          fullName: student.profiles?.full_name || "Student",
          photoUrl: student.profiles?.photo_url || "",
        }))
        .sort((a, b) => a.fullName.localeCompare(b.fullName));
    }

    const preferredStudent = findPreferredStudent(
      children,
      sessionStorage.getItem(selectedParentStudentStorageKey) ||
        cachedDashboard?.selectedStudentId,
    );
    const dashboardCache = {
      updatedAt: Date.now(),
      profile: {
        full_name: profile.full_name || "Parent",
        photo_url: profile.photo_url || "",
      },
      children,
      selectedStudentId: preferredStudent?.id || null,
    };
    try {
      localStorage.setItem(cacheKey, JSON.stringify(dashboardCache));
    } catch (storageError) {
      console.warn("Could not cache the parent dashboard:", storageError);
    }

    window.renderParentPortalProfile(profile, user);
    if (children.length) {
      renderParentChildren(children, cacheKey);
      selectParentStudent(preferredStudent, cacheKey);
    } else {
      renderNoLinkedStudents(container);
    }
    container.setAttribute("aria-busy", "false");
  } catch (error) {
    console.error("Could not load parent dashboard:", error);
    if (!cachedDashboard) {
      container.innerHTML =
        '<p class="parent-state">The dashboard could not load. Refresh the page or contact the school.</p>';
      container.setAttribute("aria-busy", "false");
    }
  }
}

function readParentDashboardCache(cacheKey, userId) {
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
    if (
      cached &&
      cached.profile &&
      Array.isArray(cached.children) &&
      cached.children.every((child) => child && child.id)
    ) {
      return cached;
    }
  } catch (error) {
    console.warn(`Could not read the cached dashboard for ${userId}:`, error);
  }
  return null;
}

function findPreferredStudent(children, studentId) {
  return children.find((child) => child.id === studentId) || children[0] || null;
}

function renderNoLinkedStudents(container) {
  container.innerHTML = `
    <div class="empty-state-wrapper d-flex justify-content-center align-items-center w-100 py-7">
      <div class="empty-state-card text-center p-7 my-7">
        <div class="icon-wrapper mb-7"><i class="fa-solid fa-user-slash fa-2x"></i></div>
        <h5 class="fw-semibold text-dark mb-2">No Students Linked</h5>
        <p class="parent-state text-muted mb-0">No students are linked to this account yet. Contact the school that invited you.</p>
      </div>
    </div>`;
  sessionStorage.removeItem(selectedParentStudentStorageKey);
}

const DEFAULT_PARENT_PORTAL_AVATAR =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128' width='128' height='128'><circle cx='64' cy='64' r='64' fill='%23E4E6EB'/><circle cx='64' cy='46' r='22' fill='%23B0B3B8'/><path d='M24 112c0-22 18-40 40-40s40 18 40 40' fill='%23B0B3B8'/></svg>";

window.renderParentPortalProfile = function (profile, authUser) {
  const name = String(
    profile?.full_name || authUser?.user_metadata?.full_name || "Parent",
  );
  const welcomeNameElement = document.getElementById("parentName");

  if (welcomeNameElement) welcomeNameElement.textContent = name;

  const avatarShell = document.getElementById("parentPhoto");
  const avatar = avatarShell?.querySelector(".parent-avatar");
  const initials = avatarShell?.querySelector(".parent-avatar-initials");

  const computedInitials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "P";

  if (initials) {
    initials.textContent = computedInitials;
    initials.style.display = "flex";
  }

  if (!avatar) return;

  avatar.alt = `${name} profile photo`;

  const photoUrl = profile?.photo_url;
  if (photoUrl) {
    try {
      const parsedPhotoUrl = new URL(photoUrl, window.location.href);
      if (["https:", "http:"].includes(parsedPhotoUrl.protocol)) {
        avatar.src = parsedPhotoUrl.href;
        avatar.hidden = false;
        if (initials) initials.style.display = "none";
      }
    } catch {
      avatar.hidden = true;
      avatar.src = DEFAULT_PARENT_PORTAL_AVATAR;
    }
  } else {
    avatar.hidden = true;
    avatar.src = DEFAULT_PARENT_PORTAL_AVATAR;
  }

  avatar.onerror = () => {
    avatar.onerror = null;
    avatar.hidden = true;
    if (initials) initials.style.display = "flex";
  };
};

function renderParentChildren(children, cacheKey) {
  const container = document.getElementById("parentChildren");
  container.innerHTML = children
    .map(
      (child) => `
    <article class="parent-child-card" data-student-id="${escapeParentPortal(child.id)}">
      <span class="parent-student-avatar-shell" data-student-avatar aria-hidden="true">
        <img class="parent-student-avatar" alt="" />
        <span class="parent-student-avatar-initials"></span>
      </span>
      <div class="parent-child-info">
        <strong>${escapeParentPortal(child.fullName)}</strong>
        <span>Student ID: ${escapeParentPortal(child.student_id || "Not assigned")}</span>
        <span>Class: ${escapeParentPortal(child.classes?.name || "Not assigned")}</span>
        <span>School: ${escapeParentPortal(child.schools?.school_name || "Not available")}</span>
      </div>
      <button type="button" data-select-student="${escapeParentPortal(child.id)}" aria-pressed="false">Select student</button>
    </article>
  `,
    )
    .join("");

  container.querySelectorAll("[data-student-avatar]").forEach((image) => {
    const child = children.find(
      (item) =>
        item.id === image.closest("[data-student-id]")?.dataset.studentId,
    );
    setParentStudentPhoto(image, child?.photoUrl, child?.fullName || "Student");
  });

  container.querySelectorAll("[data-select-student]").forEach((button) => {
    button.addEventListener("click", () => {
      const selected = children.find(
        (child) => child.id === button.dataset.selectStudent,
      );
      if (selected) selectParentStudent(selected, cacheKey);
    });
  });
}

function selectParentStudent(student, cacheKey) {
  if (!student) return;
  sessionStorage.setItem(selectedParentStudentStorageKey, student.id);
  if (cacheKey) {
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
      if (cached) {
        cached.selectedStudentId = student.id;
        localStorage.setItem(cacheKey, JSON.stringify(cached));
      }
    } catch (error) {
      console.warn("Could not save the selected student:", error);
    }
  }
  document.querySelectorAll(".parent-child-card").forEach((card) => {
    const selected = card.dataset.studentId === student.id;
    card.classList.toggle("is-selected", selected);
    card
      .querySelector("button")
      ?.setAttribute("aria-pressed", String(selected));
    if (card.querySelector("button"))
      card.querySelector("button").textContent = selected
        ? "Selected"
        : "Select student";
  });
}

function setParentStudentPhoto(shell, photoUrl, name) {
  if (!shell) return;
  const image = shell.querySelector("img");
  const initials = shell.querySelector(".parent-student-avatar-initials");
  const firstLetters = String(name || "Student")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  if (initials) initials.textContent = firstLetters || "S";
  if (!image) return;
  image.alt = `${name || "Student"} photo`;
  image.hidden = true;
  image.removeAttribute("src");
  if (photoUrl) {
    try {
      const parsedPhotoUrl = new URL(photoUrl, window.location.href);
      if (["https:", "http:"].includes(parsedPhotoUrl.protocol)) {
        image.src = parsedPhotoUrl.href;
        image.hidden = false;
      }
    } catch {
    }
  }
  image.onerror = () => {
    image.onerror = null;
    image.hidden = true;
    image.removeAttribute("src");
  };
}

function escapeParentPortal(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );
}
