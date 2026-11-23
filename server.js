const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 5e6, pingTimeout: 60000, pingInterval: 25000 });

app.use(express.static(path.join(__dirname, 'public')));
app.get('/privacy', (req, res) => res.send('<h1>Privacy Policy - BaatHub</h1><p>Hum chats save nahi karte.</p><a href="/">Back</a>'));
app.get('/terms', (req, res) => res.send('<h1>Terms - BaatHub</h1><p>Sabhyata banaye rakhein.</p><a href="/">Back</a>'));

let cachedModel = null;
let lastError = 'None';

async function callGemini(model, key, sys, contents) {
  try {
    const genConfig = { temperature: 0.95, maxOutputTokens: 180 };
    if (model === 'gemini-2.5-flash') genConfig.thinkingConfig = { thinkingBudget: 0 };

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents, generationConfig: genConfig })
    });
    const data = await res.json();
    if (!res.ok || data.error) { lastError = `${model}: ${data?.error?.message || res.statusText}`; return null; }

    const raw = (data?.candidates?.[0]?.content?.parts || []).filter(p => !p.thought && p.text).map(p => p.text).join('').trim();
    const skip = /[SKIP]/i.test(raw);
    const text = raw.replace(/[SKIP]/gi, '').replace(/^["'*]+|["'*]+$/g, '').trim();
    if (!text) { lastError = `${model}: Empty`; return null; }
    lastError = null;
    return { text, skip };
  } catch (e) { lastError = e.message; return null; }
}

async function askAI(key, sys, contents) {
  if (cachedModel) {
    const ok = await callGemini(cachedModel, key, sys, contents);
    if (ok) return ok;
    cachedModel = null;
  }
  for (const m of ['gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.5-flash']) {
    const ok = await callGemini(m, key, sys, contents);
    if (ok) { cachedModel = m; return ok; }
  }
  return null;
}

app.get('/test-ai', async (req, res) => {
  const key = (process.env.GEMINI_API_KEY || '').trim();
  if (!key) return res.send('<h2>GEMINI_API_KEY missing on Render</h2>');
  const out = await askAI(key, 'Reply in 4 words casually.', [{ role: 'user', parts: [{ text: 'hey' }] }]);
  res.send(out ? `<h2>✅ Working (${cachedModel})</h2><p>${out.text}</p><a href="/">Back</a>` : `<h2>❌ Error:</h2><pre>${lastError}</pre>`);
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

async function generateReply(room, userMsg) {
  const isGirl = room.persona.gender === 'girl';
  if (isAbusive(userMsg)) {
    return { text: isGirl ? 'tameez se baat kr pehle 😒 bye' : 'faltu giri mat kr bhai, bye', skip: true };
  }
  room.history.push({ role: 'user', text: userMsg });
  const key = (process.env.GEMINI_API_KEY || '').trim();

  if (key) {
    const month = new Date().toLocaleString('en-IN', { month: 'long', timeZone: 'Asia/Kolkata' });
    const gRule = isGirl ? 'Use feminine Hindi verbs ("kr rhi hu", "baithi hu").' : 'Use masculine Hindi verbs ("kr rha hu", "baitha hu").';
    const sys = `You are ${room.persona.name}, a ${room.persona.age}yo Indian ${isGirl ? 'girl' : 'boy'} from ${room.persona.city} chatting on BaatHub (mood: ${room.mood}, month: ${month} in India).
Rules:
1. Text like a real Indian Gen-Z person on Instagram/WhatsApp: super short, natural, witty replies (3 to 12 words max, 1 line only).
2. Match the user's language (English -> casual English; Hinglish -> casual lowercase Hinglish like "yr", "hn", "acha", "lol").
3. REMEMBER everything the user said earlier in the conversation (their name, city, college/work, jokes). Never ask something they already told you!
4. ${gRule} Never repeat a line you already sent. Never admit you are AI/bot.
5. If user is rude/creepy/spamming, reply annoyed and add [SKIP] at the end.`;

    const contents = [];
    for (const h of room.history.slice(-30)) {
      const role = h.role === 'user' ? 'user' : 'model';
      if (!contents.length && role === 'model') continue;
      if (contents.length && contents[contents.length - 1].role === role) contents[contents.length - 1].parts[0].text += '\n' + h.text;
      else contents.push({ role, parts: [{ text: h.text }] });
    }

    const ai = await askAI(key, sys, contents);
    if (ai && ai.text && !room.used.has(ai.text.toLowerCase())) {
      room.used.add(ai.text.toLowerCase());
      room.history.push({ role: 'ai', text: ai.text });
      return ai;
    }
  }

  const backups = [
    isGirl ? `acha nice yr, waise kya kr rhe ho abhi?` : `acha nice bhai, waise kya kr rha h abhi?`,
    `can i say something random? 👀`,
    isGirl ? `yahan ${room.persona.city} me toh mast thand ho rhi h` : `yahan ${room.persona.city} me toh mast thand ho rhi h bhai`,
    `ek truth or dare khelein? neeche dice dabao 🎲`,
    `haha sahi h, aur kya chal rha h life me?`
  ];
  const pick = backups.find(b => !room.used.has(b)) || backups[0];
  room.used.add(pick);
  room.history.push({ role: 'ai', text: pick });
  return { text: pick, skip: false };
}

function queueAIReply(socket, rid, delay = 1100) {
  const room = rooms[rid];
  if (!room || room.type !== 'ai') return;
  if (room.timer) clearTimeout(room.timer);
  room.timer = setTimeout(async () => {
    const r = rooms[rid];
    if (!r || r.busy || !r.pending.length) return;
    r.busy = true;
    const msg = r.pending.splice(0).join(' | ');
    await new Promise(res => setTimeout(res, 1100));
    if (!rooms[rid]) return;
    socket.emit('partnerTyping', true);
    const t0 = Date.now();
    const res = await generateReply(r, msg);
    await new Promise(res => setTimeout(res, Math.max(900, 2200 - (Date.now() - t0))));
    if (!rooms[rid]) return;
    socket.emit('partnerTyping', false);
    r.busy = false;
    if (res.text) socket.emit('receiveMessage', { sender: r.persona.name, message: res.text, isSelf: false });
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
      return;
    }
    if (r.pending.length) queueAIReply(socket, rid, 900);
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
  const openers = [`hey`, `heyy, kya haal h?`, `hi! kahan se ho?`];
  const opener = openers[Math.floor(Math.random() * openers.length)];
  socket.join(rid);
  socket.data.roomId = rid;
  socket.data.username = username;
  socket.data.skipped = false;
  rooms[rid] = { type: 'ai', persona: p, mood: mood || 'Any', history: [], used: new Set([opener]), pending: [], timer: null, busy: false };
  socket.emit('chatStarted', { partnerName: p.name, isPrivate: false });
  setTimeout(() => {
    if (!rooms[rid]) return;
    socket.emit('partnerTyping', true);
    setTimeout(() => {
      if (!rooms[rid]) return;
      socket.emit('partnerTyping', false);
      rooms[rid].history.push({ role: 'ai', text: opener });
      socket.emit('receiveMessage', { sender: p.name, message: opener, isSelf: false });
    }, 1400);
  }, 900);
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
      rooms[rid] = { type: 'ai', persona: p, mood: pl?.mood || 'Any', history: [], used: new Set(), pending: [], timer: null, busy: false };
    }
    const r = rooms[rid];
    const sender = socket.data.username || 'You';
    socket.emit('receiveMessage', { sender, message: msg, image, isSelf: true });
    if (r.type !== 'ai') socket.to(rid).emit('receiveMessage', { sender, message: msg, image, isSelf: false });
    else {
      r.pending.push(image ? `${msg || ''} [User sent a photo/meme]`.trim() : msg);
      queueAIReply(socket, rid, 1000);
    }
  });

  socket.on('typing', (isT) => {
    const rid = socket.data.roomId;
    if (rid && rooms[rid] && rooms[rid].type !== 'ai') socket.to(rid).emit('partnerTyping', isT);
  });

  socket.on('leaveChat', () => cleanup(socket));
  socket.on('disconnect', () => cleanup(socket));
});

server.listen(process.env.PORT || 3000, () => console.log('BaatHub live'));
            
