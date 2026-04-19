// ===== BlueComet ByteStar v2 — server.js =====
// Run this on your Pixel via Termux when you want Live Chat active.
// Everything else (Sandbox, AI, Snippets, Settings) works without this.

require("dotenv").config();
const express = require("express");
const http    = require("http");
const { Server } = require("socket.io");
const path    = require("path");

const app  = express();
const PORT = process.env.PORT || 5000;

// ===== MIDDLEWARE =====
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ===== ROUTES =====
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/dashboard.html"));
});

app.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// ===== SOCKET.IO =====
const server = http.createServer(app);
const io = new Server(server, {
  transports: ["websocket", "polling"],
  allowEIO3: true,
  cors: {
    // Allow requests from your Cloudflare Pages domain and localhost
    origin: [
      "http://localhost:5000",
      "http://localhost:3000",
      process.env.PAGES_ORIGIN || "*"   // set in .env: PAGES_ORIGIN=https://bytestar.bluecomet.work
    ],
    methods: ["GET", "POST"]
  }
});

// ===== COMET NAMES =====
const COMET_NAMES = [
  "Halley","Hale-Bopp","Shoemaker","Swift","Encke","Tempel",
  "Churyumov","Wild","Borelly","Hartley","Ikeya","Arend",
  "Giacobini","Pons","Whipple","Faye","Wirtanen","Forbes",
  "Brooks","Machholz","Tuttle","Finlay","Wolf","Reinmuth",
  "Kopff","Schwassmann","Gehrels","Gunn","Tritton","Neujmin",
  "Crommelin","Taylor","Kearns","Seki","Perrine","Lexell"
];

const connectedUsers = new Map();   // socketId → { cometNumber, name }
const takenNumbers   = new Set();

function assignComet(socketId, preferredName) {
  let num = null;
  for (let i = 1; i <= COMET_NAMES.length; i++) {
    if (!takenNumbers.has(i)) { num = i; break; }
  }
  if (num === null) num = Date.now() % 9000 + 1000;
  takenNumbers.add(num);
  const autoName = `${COMET_NAMES[(num - 1) % COMET_NAMES.length]} ${num}`;
  const name = preferredName || autoName;
  connectedUsers.set(socketId, { cometNumber: num, name });
  return { cometNumber: num, name };
}

function releaseComet(socketId) {
  const user = connectedUsers.get(socketId);
  if (user) {
    takenNumbers.delete(user.cometNumber);
    connectedUsers.delete(socketId);
  }
}

function getUserListPayload() {
  const obj = {};
  connectedUsers.forEach((info, id) => { obj[id] = info; });
  return obj;
}

// ===== SOCKET EVENTS =====
io.on("connection", (socket) => {
  console.log(`[+] ${socket.id}`);

  socket.on("join", ({ name } = {}) => {
    const safe = name ? String(name).slice(0, 28).replace(/[<>]/g, "") : null;
    const assigned = assignComet(socket.id, safe);
    socket.emit("assigned", { ...assigned, socketId: socket.id });
    io.emit("userList", getUserListPayload());
    io.emit("systemMsg", `✦ ${assigned.name} entered the stream`);
    console.log(`[join] ${assigned.name}`);
  });

  socket.on("setName", (newName) => {
    const user = connectedUsers.get(socket.id);
    if (user && typeof newName === "string") {
      user.name = String(newName).slice(0, 28).replace(/[<>]/g, "");
      io.emit("userList", getUserListPayload());
    }
  });

  socket.on("chatMessage", (msg) => {
    if (!msg?.text?.trim()) return;
    const safe = {
      user:     String(msg.user || "Unknown").slice(0, 32),
      text:     String(msg.text).slice(0, 4000),
      socketId: socket.id
    };
    console.log(`[msg] ${safe.user}: ${safe.text.slice(0, 60)}`);
    // Broadcast to everyone except sender (sender already rendered locally)
    socket.broadcast.emit("chatMessage", safe);

    // Optional: log to Cloudflare Worker KV bucket
    if (process.env.WORKER_URL) {
      fetch(`${process.env.WORKER_URL}/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(safe)
      }).catch(() => {}); // fire and forget
    }
  });

  socket.on("disconnect", () => {
    const user = connectedUsers.get(socket.id);
    if (user) {
      console.log(`[-] ${user.name}`);
      io.emit("systemMsg", `◌ ${user.name} left the stream`);
      releaseComet(socket.id);
      io.emit("userList", getUserListPayload());
    }
  });
});

// ===== START =====
server.listen(PORT, "0.0.0.0", () => {
  const os = require("os");
  let localIP = "localhost";
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const alias of iface) {
      if (alias.family === "IPv4" && !alias.internal) localIP = alias.address;
    }
  }
  console.log("🚀 BlueComet ByteStar v2 — Chat Server");
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Network: http://${localIP}:${PORT}`);
  console.log(`   Worker:  ${process.env.WORKER_URL || "(not set)"}`);
});
