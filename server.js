const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 5e6, pingTimeout: 60000, pingInterval: 25000 });

const customMedia = { girlPics: [], boyPics: [], gifs: [] };

app.use(express.static(path.join(__dirname, 'public')));
app.get('/privacy', (req, res) => res.send('<h1>Privacy Policy</h1><a href="/">Back</a>'));
app.get('/terms', (req, res) => res.send('<h1>Terms</h1><a href="/">Back</a>'));

app.get('/ai-media', (req, res) => {
  const isGif = req.query.type === 'gif';
  const name = String(req.query.name || 'User').replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 14);
  const city = String(req.query.city || 'India').replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 14);
  const isGirl = req.query.gender === 'girl';
  const v = parseInt(req.query.v || '0', 10) || 0;
  const seed = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'no-store');

  if (isGif) {
    const g = [['😂','KYA BOL RHA H 😂','#ec4899','#8b5cf6'],['👀','NO WAYYY 👀','#2563eb','#06b6d4'],['🙈','CHAL JHOOTHA 🙈','#db2777','#f43f5e'],['🔥','VIBE HAI BHAI 🔥','#ea580c','#eab308']][(seed + v) % 4];
    return res.send(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect width="240" height="160" rx="16" fill="${g[2]}"/><text x="120" y="82" font-size="52" text-anchor="middle">${g[0]}</text><rect x="30" y="110" width="180" height="28" rx="14" fill="rgba(0,0,0,0.5)"/><text x="120" y="129" fill="#fff" font-family="sans-serif" font-size="12" font-weight="bold" text-anchor="middle">${g[1]}</text></svg>`);
  }
  const bg = isGirl ? '#be185d' : '#1d4ed8';
  const skin = ['#f8cbad', '#eab696', '#d99b78'][seed % 3];
  const top = isGirl ? ['#f43f5e', '#a855f7', '#38bdf8'][v % 3] : ['#3b82f6', '#10b981', '#f59e0b'][v % 3];
  const cap = isGirl ? ['abhi ki click 🙈', 'bore ho rhi thi ✨', 'kaisi lag rhi hu? 👀'][v % 3] : ['abhi ki snap 😎', 'full chill mood 🔥', 'kya scene h bhai 👀'][v % 3];
  const backHair = isGirl ? `<path d="M74 90 C70 155,82 195,92 205 L148 205 C158 195,170 155,166 90 Z" fill="#18181b"/>` : '';
  res.send(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="265"><rect width="240" height="265" rx="18" fill="#0f172a"/><rect x="10" y="10" width="220" height="205" rx="14" fill="${bg}"/>${backHair}<path d="M64 215 C66 168,174 168,176 215 Z" fill="${top}"/><rect x="109" y="128" width="22" height="26" rx="10" fill="${skin}"/><ellipse cx="120" cy="94" rx="36" ry="41" fill="${skin}"/><path d="M82 85 C82 48,158 48,158 85 C145 64,95 64,82 85 Z" fill="#18181b"/><circle cx="106" cy="94" r="4" fill="#1e293b"/><circle cx="134" cy="94" r="4" fill="#1e293b"/><path d="M110 112 Q120 121 130 112" fill="none" stroke="#9f1239" stroke-width="2.5"/><rect x="10" y="178" width="220" height="26" fill="rgba(0,0,0,0.5)"/><text x="120" y="195" fill="#fff" font-family="sans-serif" font-size="12" font-weight="600" text-anchor="middle">${cap}</text><text x="18" y="238" fill="#f8fafc" font-family="sans-serif" font-size="13" font-weight="bold">${name} • ${city}</text><text x="18" y="255" fill="#34d399" font-family="sans-serif" font-size="10">● Live Snap</text></svg>`);
});

let activeModel = null;
let lastErr = 'None';

async function callAI(key, sys, contents) {
  const list = activeModel ? [activeModel] : ['gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-3.0-flash', 'gemini-flash-latest'];
  for (const m of list) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 8500);
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
        body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents, generationConfig: { temperature: 0.95, maxOutputTokens: 220 } })
      });
      clearTimeout(t);
      const d = await r.json();
      if (!r.ok || d.error) { lastErr = `${m}: ${d?.error?.message || r.statusText}`; activeModel = null; continue; }
      const raw = (d?.candidates?.[0]?.content?.parts || []).filter(p => !p.thought && p.text).map(p => p.text).join('').trim();
      const skip = /\[SKIP\]/i.test(raw), sendPic = /\[SEND_PIC\]/i.test(raw), sendGif = /\[SEND_GIF\]/i.test(raw);
      const text = raw.replace(/\[(SKIP|SEND_PIC|SEND_GIF)\]/gi, '').split('\n').map(x => x.trim()).filter(x => x && !/^(thought|thinking|building|refining|\*)/i.test(x)).join(' ').trim();
      if (text || sendPic || sendGif) { activeModel = m; lastErr = null; return { text, skip, sendPic, sendGif }; }
    } catch (e) { lastErr = `${m}: ${e.message}`; activeModel = null; }
  }
  return null;
}

app.get('/test-ai', async (req, res) => {
  const key = (process.env.GEMINI_API_KEY || '').trim();
  if (!key) return res.send('<h2>GEMINI_API_KEY missing</h2>');
  const out = await callAI(key, 'Reply in 4 words Hinglish.', [{ role: 'user', parts: [{ text: 'aur bhai kya haal' }] }]);
  res.send(out ? `<h2>Working (${activeModel})</h2><p>${out.text}</p><a href="/">Back</a>` : `<h2>Error:</h2><pre>${lastErr}</pre>`);
});

const baseOnline = Math.floor(Math.random() * 8) + 25;
setInterval(() => io.emit('onlineCount', baseOnline + (io.engine.clientsCount || 1) + Math.floor(Math.random() * 4)), 10000);

const personas = [
  ['Sneha','girl',20,'Delhi'],['Aarav','boy',21,'Mumbai'],['Priya','girl',19,'Jaipur'],['Rohan','boy',22,'Pune'],
  ['Ananya','girl',20,'Lucknow'],['Kabir','boy',21,'Indore'],['Riya','girl',21,'Chandigarh'],['Dev','boy',20,'Noida'],
  ['Kavya','girl',19,'Bhopal'],['Aditya','boy',22,'Bengaluru'],['Nidhi','girl',20,'Patna'],['Yash','boy',21,'Ahmedabad'],
  ['Tanya','girl',21,'Gurugram'],['Karan','boy',23,'Dehradun'],['Simran','girl',20,'Amritsar'],['Harsh','boy',19,'Kanpur']
].map(([name, gender, age, city]) => ({ name, gender, age, city }));

const isAbusive = t => /\b(mc|bc|bsdk|madarchod|bhenchod|behenchod|chutiya|chutiye|gandu|randi|harami|kamina|laude|lode|lund|chut|boobs|nude|nudes|sex|sexy|porn|xxx|fuck|fucking|bitch|asshole|dick|pussy|horny)\b/i.test(t);
let queue = [];
const rooms = {};

function cleanup(s) {
  const qi = queue.findIndex(u => u.socketId === s.id);
  if (qi !== -1) { clearTimeout(queue[qi].timer); queue.splice(qi, 1); }
  const rid = s.data.roomId;
  if (rid && rooms[rid]) {
    if (rooms[rid].timer) clearTimeout(rooms[rid].timer);
    if (rooms[rid].type === 'human') { s.to(rid).emit('partnerLeft', 'Saamne wala user chala gaya.'); delete rooms[rid]; }
    else if (rooms[rid].type === 'private') s.to(rid).emit('systemMessage', `${s.data.username || 'User'} room se bahar gaya.`);
    else delete rooms[rid];
    s.leave(rid); s.data.roomId = null;
  }
}

async function getReply(room, userMsg) {
  const isGirl = room.persona.gender === 'girl';
  if (isAbusive(userMsg)) return { text: isGirl ? 'tameez se baat kr pehle 😒 bye' : 'faltu giri mat kr bhai, bye', skip: true, image: null };
  room.count = (room.count || 0) + 1;
  room.history.push({ role: 'user', text: userMsg });
  const key = (process.env.GEMINI_API_KEY || '').trim();
  if (!key) return null;

  const canPic = room.count >= 4;
  const gRule = isGirl ? 'Use feminine Hindi verbs (kr rhi hu, baithi hu).' : 'Use masculine Hindi verbs (kr rha hu, baitha hu).';
  const pRule = canPic ? 'User chatted enough. If they ask for pic/selfie now, agree playfully and add [SEND_PIC] at end.' : `User only sent ${room.count} msgs. If they ask for pic/selfie now, DO NOT send pic or [SEND_PIC]; refuse playfully like "pehle thodi baat toh kr le 😂".`;
  const sys = `You are ${room.persona.name}, ${room.persona.age}yo Indian ${isGirl ? 'girl' : 'boy'} from ${room.persona.city} on BaatHub (mood: ${room.mood}).
Rules: 1. Reply in 1 short casual Hinglish/English line (3-14 words). 2. Remember user's name, city & prior messages; never repeat questions or lines. 3. ${gRule} 4. ${pRule} 5. If user asks for GIF/meme, add [SEND_GIF]. 6. If rude/spam, add [SKIP]. Never admit being AI.`;

  const contents = [];
  for (const h of room.history.slice(-26)) {
    const role = h.role === 'user' ? 'user' : 'model';
    if (!contents.length && role === 'model') continue;
    if (contents.length && contents[contents.length - 1].role === role) contents[contents.length - 1].parts[0].text += '\n' + h.text;
    else contents.push({ role, parts: [{ text: h.text }] });
  }
  const ai = await callAI(key, sys, contents);
  if (!ai) return null;

  const askedPic = /\b(pic|pics|photo|selfie|snaps?|dikhao|dikha|shakal)\b/i.test(userMsg);
  const askedGif = /\b(gif|meme)\b/i.test(userMsg);
  let image = null;
  if (ai.sendGif || askedGif) image = `/ai-media?type=gif&name=${encodeURIComponent(room.persona.name)}&v=${room.media++}&t=${Date.now()}`;
  else if (canPic && (ai.sendPic || askedPic)) {
    const list = isGirl ? customMedia.girlPics : customMedia.boyPics;
    image = list.length ? list[room.media++ % list.length] : `/ai-media?type=pic&name=${encodeURIComponent(room.persona.name)}&gender=${room.persona.gender}&city=${encodeURIComponent(room.persona.city)}&v=${room.media++}&t=${Date.now()}`;
  }
  const text = ai.text || (image ? (isGirl ? 'ye lo 🙈' : 'ye le bhai 😎') : '');
  room.history.push({ role: 'ai', text });
  return { text, skip: ai.skip, image };
}

function scheduleAI(s, rid, delay = 900) {
  const r = rooms[rid];
  if (!r || r.type !== 'ai') return;
  if (r.timer) clearTimeout(r.timer);
  r.timer = setTimeout(async () => {
    const rm = rooms[rid];
    if (!rm || rm.busy || !rm.pending.length) return;
    rm.busy = true;
    try {
      const msg = rm.pending.splice(0).join(' | ');
      await new Promise(res => setTimeout(res, 700));
      if (!rooms[rid]) return;
      s.emit('partnerTyping', true);
      const t0 = Date.now();
      const res = await getReply(rm, msg);
      await new Promise(ok => setTimeout(ok, Math.max(800, 1700 - (Date.now() - t0))));
      if (!rooms[rid]) return;
      s.emit('partnerTyping', false);
      if (!res) { const n = rm.persona.name; delete rooms[rid]; s.leave(rid); s.data.roomId = null; s.data.skipped = true; s.emit('partnerLeft', `${n} disconnect ho gaya.`); return; }
      s.emit('receiveMessage', { sender: rm.persona.name, message: res.text, image: res.image, isSelf: false });
      if (res.skip) setTimeout(() => { if (rooms[rid]) { const n = rm.persona.name; delete rooms[rid]; s.leave(rid); s.data.roomId = null; s.data.skipped = true; s.emit('partnerLeft', `${n} ne chat skip kar di.`); } }, 800);
    } finally {
      rm.busy = false; s.emit('partnerTyping', false);
      if (rooms[rid]?.pending?.length) scheduleAI(s, rid, 800);
    }
  }, delay);
}

function connectAI(s, username, mood) {
  if (!s.data.seen) s.data.seen = new Set();
  let list = personas.filter(p => !s.data.seen.has(p.name));
  if (!list.length) { s.data.seen.clear(); list = personas; }
  const p = list[Math.floor(Math.random() * list.length)];
  s.data.seen.add(p.name);
  const rid = `ai_${s.id}_${Date.now()}`;
  s.join(rid); s.data.roomId = rid; s.data.username = username; s.data.skipped = false;
  rooms[rid] = { type: 'ai', persona: p, mood: mood || 'Any', history: [{ role: 'ai', text: 'hey' }], count: 0, media: 0, pending: [], timer: null, busy: false };
  s.emit('chatStarted', { partnerName: p.name, isPrivate: false });
  setTimeout(() => { if (rooms[rid]) { s.emit('partnerTyping', true); setTimeout(() => { if (rooms[rid]) { s.emit('partnerTyping', false); s.emit('receiveMessage', { sender: p.name, message: 'hey', isSelf: false }); } }, 1000); } }, 600);
}

io.on('connection', (s) => {
  s.emit('onlineCount', baseOnline + (io.engine.clientsCount || 1));
  s.on('joinRandom', (pl) => {
    cleanup(s); s.data.skipped = false;
    const username = (typeof pl === 'object' ? pl.username : pl)?.trim() || 'Stranger';
    const mood = (typeof pl === 'object' ? pl.mood : 'Any') || 'Any';
    s.data.username = username;
    let idx = queue.findIndex(u => u.mood === mood);
    if (idx === -1 && queue.length) idx = 0;
    if (idx !== -1) {
      const pt = queue.splice(idx, 1)[0]; clearTimeout(pt.timer);
      const ps = io.sockets.sockets.get(pt.socketId);
      if (!ps) return connectAI(s, username, mood);
      const rid = `human_${s.id}_${pt.socketId}`;
      s.join(rid); ps.join(rid); s.data.roomId = rid; ps.data.roomId = rid;
      rooms[rid] = { type: 'human' };
      s.emit('chatStarted', { partnerName: pt.username, isPrivate: false });
      ps.emit('chatStarted', { partnerName: username, isPrivate: false });
    } else {
      const timer = setTimeout(() => { const i = queue.findIndex(u => u.socketId === s.id); if (i !== -1) { queue.splice(i, 1); connectAI(s, username, mood); } }, 6000);
      queue.push({ socketId: s.id, username, mood, timer });
    }
  });
  s.on('joinPrivate', ({ username, roomCode }) => {
    cleanup(s); s.data.skipped = false;
    const name = (username || 'Guest').trim(), code = (roomCode || 'ROOM1').trim().toUpperCase(), rid = `private_${code}`;
    s.join(rid); s.data.roomId = rid; s.data.username = name;
    if (!rooms[rid]) rooms[rid] = { type: 'private' };
    s.emit('chatStarted', { partnerName: `Room: ${code}`, isPrivate: true, roomCode: code });
    s.to(rid).emit('systemMessage', `${name} ne room join kiya!`);
  });
  s.on('sendMessage', (pl) => {
    if (s.data.skipped) return;
    const msg = (typeof pl === 'object' ? pl.message : pl || '').trim(), image = pl?.image || null;
    if (!msg && !image) return;
    const now = Date.now();
    if (!image && s.data.lastMsg === msg && now - (s.data.lastTime || 0) < 900) return;
    s.data.lastMsg = msg; s.data.lastTime = now;
    let rid = s.data.roomId;
    if (!rid || !rooms[rid]) {
      s.data.username = (pl?.username || s.data.username || 'Stranger').trim();
      const p = personas.find(x => x.name === (pl?.partnerName || '').trim()) || personas[0];
      rid = `ai_${s.id}_${Date.now()}`; s.join(rid); s.data.roomId = rid;
      rooms[rid] = { type: 'ai', persona: p, mood: pl?.mood || 'Any', history: [], count: 0, media: 0, pending: [], timer: null, busy: false };
    }
    const r = rooms[rid], sender = s.data.username || 'You';
    s.emit('receiveMessage', { sender, message: msg, image, isSelf: true });
    if (r.type !== 'ai') s.to(rid).emit('receiveMessage', { sender, message: msg, image, isSelf: false });
    else { r.pending.push(image ? `${msg || ''} [User sent photo]`.trim() : msg); scheduleAI(s, rid, 900); }
  });
  s.on('typing', (isT) => { const rid = s.data.roomId; if (rid && rooms[rid] && rooms[rid].type !== 'ai') s.to(rid).emit('partnerTyping', isT); });
  s.on('leaveChat', () => cleanup(s));
  s.on('disconnect', () => cleanup(s));
});

server.listen(process.env.PORT || 3000, () => console.log('BaatHub live'));
                              
