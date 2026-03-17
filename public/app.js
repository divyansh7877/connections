const appRoot = document.querySelector("#app");
const landingTemplate = document.querySelector("#landing-template");
const roomTemplate = document.querySelector("#room-template");
const POLL_INTERVAL_MS = 5000;

const state = {
  room: null,
  joinUrl: "",
  qrImageUrl: "",
  feedback: "",
  error: "",
  pollTimer: null
};

function getRoomCodeFromPath() {
  const match = window.location.pathname.match(/^\/rooms\/([A-Z0-9]+)$/);
  return match ? match[1] : null;
}

function memberStorageKey(code) {
  return `connections-room-member:${code}`;
}

function setFeedback(message, isError = false) {
  state.feedback = message;
  state.error = isError ? message : "";
  const feedbackNode = document.querySelector("#form-feedback");
  if (feedbackNode) {
    feedbackNode.textContent = message;
    feedbackNode.dataset.error = isError ? "true" : "false";
  }
}

function clearFeedback() {
  setFeedback("", false);
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options
  });

  if (response.status === 204) {
    return null;
  }

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }
  return payload;
}

function stopPolling() {
  if (state.pollTimer) {
    window.clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

function ensurePolling(code) {
  stopPolling();
  state.pollTimer = window.setInterval(() => {
    loadRoom(code, { silent: true }).catch(() => {});
  }, POLL_INTERVAL_MS);
}

function formatExpiry(expiresAt) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) {
    return "Expired";
  }

  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) {
    return `Expires in ${minutes} min`;
  }

  return `Expires in ${hours}h ${minutes}m`;
}

function currentMemberId(code) {
  return window.localStorage.getItem(memberStorageKey(code));
}

function setCurrentMemberId(code, memberId) {
  window.localStorage.setItem(memberStorageKey(code), memberId);
}

function clearCurrentMemberId(code) {
  window.localStorage.removeItem(memberStorageKey(code));
}

function getCurrentMember(room) {
  const memberId = currentMemberId(room.code);
  if (!memberId) {
    return null;
  }

  return room.members.find((member) => member.id === memberId) || null;
}

function renderLanding() {
  stopPolling();
  appRoot.innerHTML = "";
  appRoot.appendChild(landingTemplate.content.cloneNode(true));

  document.querySelector("#create-room-button").addEventListener("click", async () => {
    const button = document.querySelector("#create-room-button");
    button.disabled = true;
    button.textContent = "Creating...";

    try {
      const payload = await apiRequest("/api/rooms", { method: "POST", body: "{}" });
      window.history.pushState({}, "", `/rooms/${payload.room.code}`);
      await loadRoom(payload.room.code);
    } catch (error) {
      button.disabled = false;
      button.textContent = "Create event room";
      appRoot.insertAdjacentHTML(
        "beforeend",
        `<section class="panel panel-secondary"><p class="error-banner">${error.message}</p></section>`
      );
    }
  });
}

function renderMembers(room) {
  const membersList = document.querySelector("#members-list");
  const currentMember = getCurrentMember(room);

  if (room.members.length === 0) {
    membersList.innerHTML = `<article class="member-card member-card-empty"><p>No one has joined yet. Share the QR and start the list.</p></article>`;
    return;
  }

  membersList.innerHTML = room.members
    .slice()
    .sort((a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime())
    .map((member) => {
      const isYou = currentMember && currentMember.id === member.id;
      return `
        <article class="member-card ${isYou ? "member-card-current" : ""}">
          <div class="member-meta">
            <p class="member-name">${member.displayName}${isYou ? " <span class=\"member-tag\">You</span>" : ""}</p>
            <p class="member-time">Joined ${new Date(member.joinedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
          </div>
          <a class="button button-secondary member-link" href="${member.linkedinUrl}" target="_blank" rel="noreferrer">
            Open LinkedIn
          </a>
        </article>
      `;
    })
    .join("");
}

function bindRoomActions(roomCode) {
  document.querySelector("#refresh-room-button").addEventListener("click", async () => {
    await loadRoom(roomCode);
  });

  document.querySelector("#new-room-button").addEventListener("click", () => {
    window.history.pushState({}, "", "/");
    renderLanding();
  });

  document.querySelector("#copy-link-button").addEventListener("click", async () => {
    const joinLink = document.querySelector("#join-link").value;
    await navigator.clipboard.writeText(joinLink);
    setFeedback("Room link copied.");
  });

  document.querySelector("#share-link-button").addEventListener("click", async () => {
    const joinLink = document.querySelector("#join-link").value;
    if (navigator.share) {
      await navigator.share({
        title: `Join room ${roomCode}`,
        text: "Join this Connections room and add your LinkedIn profile.",
        url: joinLink
      });
      setFeedback("Share sheet opened.");
      return;
    }

    await navigator.clipboard.writeText(joinLink);
    setFeedback("Share is not available here, so the link was copied instead.");
  });

  document.querySelector("#join-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFeedback();

    const formData = new FormData(event.currentTarget);
    const payload = {
      displayName: formData.get("displayName"),
      linkedinUrl: formData.get("linkedinUrl")
    };

    const submitButton = event.currentTarget.querySelector("button[type='submit']");
    submitButton.disabled = true;
    submitButton.textContent = "Joining...";

    try {
      const response = await apiRequest(`/api/rooms/${roomCode}/members`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setCurrentMemberId(roomCode, response.member.id);
      setFeedback("You’ve been added to the room.");
      await loadRoom(roomCode, { silent: true });
    } catch (error) {
      setFeedback(error.message, true);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Join room";
    }
  });

  document.querySelector("#remove-me-button").addEventListener("click", async () => {
    const memberId = currentMemberId(roomCode);
    if (!memberId) {
      return;
    }

    try {
      await apiRequest(`/api/rooms/${roomCode}/members/${memberId}`, { method: "DELETE" });
      clearCurrentMemberId(roomCode);
      setFeedback("Your entry was removed.");
      await loadRoom(roomCode, { silent: true });
    } catch (error) {
      setFeedback(error.message, true);
    }
  });
}

function renderRoom(room, joinUrl, qrImageUrl) {
  appRoot.innerHTML = "";
  appRoot.appendChild(roomTemplate.content.cloneNode(true));

  const currentMember = getCurrentMember(room);
  const isActive = room.status === "active";

  document.querySelector("#room-title").textContent = `Room ${room.code}`;
  document.querySelector("#room-code-badge").textContent = room.code;
  document.querySelector("#room-members-badge").textContent = `${room.members.length} member${room.members.length === 1 ? "" : "s"}`;
  document.querySelector("#room-status").textContent = isActive
    ? `${formatExpiry(room.expiresAt)} • Open to anyone with the link`
    : "Room expired";
  document.querySelector("#join-link").value = joinUrl;
  document.querySelector("#qr-image").src = qrImageUrl;
  document.querySelector("#qr-image").referrerPolicy = "no-referrer";

  document.querySelector("#joined-state").classList.toggle("hidden", !currentMember || !isActive);
  document.querySelector("#join-form").classList.toggle("hidden", Boolean(currentMember) || !isActive);
  document.querySelector("#room-expired").classList.toggle("hidden", isActive);

  if (currentMember) {
    document.querySelector("#display-name").value = currentMember.displayName;
    document.querySelector("#linkedin-url").value = currentMember.linkedinUrl;
  }

  renderMembers(room);
  bindRoomActions(room.code);

  if (state.feedback) {
    setFeedback(state.feedback, Boolean(state.error));
  }
}

async function loadRoom(code, { silent = false } = {}) {
  const payload = await apiRequest(`/api/rooms/${code}`);
  state.room = payload.room;
  state.joinUrl = payload.joinUrl;
  state.qrImageUrl = payload.qrImageUrl;

  const currentMember = getCurrentMember(payload.room);
  if (!currentMember && currentMemberId(code)) {
    clearCurrentMemberId(code);
  }

  renderRoom(payload.room, payload.joinUrl, payload.qrImageUrl);
  ensurePolling(code);

  if (!silent) {
    clearFeedback();
  }
}

function bootstrap() {
  const roomCode = getRoomCodeFromPath();
  if (!roomCode) {
    renderLanding();
    return;
  }

  loadRoom(roomCode).catch((error) => {
    appRoot.innerHTML = `
      <section class="panel panel-main">
        <p class="error-banner">${error.message}</p>
        <button id="back-home-button" class="button button-primary" type="button">Create a new room</button>
      </section>
    `;
    document.querySelector("#back-home-button").addEventListener("click", () => {
      window.history.pushState({}, "", "/");
      renderLanding();
    });
  });
}

window.addEventListener("popstate", bootstrap);
window.addEventListener("beforeunload", stopPolling);

bootstrap();
