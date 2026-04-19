# BluComBytSta
Live Chat / Messaging / AI / search / code safe and friendly 
# BlueComet ByteStar v2

## FILE STRUCTURE — CREATE EXACTLY THIS

```
BlueCometByteStar_v2/
│
├── public/
│   ├── dashboard.html        ← paste FILE 1
│   ├── css/
│   │   └── styles.css        ← paste FILE 2
│   └── js/
│       └── app.js            ← paste FILE 3
│
├── server.js                 ← paste FILE 4
├── package.json              ← already exists (keep it)
├── .env                      ← create this (see below)
└── .gitignore                ← create this (see below)
```

---

## CREATE .env

```
PORT=5000
PAGES_ORIGIN=https://bytestar.YOUR_DOMAIN.com
WORKER_URL=
```
Leave WORKER_URL blank for now.

---

## CREATE .gitignore

```
node_modules/
.env
backups/
*.log
```

---

## DEPLOY TO CLOUDFLARE PAGES

### Step 1 — Push to GitHub
```bash
cd ~/BlueCometByteStar_v2

git init
git add .
git commit -m "feat: bytestar v2 — split architecture"
git remote add origin https://github.com/YOUR_USERNAME/bluecomet-bytestar.git
git push -u origin main
```

### Step 2 — Cloudflare Pages
1. Go to dash.cloudflare.com → Pages → Create project
2. Connect your GitHub repo
3. Build settings:
   - Framework preset: None
   - Build command: (leave blank)
   - Build output: public
4. Hit Deploy
5. Add custom domain → bytestar.YOUR_DOMAIN.com

That's it. Sandbox, Snippets, AI, Settings all work now from any device.

---

## ENABLE LIVE CHAT (when Pixel is running)

### Step 1 — Start server on Pixel via Termux
```bash
cd ~/BlueCometByteStar_v2
npm install
node server.js
```

### Step 2 — Start Cloudflare Tunnel
```bash
# First time setup:
cloudflared tunnel login
cloudflared tunnel create bytestar-chat

# Every time you want chat live:
cloudflared tunnel --url http://localhost:5000
# You get: https://xyz.trycloudflare.com
```

### Step 3 — Connect from the app
1. Open your Pages URL on any device
2. Go to Settings tab
3. Paste your tunnel URL into "Socket Server URL"
4. Hit Save Settings
5. Chat tab goes green — live chat is active

---

## ENABLE AI CHAT

1. Go to Settings tab
2. Paste your Anthropic API key (sk-ant-...)
3. Hit Save Settings
4. AI tab goes green — works from any device, no server needed

---

## HOW THE SPLIT WORKS

| Feature     | Needs Server? | Works on Pages? |
|-------------|:---:|:---:|
| Code Sandbox | ✗   | ✓   |
| Snippets     | ✗   | ✓   |
| AI Chat      | ✗   | ✓   |
| Settings     | ✗   | ✓   |
| Live Chat    | ✓   | Only when Pixel tunnel is running |

If the chat server is offline → banner shows "offline", rest of app works fine.
When you start the server + tunnel → open Settings, paste URL, Save → chat lights up.
