const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 5e6, pingTimeout: 60000, pingInterval: 25000 });

// Optional: Baad me apni real photos/GIFs ke direct links yahan daal sakte hain
const customMedia = { girlPics: [], boyPics: [], gifs: [] };

app.use(express.static(path.join(__dirname, 'public')));
app.get('/privacy', (req, res) => res.send('<h1>Privacy Policy - BaatHub</h1><p>Hum chats save nahi karte.</p><a href="/">Back</a>'));
app.get('/terms', (req, res) => res.send('<h1>Terms - BaatHub</h1><p>Sabhyata banaye rakhein.</p><a href="/">Back</a>'));

// Automatic Character Portrait & Animated Reaction GIF
app.get('/ai-media', (req, res) => {
  const type = req.query.type === 'gif' ? 'gif' : 'pic';
  const name = String(req.query.name || 'Stranger').replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 15);
  const city = String(req.query.city || 'India').replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 15);
  const isGirl = req.query.gender === 'girl';
  const v = parseInt(req.query.v || '0', 10) || 0;
  const seed = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);

  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'no-store');

  if (type === 'gif') {
    const items = [
      ['😂', 'KYA BOL RHA H 😂', '#ec4899', '#8b5cf6'],
      ['👀', 'NO WAYYY 👀', '#2563eb', '#06b6d4'],
      ['🙈', 'CHAL JHOOTHA 🙈', '#db2777', '#f43f5e'],
      ['🔥', 'VIBE HAI BHAI 🔥', '#ea580c', '#eab308'],
      ['💀', 'HAHAHA DEAD 💀', '#4f46e5', '#9333ea']
    ];
    const [emoji, label, c1, c2] = items[(seed + v) % items.length];
    return res.send(`<svg xmlns="http://www.w3.org/2000/svg" width="250" height="165" viewBox="0 0 250 165">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs>
      <rect width="250" height="165" rx="18" fill="url(#g)"/>
      <text x="125" y="84" font-size="54" text-anchor="middle">${emoji}<animateTransform attributeName="transform" type="scale" values="1;1.18;1" dur="0.85s" repeatCount="indefinite" additive="sum"/></text>
      <rect x="35" y="114" width="180" height="28" rx="14" fill="rgba(0,0,0,0.48)"/>
      <text x="125" y="133" fill="#fff" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle">${label}</text>
    </svg>`);
  }

  const [bg1, bg2] = isGirl ? ['#be185d', '#6d28d9'] : ['#1d4ed8', '#0f766e'];
  const skin = ['#f8cbad', '#eab696', '#d99b78'][seed % 3];
  const hair = ['#18181b', '#271c19', '#3b2314'][seed % 3];
  const top = isGirl ? ['#f43f5e', '#a855f7', '#38bdf8'][v % 3] : ['#3b82f6', '#10b981', '#f59e0b'][v % 3];
  const caption = isGirl ? ['abhi ki click 🙈', 'bore ho rhi thi ✨', 'kaisi lag rhi hu? 👀'][v % 3] : ['abhi ki snap 😎', 'full chill mood 🔥', 'kya scene h bhai 👀'][v % 3];
  const backHair = isGirl ? `<path d="M74 92 C70 155, 82 195, 92 205 L148 205 C158 195, 170 155, 166 92 Z" fill="${hair}"/>` : '';

  res.send(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="270" viewBox="0 0 240 270">
    <defs><linearGradient id="p" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${bg1}"/><stop offset="100%" stop-color="${bg2}"/></linearGradient></defs>
    <rect width="240" height="270" rx="18" fill="#0f172a"/>
    <rect x="10" y="10" width="220" height="210" rx="14" fill="url(#p)"/>
    ${backHair}
    <path d="M64 220 C66 172, 174 172, 176 220 Z" fill="${top}"/>
    <rect x="109" y="130" width="22" height="28" rx="10" fill="${skin}"/>
    <ellipse cx="120" cy="95" rx="37" ry="42" fill="${skin}"/>
    <path d="M82 86 C82 48, 158 48, 158 86 C145 64, 95 64, 82 86 Z" fill="${hair}"/>
    <circle cx="106" cy="95" r="4" fill="#1e293b"/><circle cx="134" cy="95" r="4" fill="#1e293b"/>
    <path d="M110 114 Q120 123 130 114" fill="none" stroke="#9f1239" stroke-width="2.5" stroke-linecap="round"/>
    <rect x="10" y="182" width="220" height="26" fill="rgba(0,0,0,0.5)"/>
    <text x="120" y="199" fill="#fff" font-family="sans-serif" font-size="12" font-weight="600" text-anchor="middle">${caption}</text>
    <text x="18" y="242" fill="#f8fafc" font-family="sans-serif" font-size="13" font-weight="bold">${name} • ${city}</text>
    <text x="18" y="259" fill="#34d399" font-family="sans-serif" font-size="10" font-weight="600">● Live Snap • Just now</text>
  </svg>`);
});

let activeModel = null;
let lastApiError = 'No API call yet';

async function fetchTimed(url, opts = {}, ms = 9000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

function cleanOutput(raw) {
  if (!raw) return '';
  return raw
    .replace(/\[(SKIP|SEND_PIC|SEND_GIF)\]/gi, '')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !/^(thought|thinking|building|refining|draft|note|\*|\-)/i.test(l))
    .join(' ')
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim();
}

async function queryGemini(model, key, sysPrompt, contents) {
  try {
    const res = await fetchTimed(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: sysPrompt }] },
          contents,
          generationConfig: { temperature: 0.95, maxOutputTokens: 250 }
        })
      },
      9000
    );
    const data = await res.json();
    if (!res.ok || data.error) { lastApiError = `${model}: ${data?.error?.message || res.statusText}`; return null; }
    const raw = (data?.candidates?.[0]?.content?.parts || []).filter(p => !p.thought && typeof p.text === 'string').map(p => p.text).join('').trim();
    const skip = /\[SKIP\]/i.test(raw);
    const sendPic = /\[SEND_PIC\]/i.test(raw);
    const sendGif = /\[SEND_GIF\]/i.test(raw);
    const text = cleanOutput(raw);
    if (!text && !sendPic && !sendGif) { lastApiError = `${model}: Empty output`; return null; }
    lastApiError = null;
    return { text, skip, sendPic, sendGif };
  } catch (err) {
    lastApiError = `${model}: ${err.name === 'AbortError' ? 'Timeout' : err.message}`;
    return null;
  }
}

async function runPureAI(key, sysPrompt, contents) {
  if (activeModel) {
    const res = await queryGemini(activeModel, key, sysPrompt, contents);
    if (res) return res;
    activeModel = null;
  }
  const models = ['gemini-3.0-flash', 'gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'];
  for (const m of models) {
    const res = await queryGemini(m, key, sysPrompt, contents);
    if (res) { activeModel = m; return res; }
  }
  try {
    const listRes = await fetchTimed(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, {}, 6000);
    const listData = await listRes.json();
    const skipWords = ['image', 'tts', 'audio', 'vision', 'embedding', 'aqa', 'robotics', 'computer', 'learnlm', 'bisect'];
    const found = (listData.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent') && m.name.includes('gemini') && !skipWords.some(w => m.name.toLowerCase().includes(w)))
      .map(m => m.name.replace('models/', ''))
      .filter(m => !models.includes(m));
    for (const m of found.slice(0, 4)) {
      const res = await queryGemini(m, key, sysPrompt, contents);
      if (res) { activeModel = m; return res; }
    }
  } catch (e) { lastApiError = e.message; }
  return null;
}

app.get('/test-ai', async (req, res) => {
  const key = (process.env.GEMINI_API_KEY || '').trim();
  if (!key) return res.send('<h2>GEMINI_API_KEY missing on Render</h2>');
  const out = await runPureAI(key, 'Reply naturally in 5 words in Hinglish.', [{ role: 'user', parts: [{ text: 'aur bhai kya haal hai' }] }]);
  res.send(out ? `<h2>Pure AI Working (${activeModel})</h2><p>${out.text}</p><a href="/">Back to Chat</a>` : `<h2>API Error:</h2><pre>${lastApiError}</pre>`);
});

const baseOnline = Math.floor(Math.random() * 8) + 25;
setInterval(() => io.emit('onlineCount', baseOnline + (io.engine.clientsCount || 1) + Math.floor(Math.random() * 4)), 10000);

const personas = [
  ['Sneha','girl',20,'Delhi'], ['Aarav','boy',21,'Mumbai'], ['Priya','girl',19,'Jaipur'], ['Rohan','boy',22,'Pune'],
  ['Ananya','girl',20,'Lucknow'], ['Kabir','boy',21,'Indore'], ['Riya','girl',21,'Chandigarh'], ['Dev','boy',20,'Noida'],
  ['Kavya','girl',19,'Bhopal'], ['Aditya','boy',22,'Bengaluru'], ['Nidhi','girl',20,'Patna'], ['Yash','boy',21,'Ahmedabad'],
  ['Tanya','girl',21,'Gurugram'], ['Karan','boy',23,'Dehradun'], ['Simran','girl',20,'Amritsar'], ['Harsh','boy',19,'Kanpur'],
  ['Meera','girl',22,'Kolkata'], ['Siddharth','boy',21,'Hyderabad'], ['Pooja','girl',20,'Varanasi'], ['Manish','boy',22,'Ranchi'],
  ['Isha','girl',19,'Surat'], ['Vikram','boy',23,'Jodhpur'], ['Shreya','girl',21,'Nagpur'], ['Nikhil','boy',20,'Agra']
].map(([name, gender, age, city]) => ({ name, gender, age, city }));

const isAbusive = t => /\b(mc|bc|bsdk|madarchod|bhenchod|behenchod|chutiya|chutiye|gandu|randi|harami|kamina|laude|lode|lund|chut|boobs|nude|nudes|sex|sexy|porn|xxx|fuck|fucking|bitch|asshole|dick|pussy|horny)\b/i.test(t);

let queue = [];
const rooms = {};

function cleanup(socket) {
  const qi = queue.findIndex(u => u.socketId === socket.id);
  if (qi !== -1) { clearTimeout(queue[qi].timer); queue.splice(qi, 1); }
  const rid = socket.data.roomId;
  if (rid && rooms[rid]) {
    const r = rooms[rid];
    if (r.timer) clearTimeout(r.timer);
    if (r.type === 'human') { socket.to(rid).emit('partnerLeft', 'Saamne wala user chala gaya.'); delete rooms[rid]; }
    else if (r.type === 'private') socket.to(rid).emit('systemMessage', `${socket.data.username || 'User'} room se bahar gaya.`);
    else delete rooms[rid];
    socket.leave(rid);
    socket.data.roomId = null;
  }
}

function getMediaUrl(room, isGif) {
  const { name, gender, city } = room.persona;
  const idx = room.mediaCount++;
  if (isGif) {
    const builtIn = `/ai-media?type=gif&name=${encodeURIComponent(name)}&v=${idx}&t=${Date.now()}`;
    const pool = [...(customMedia.gifs || []), builtIn];
    return pool[Math.floor(Math.random() * pool.length)];
  }
  const list = gender === 'girl' ? customMedia.girlPics : customMedia.boyPics;
  if (list && list.length > 0) return list[idx % list.length];
  return `/ai-media?type=pic&name=${encodeURIComponent(name)}&gender=${gender}&city=${encodeURIComponent(city)}&v=${idx}&t=${Date.now()}`;
}

async function getPureAIReply(room, userMsg) {
  const isGirl = room.persona.gender === 'girl';
  if (isAbusive(userMsg)) {
    return { text: isGirl ? 'tameez se baat kr pehle 😒 bye' : 'faltu giri mat kr bhai, bye', skip: true, image: null };
  }

  room.userMsgCount = (room.userMsgCount || 0) + 1;
  room.history.push({ role: 'user', text: userMsg });
  const key = (process.env.GEMINI_API_KEY || '').trim();
  if (!key) return null;

  const canSendPicNow = room.userMsgCount >= 4;
  const month = new Date().toLocaleString('en-IN', { month: 'long', timeZone: 'Asia/Kolkata' });
  const gRule = isGirl ? 'Use feminine Hindi verbs ("kr rhi hu", "baithi hu", "karti hu").' : 'Use masculine Hindi verbs ("kr rha hu", "baitha hu", "karta hu").';

  const picRule = canSendPicNow
    ? `User has chatted enough (${room.userMsgCount} messages). If user asks for your pic/selfie/photo now, agree playfully and append [SEND_PIC] at the end.`
    : `IMPORTANT: User has only sent ${room.userMsgCount} messages so far. If user asks for your pic, selfie, or photo right now, DO NOT send any pic and DO NOT output [SEND_PIC]. Refuse playfully like a real person (e.g. "${isGirl ? 'arey abhi toh baat shuru hui h, pehle thodi jaan pehchan toh ho jaye 😂' : 'itni jaldi kya h bhai, pehle thodi baat toh kr le 😂'}").`;

  const sysPrompt = `You are ${room.persona.name}, a ${room.persona.age}yo Indian ${isGirl ? 'girl' : 'boy'} from ${room.persona.city} chatting live on BaatHub (mood: ${room.mood}, month in India: ${month}).
Rules:
1. Text like a real Indian Gen-Z person on WhatsApp/Instagram: short, natural, witty replies (3 to 15 words max, 1 line only).
2. Directly reply to what the user just asked or sent (answer Truth/Dare playfully like a real human).
3. Match the user's language (English -> casual English; Hinglish -> lowercase casual Hinglish like "yr", "hn", "acha", "lol").
4. REMEMBER everything the user said earlier in the chat (name, city, college/work, jokes). Never ask something they already told you.
5. ${gRule} Never repeat a line you already sent. Never admit you are AI or a bot.
6. ${picRule}
7. If user asks for a GIF/meme, reply and append [SEND_GIF] at the end.
8. If user is rude, creepy, or spamming, reply annoyed and append [SKIP] at the end.`;

  const contents = [];
  for (const h of room.history.slice(-30)) {
    const role = h.role === 'user' ? 'user' : 'model';
    if (!contents.length && role === 'model') continue;
    if (contents.length && contents[contents.length - 1].role === role) contents[contents.length - 1].parts[0].text += '\n' + h.text;
    else contents.push({ role, parts: [{ text: h.text }] });
  }

  const ai = await runPureAI(key, sysPrompt, contents);
  if (!ai) return null;

  const askedPic = /\b(pic|pics|photo|selfie|snaps?|dikhao|dikha|shakal|face)\b/i.test(userMsg);
  const askedGif = /\b(gif|meme)\b/i.test(userMsg);

  let image = null;
  if (ai.sendGif || askedGif) {
    image = getMediaUrl(room, true);
  } else if (canSendPicNow && (ai.sendPic || askedPic)) {
    image = getMediaUrl(room, false);
  }

  const finalText = ai.text || (image ? (isGirl ? 'ye lo 🙈' : 'ye le bhai 😎') : '');
  room.history.push({ role: 'ai', text: finalText });
  return { text: finalText, skip: ai.skip, image };
}

function scheduleAI(socket, rid, delay = 900) {
  const room = rooms[rid];
  if (!room || room.type !== 'ai') return;
  if (room.timer) clearTimeout(room.timer);

  room.timer = setTimeout(async () => {
    const r = rooms[rid];
    if (!r || r.busy || !r.pending.length) return;
    r.busy = true;

    try {
      const msg = r.pending.splice(0).join(' | ');
      await new Promise(res => setTimeout(res, 800));
      if (!rooms[rid]) return;

      socket.emit('partnerTyping', true);
      const t0 = Date.now();
      const res = await getPureAIReply(r, msg);
      const wait = Math.max(800, 1800 - (Date.now() - t0));
      await new Promise(resolve => setTimeout(resolve, wait));
      if (!rooms[rid]) return;

      socket.emit('partnerTyping', false);

      if (!res) {
        const name = r.persona.name;
        delete rooms[rid];
        socket.leave(rid);
        socket.data.roomId = null;
        socket.data.skipped = true;
        socket.emit('partnerLeft', `${name} network issue ki wajah se disconnect ho gaya.`);
        return;
      }

      socket.emit('receiveMessage', { sender: r.persona.name, message: res.text, image: res.image || null, isSelf: false });

      if (res.skip) {
        setTimeout(() => {
          if (!rooms[rid]) return;
          const name = r.persona.name;
          delete rooms[rid];
          socket.leave(rid);
          socket.data.roomId = null;
          socket.data.skipped = true;
          socket.emit('partnerLeft', `${name} ne chat skip kar di.`);
        }, 800);
      }
    } finally {
      r.busy = false;
      socket.emit('partnerTyping', false);
      if (rooms[rid]?.pending?.length) scheduleAI(socket, rid, 800);
    }
  }, delay);
}

function pickPersona(socket) {
  if (!socket.data.seen) socket.data.seen = new Set();
  let list = personas.filter(p => !socket.data.seen.has(p.name));
  if (!list.length) { socket.data.seen.clear(); list = personas; }
  const p = list[Math.floor(Math.random() * list.length)];
  socket.data.seen.add(p.name);
  return p;
}

function connectAI(socket, username, mood) {
  const p = pickPersona(socket);
  const rid = `ai_${socket.id}_${Date.now()}`;
  const opener = 'hey';
  socket.join(rid);
  socket.data.roomId = rid;
  socket.data.username = username;
  socket.data.skipped = false;
  rooms[rid] = { type: 'ai', persona: p, mood: mood || 'Any', history: [], userMsgCount: 0, mediaCount: 0, pending: [], timer: null, busy: false };
  socket.emit('chatStarted', { partnerName: p.name, isPrivate: false });

  setTimeout(() => {
    if (!rooms[rid]) return;
    socket.emit('partnerTyping', true);
    setTimeout(() => {
      if (!rooms[rid]) return;
      socket.emit('partnerTyping', false);
      rooms[rid].history.push({ role: 'ai', text: opener });
      socket.emit('receiveMessage', { sender: p.name, message: opener, isSelf: false });
    }, 1100);
  }, 700);
}

io.on('connection', (socket) => {
  socket.emit('onlineCount', baseOnline + (io.engine.clientsCount || 1));

  socket.on('joinRandom', (pl) => {
    cleanup(socket);
    socket.data.skipped = false;
    const username = (typeof pl === 'object' ? pl.username : pl)?.trim() || 'Stranger';
    const mood = (typeof pl === 'object' ? pl.mood : 'Any') || 'Any';
    socket.data.username = username;

    let idx = queue.findIndex(u => u.mood === mood);
    if (idx === -1 && queue.length) idx = 0;

    if (idx !== -1) {
      const partner = queue.splice(idx, 1)[0];
      clearTimeout(partner.timer);
      const ps = io.sockets.sockets.get(partner.socketId);
      if (!ps) return connectAI(socket, username, mood);
      const rid = `human_${socket.id}_${partner.socketId}`;
      socket.join(rid); ps.join(rid);
      socket.data.roomId = rid; ps.data.roomId = rid;
      rooms[rid] = { type: 'human' };
      socket.emit('chatStarted', { partnerName: partner.username, isPrivate: false });
      ps.emit('chatStarted', { partnerName: username, isPrivate: false });
    } else {
      const timer = setTimeout(() => {
        const i = queue.findIndex(u => u.socketId === socket.id);
        if (i !== -1) { queue.splice(i, 1); connectAI(socket, username, mood); }
      }, 6000);
      queue.push({ socketId: socket.id, username, mood, timer });
    }
  });

  socket.on('joinPrivate', ({ username, roomCode }) => {
    cleanup(socket);
    socket.data.skipped = false;
    const name = (username || 'Guest').trim();
    const code = (roomCode || 'ROOM1').trim().toUpperCase();
    const rid = `private_${code}`;
    socket.join(rid);
    socket.data.roomId = rid;
    socket.data.username = name;
    if (!rooms[rid]) rooms[rid] = { type: 'private' };
    socket.emit('chatStarted', { partnerName: `Room: ${code}`, isPrivate: true, roomCode: code });
    socket.to(rid).emit('systemMessage', `${name} ne room join kiya!`);
  });

  socket.on('sendMessage', (pl) => {
    if (socket.data.skipped) return;
    const msg = (typeof pl === 'object' ? pl.message : pl || '').trim();
    const image = pl?.image || null;
    if (!msg && !image) return;

    const now = Date.now();
    if (!image && socket.data.lastMsg === msg && now - (socket.data.lastTime || 0) < 900) return;
    socket.data.lastMsg = msg;
    socket.data.lastTime = now;

    let rid = socket.data.roomId;
    if (!rid || !rooms[rid]) {
      socket.data.username = (pl?.username || socket.data.username || 'Stranger').trim();
      const p = personas.find(x => x.name === (pl?.partnerName || '').trim()) || pickPersona(socket);
      rid = `ai_${socket.id}_${Date.now()}`;
      socket.join(rid); socket.data.roomId = rid;
      rooms[rid] = { type: 'ai', persona: p, mood: pl?.mood || 'Any', history: [], userMsgCount: 0, mediaCount: 0, pending: [], timer: null, busy: false };
    }
    const r = rooms[rid];
    const sender = socket.data.username || 'You';
    socket.emit('receiveMessage', { sender, message: msg, image, isSelf: true });
    if (r.type !== 'ai') socket.to(rid).emit('receiveMessage', { sender, 
