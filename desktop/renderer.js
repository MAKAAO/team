import {
  setupRemoteControlRender,
  setupScreenSharingRender
} from "@jitsi/electron-sdk/renderer";

const byId = id => document.getElementById(id);
const roleSelect = byId("role");
const status = byId("status");
let token = null;
let role = "staff";
let api = null;
let meetingServer = "https://meet.jit.si";

roleSelect.addEventListener("change", () => {
  const admin = roleSelect.value === "admin";
  byId("staffFields").classList.toggle("hidden", admin);
  byId("adminFields").classList.toggle("hidden", !admin);
});

async function apiCall(path, method, body) {
  const base = byId("server").value.trim().replace(/\/+$/, "");
  if (!base.startsWith("https://")) throw new Error("Team API must use HTTPS.");
  const response = await fetch(base + path, {
    method,
    headers: Object.assign(
      { "Content-Type": "application/json" },
      token ? { Authorization: "Bearer " + token } : {}
    ),
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

byId("connect").addEventListener("click", async () => {
  role = roleSelect.value;
  meetingServer = byId("jitsi").value.trim().replace(/\/+$/, "");
  if (!meetingServer.startsWith("https://")) { status.textContent = "Meeting server must use HTTPS."; return; }
  try {
    status.textContent = "Connecting…";
    let data;
    if (role === "admin") {
      data = await apiCall("/api/login", "POST", {
        email: byId("email").value.trim(),
        password: byId("password").value,
        role: "admin"
      });
    } else {
      data = await apiCall("/api/pair", "POST", {
        displayName: byId("name").value.trim(),
        code: byId("pairCode").value.trim().toUpperCase()
      });
    }
    token = data.token;
    byId("connectCard").classList.add("hidden");
    byId("roomCard").classList.remove("hidden");
    byId("adminRoomControls").classList.toggle("hidden", role !== "admin");
    byId("staffRoomControls").classList.toggle("hidden", role !== "staff");
    status.textContent = "Securely connected.";
  } catch (error) {
    status.textContent = error.message;
  }
});

byId("createRoom").addEventListener("click", async () => {
  try {
    const data = await apiCall("/api/meetings", "POST", {});
    byId("roomCode").textContent = "MEETING CODE: " + data.roomCode;
    await launchMeeting(data.roomCode);
  } catch (error) { status.textContent = error.message; }
});

byId("joinRoom").addEventListener("click", async () => {
  try {
    const data = await apiCall("/api/meetings/join", "POST", { roomCode: byId("joinCode").value.trim() });
    await launchMeeting(data.roomCode);
  } catch (error) { status.textContent = error.message; }
});

async function launchMeeting(roomCode) {
  byId("meeting").style.display = "block";
  status.textContent = "Opening call. Screen share is started only when selected in the meeting controls.";
  const script = document.createElement("script");
  script.src = meetingServer + "/external_api.js";
  script.onload = () => {
    const roomName = "aao-team-" + roomCode.toLowerCase();
    api = new window.JitsiMeetExternalAPI(meetingServer.replace(/^https:\/\//, ""), {
      roomName,
      parentNode: byId("meeting"),
      userInfo: { displayName: role === "admin" ? "Team Admin" : (byId("name").value.trim() || "Staff") },
      configOverwrite: { prejoinPageEnabled: true },
      interfaceConfigOverwrite: { DEFAULT_BACKGROUND: "#152442" }
    });
    setupScreenSharingRender(api);
    setupRemoteControlRender(api);
    api.addListener("readyToClose", () => {
      byId("meeting").replaceChildren();
      byId("meeting").style.display = "none";
      status.textContent = "Meeting ended.";
      api = null;
    });
  };
  script.onerror = () => { status.textContent = "Could not load the meeting server."; };
  document.head.appendChild(script);
}

byId("leave").addEventListener("click", () => {
  if (api) api.dispose();
  token = null;
  byId("roomCard").classList.add("hidden");
  byId("connectCard").classList.remove("hidden");
  status.textContent = "Signed out.";
});
