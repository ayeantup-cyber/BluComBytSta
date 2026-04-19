// ===== BlueComet ByteStar v2 — app.js =====
// Split architecture:
//   - Sandbox, Snippets, AI, Settings = always work (static, no server needed)
//   - Live Chat = tries to connect to Socket.IO server (Pixel tunnel URL)
//   - If server unreachable → chat shows offline state, everything else runs fine

// ===== SETTINGS LOAD =====
function getSettings() {
  return JSON.parse(localStorage.getItem("bytestar_settings") || "{}");
}
function saveSettingsToStorage(obj) {
  localStorage.setItem("bytestar_settings", JSON.stringify(obj));
}

// ===== STATE =====
let socket = null;
let myCometNumber = null;
let myName = null;
let msgCount = 0;
let onlineUsers = {};
let snippets = {};
let activeSnippet = null;
let aiHistory = [];
let serverOnline = false;
let aiOnline = false;

// ===== DOM =====
const $ = id => document.getElementById(id);

const chatFeed      = $("chatFeed");
const chatInput     = $("chatInput");
const sendBtn       = $("sendBtn");
const clearBtn      = $("clearBtn");
const myBadge       = $("myBadge");
const msgCountEl    = $("msgCount");
const onlineCountEl = $("onlineCount");
const serverStatusEl= $("serverStatus");
const userListEl    = $("userList");
const serverBanner  = $("serverBanner");
const serverBannerTx= $("serverBannerText");
const retryBtn      = $("retryBtn");

const aiFeed        = $("aiFeed");
const aiInput       = $("aiInput");
const aiSendBtn     = $("aiSendBtn");
const aiThinking    = $("aiThinking");
const aiBanner      = $("aiBanner");
const aiBannerTx    = $("aiBannerText");

const sandboxInput  = $("sandboxInput");
const sandboxCode   = $("sandboxCode");
const langSelect    = $("langSelect");
const sandboxCopyBtn= $("sandboxCopyBtn");
const sandboxClearBtn=$("sandboxClearBtn");
const sandboxShareBtn=$("sandboxShareBtn");

const snippetsList  = $("snippetsList");
const snippetContent= $("snippetContent");
const snippetName   = $("snippetName");
const snippetSaveBtn= $("snippetSaveBtn");
const snippetDelBtn = $("snippetDeleteBtn");

const setDisplayName= $("setDisplayName");
const setApiKey     = $("setApiKey");
const setTunnelUrl  = $("setTunnelUrl");
const setSystemPrompt=$("setSystemPrompt");
const setSocketUrl  = $("setSocketUrl");
const saveSettingsBtn=$("saveSettingsBtn");
const settingsSaved = $("settingsSaved");

// ===== INIT SETTINGS UI =====
function initSettingsUI() {
  const s = getSettings();
  if (s.displayName) setDisplayName.value = s.displayName;
  if (s.apiKey)      setApiKey.value = s.apiKey;
  if (s.tunnelUrl)   setTunnelUrl.value = s.tunnelUrl;
  if (s.systemPrompt)setSystemPrompt.value = s.systemPrompt;
  if (s.socketUrl)   setSocketUrl.value = s.socketUrl;
  snippets = JSON.parse(localStorage.getItem("bytestar_snippets") || "{}");
  renderSnippetsList();
}

saveSettingsBtn.addEventListener("click", () => {
  const s = {
    displayName:  setDisplayName.value.trim(),
    apiKey:       setApiKey.value.trim(),
    tunnelUrl:    setTunnelUrl.value.trim().replace(/\/$/, ""),
    systemPrompt: setSystemPrompt.value.trim(),
    socketUrl:    setSocketUrl.value.trim().replace(/\/$/, "")
  };
  saveSettingsToStorage(s);
  myName = s.displayName || null;
  settingsSaved.style.display = "block";
  setTimeout(() => settingsSaved.style.display = "none", 2500);
  // Re-check AI banner
  checkAIStatus();
});

// ===== TABS =====
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    $(`panel-${btn.dataset.panel}`).classList.add("active");
  });
});

// ===== UTILITIES =====
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}

function formatMessage(text) {
  const parts = [];
  const re = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last)
      parts.push(`<span>${escapeHtml(text.slice(last, m.index)).replace(/\n/g,"<br>")}</span>`);
    const lang = m[1] || "plaintext";
    let hl;
    try { hl = window.hljs ? hljs.highlight(m[2], { language: lang, ignoreIllegals: true }).value : escapeHtml(m[2]); }
    catch(_) { hl = escapeHtml(m[2]); }
    parts.push(`<pre><code class="hljs language-${lang}">${hl}</code></pre>`);
    last = m.index + m[0].length;
  }
  if (last < text.length)
    parts.push(`<span>${escapeHtml(text.slice(last)).replace(/\n/g,"<br>")}</span>`);
  return parts.join("");
}

function getTime() {
  return new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
}

function createBubble(rawText, displayName, opts = {}, feed = chatFeed) {
  const { isOwn = false, isAI = false, isSys = false } = opts;
  const bubble = document.createElement("div");
  bubble.className = "msg-bubble" + (isOwn?" own":"") + (isAI?" ai":"") + (isSys?" sys":"");

  if (isSys) {
    bubble.innerHTML = `<div class="msg-username" style="font-size:.72rem;">${escapeHtml(rawText)}</div>`;
  } else {
    const hdr = document.createElement("div");
    hdr.className = "msg-header";

    const nm = document.createElement("span");
    nm.className = "msg-username";
    nm.textContent = displayName;

    const tm = document.createElement("span");
    tm.className = "msg-time";
    tm.textContent = getTime();

    const cp = document.createElement("button");
    cp.className = "copy-btn";
    cp.textContent = "📋";
    cp.onclick = () => navigator.clipboard.writeText(rawText).then(() => {
      cp.textContent = "✅"; setTimeout(() => cp.textContent = "📋", 1300);
    });

    hdr.append(nm, tm, cp);

    const body = document.createElement("div");
    body.className = "msg-body";
    body.innerHTML = formatMessage(rawText);

    bubble.append(hdr, body);
  }

  feed.appendChild(bubble);
  feed.scrollTop = feed.scrollHeight;
}

// ===== CHAT SERVER STATUS =====
function setServerOnline(online) {
  serverOnline = online;
  if (online) {
    serverBanner.className = "server-banner online";
    serverBannerTx.textContent = "⬤ Chat server connected";
    chatInput.disabled = false;
    sendBtn.disabled = false;
    serverStatusEl.textContent = "Online";
    serverStatusEl.className = "stat-val online-txt";
  } else {
    serverBanner.className = "server-banner offline";
    serverBannerTx.textContent = "⬤ Chat server offline — set tunnel URL in Settings";
    chatInput.disabled = true;
    sendBtn.disabled = true;
    serverStatusEl.textContent = "Offline";
    serverStatusEl.className = "stat-val offline-txt";
    userListEl.innerHTML = `<div class="offline-hint">No server connection</div>`;
    onlineCountEl.textContent = "—";
    myBadge.textContent = "⦿ offline";
  }
}

// ===== SOCKET.IO — DYNAMIC LOAD =====
function loadSocketIO(serverUrl, cb) {
  // Socket.IO client script lives on the server — load it dynamically
  const scriptUrl = `${serverUrl}/socket.io/socket.io.js`;
  const existing = document.querySelector(`script[src="${scriptUrl}"]`);
  if (existing) { cb(); return; }
  const script = document.createElement("script");
  script.src = scriptUrl;
  script.onload = cb;
  script.onerror = () => { setServerOnline(false); };
  document.head.appendChild(script);
}

function connectSocket() {
  const s = getSettings();
  const serverUrl = s.socketUrl || window.location.origin;

  loadSocketIO(serverUrl, () => {
    try {
      if (socket) { socket.disconnect(); socket = null; }

      socket = io(serverUrl, {
        transports: ["websocket", "polling"],
        timeout: 6000,
        reconnectionAttempts: 5
      });

      socket.on("connect", () => {
        const preferredName = s.displayName || null;
        socket.emit("join", { name: preferredName });
      });

      socket.on("assigned", ({ cometNumber, name }) => {
        myCometNumber = cometNumber;
        myName = name;
        myBadge.textContent = `⦿ ${name}`;
        setServerOnline(true);
      });

      socket.on("userList", (users) => {
        onlineUsers = users;
        renderUserList();
      });

      socket.on("chatMessage", (msg) => {
        if (!msg?.text || !msg?.user) return;
        if (msg.socketId !== socket.id) {
          createBubble(msg.text, msg.user, {}, chatFeed);
          msgCount++;
          msgCountEl.textContent = msgCount;
        }
      });

      socket.on("systemMsg", (text) => {
        createBubble(text, "", { isSys: true }, chatFeed);
      });

      socket.on("connect_error", () => setServerOnline(false));
      socket.on("disconnect", () => setServerOnline(false));

    } catch(e) {
      setServerOnline(false);
    }
  });
}

function renderUserList() {
  userListEl.innerHTML = "";
  const entries = Object.entries(onlineUsers);
  onlineCountEl.textContent = entries.length;
  entries.forEach(([id, info]) => {
    const isMe = socket && id === socket.id;
    const item = document.createElement("div");
    item.className = "user-item" + (isMe ? " me" : "");
    item.innerHTML = `<div class="user-dot"></div><span>${escapeHtml(info.name)}${isMe?" (you)":""}</span>`;
    userListEl.appendChild(item);
  });
}

retryBtn.addEventListener("click", connectSocket);

// ===== CHAT SEND =====
function sendChat() {
  if (!socket?.connected) return;
  const text = chatInput.value.trim();
  if (!text) return;
  const name = myName || `Comet ${myCometNumber}` || "Comet ?";
  createBubble(text, "You", { isOwn: true }, chatFeed);
  socket.emit("chatMessage", { user: name, text, socketId: socket.id });
  chatInput.value = "";
  msgCount++;
  msgCountEl.textContent = msgCount;
}
sendBtn.addEventListener("click", sendChat);
chatInput.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); }
});
clearBtn.addEventListener("click", () => {
  chatFeed.innerHTML = "";
  msgCount = 0;
  msgCountEl.textContent = 0;
});

// ===== AI STATUS CHECK =====
function checkAIStatus() {
  const s = getSettings();
  if (s.apiKey) {
    aiBanner.className = "server-banner online";
    aiBannerTx.textContent = "⬤ AI ready — using direct Claude API key";
    aiOnline = true;
  } else if (s.tunnelUrl) {
    aiBanner.className = "server-banner offline";
    aiBannerTx.textContent = "⬤ No API key set — add one in Settings to activate AI";
    aiOnline = false;
  } else {
    aiBanner.className = "server-banner offline";
    aiBannerTx.textContent = "⬤ AI offline — add Claude API key in Settings";
    aiOnline = false;
  }
}

// ===== AI SEND =====
async function sendAI() {
  const text = aiInput.value.trim();
  if (!text) return;

  const s = getSettings();
  if (!s.apiKey) {
    createBubble("⚠️ No API key. Go to Settings → Claude API Key.", "System", { isAI: true }, aiFeed);
    return;
  }

  createBubble(text, "You", { isOwn: true }, aiFeed);
  aiHistory.push({ role: "user", content: text });
  aiInput.value = "";
  aiThinking.classList.add("show");
  aiSendBtn.disabled = true;

  const systemPrompt = s.systemPrompt ||
    "You are a helpful assistant in the BlueComet ByteStar developer dashboard. Be concise and technical.";

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": s.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: systemPrompt,
        messages: aiHistory
      })
    });

    const data = await res.json();

    if (data.error) {
      createBubble(`API Error: ${data.error.message}`, "Error", { isAI: true }, aiFeed);
      aiHistory.pop();
    } else {
      const reply = data.content?.[0]?.text || "(empty response)";
      aiHistory.push({ role: "assistant", content: reply });
      createBubble(reply, "Claude ✦", { isAI: true }, aiFeed);
    }
  } catch(err) {
    createBubble(`Network error: ${err.message}`, "Error", { isAI: true }, aiFeed);
    aiHistory.pop();
  } finally {
    aiThinking.classList.remove("show");
    aiSendBtn.disabled = false;
  }
}

aiSendBtn.addEventListener("click", sendAI);
aiInput.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAI(); }
});

// ===== CODE SANDBOX =====
function renderSandbox() {
  const code = sandboxInput.value;
  const lang = langSelect.value;
  sandboxCode.className = `language-${lang}`;
  let hl;
  try { hl = window.hljs ? hljs.highlight(code, { language: lang, ignoreIllegals: true }).value : escapeHtml(code); }
  catch(_) { hl = escapeHtml(code); }
  sandboxCode.innerHTML = hl;
}

sandboxInput.addEventListener("input", renderSandbox);
langSelect.addEventListener("change", renderSandbox);

sandboxCopyBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(sandboxInput.value).then(() => {
    sandboxCopyBtn.textContent = "✅ Copied";
    setTimeout(() => sandboxCopyBtn.textContent = "📋 Copy", 1500);
  });
});
sandboxClearBtn.addEventListener("click", () => {
  sandboxInput.value = "";
  sandboxCode.innerHTML = "";
});
sandboxShareBtn.addEventListener("click", () => {
  const code = sandboxInput.value.trim();
  if (!code) return;
  chatInput.value = "```" + langSelect.value + "\n" + code + "\n```";
  document.querySelector('[data-panel="chat"]').click();
  chatInput.focus();
});

// ===== SNIPPETS =====
function renderSnippetsList() {
  snippetsList.innerHTML = "";
  const names = Object.keys(snippets);
  if (!names.length) {
    snippetsList.innerHTML = `<div class="empty-hint">No snippets saved yet.</div>`;
    return;
  }
  names.forEach(name => {
    const item = document.createElement("div");
    item.className = "snippet-item" + (name === activeSnippet ? " active" : "");
    item.textContent = name;
    item.addEventListener("click", () => {
      activeSnippet = name;
      snippetName.value = name;
      snippetContent.textContent = snippets[name];
      renderSnippetsList();
    });
    snippetsList.appendChild(item);
  });
}

snippetSaveBtn.addEventListener("click", () => {
  const name = snippetName.value.trim();
  if (!name) { snippetName.focus(); return; }
  const code = sandboxInput.value || snippetContent.textContent;
  snippets[name] = code;
  activeSnippet = name;
  localStorage.setItem("bytestar_snippets", JSON.stringify(snippets));
  renderSnippetsList();
  snippetContent.textContent = code;
});

snippetDelBtn.addEventListener("click", () => {
  if (!activeSnippet) return;
  delete snippets[activeSnippet];
  activeSnippet = null;
  snippetName.value = "";
  snippetContent.textContent = "← Select a snippet or save new from Sandbox tab.";
  localStorage.setItem("bytestar_snippets", JSON.stringify(snippets));
  renderSnippetsList();
});

// ===== BOOT =====
initSettingsUI();
checkAIStatus();
setServerOnline(false);   // start offline, connectSocket will flip it
connectSocket();          // attempt connection (gracefully fails if no server)

console.log("🚀 BlueComet ByteStar v2 — split architecture loaded");
