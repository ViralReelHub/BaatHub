const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e7, pingTimeout: 60000, pingInterval: 25000 });

app.use(express.static(path.join(__dirname, 'public')));

app.get('/privacy', (req, res) => res.send('<h1>Privacy Policy - BaatHub</h1><p>Hum aapki chat save nahi karte.</p><a href="/">Back</a>'));
app.get('/terms', (req, res) => res.send('<h1>Terms - BaatHub</h1><p>Sabhyata banaye rakhein.</p><a href="/">Back</a>'));
app.get('/sitemap.xml', (req, res) => {
  res.header('Content-Type', 'application/xml');
  res.send('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://baathub.onrender.com/</loc></url></urlset>');
});

let cachedModel = null;
let lastAiError = 'No request yet';

async function fetchTimeout(url, opts = {}, ms = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function sanitizeReply(raw) {
  if (!raw) return null;
  const cleaned = raw
    .replace(/\[SKIP\]/gi, '')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !/^(building|refining|thinking|thought|draft|analysis|note|step|\*|\-|#)/i.test(l))
    .join(' ')
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim();
  return cleaned.length >= 2 ? cleaned : null;
}

async function callGemini(model, key, sys, contents) {
  try {
    const genConfig = { temperature: 0.9, maxOutputTokens: 300 };
    if (model.includes('2.5-flash') && !model.includes('lite')) {
      genConfig.thinkingConfig = { thinkingBudget: 0 };
    } else if (model.includes('gemini-3')) {
      genConfig.thinkingConfig = { thinkingBudget: 128 };
    }

    const body = { contents, generationConfig: genConfig };
    if (sys) body.systemInstruction = { parts: [{ text: sys }] };

    const res = await fetchTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
      12000
    );

    const data = await res.json();
    if (!res.ok || data.error) {
      lastAiError = `${model}: ${data?.error?.message || res.statusText}`;
      return null;
    }

    const parts = data?.candidates?.[0]?.content?.parts || [];
    const raw = parts.filter(p => !p.thought && typeof p.text === 'string').map(p => p.text).join('').trim();
    const skip = /\[SKIP\]/i.test(raw);
    const text = sanitizeReply(raw);
    if (!text) {
      lastAiError = `${model}: Empty after filter`;
      return null;
    }
    lastAiError = null;
    return { text, skip };
  } catch (e) {
    lastAiError = `${model}: ${e.name === 'AbortError' ? 'Timeout' : e.message}`;
    return null;
  }
}

async function askAI(key, sys, contents) {
  if (cachedModel) {
    const ok = await callGemini(cachedModel, key, sys, contents);
    if (ok) return ok;
    cachedModel = null;
  }

  const directModels = ['gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-3-flash-preview'];
  for (const m of directModels) {
    const res = await callGemini(m, key, sys, contents);
    if (res) {
      cachedModel = m;
      return res;
    }
  }

  try {
    const r = await fetchTimeout(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, {}, 8000);
    const d = await r.json();
    const bad = ['image', 'tts', 'audio', 'vision', 'embedding', 'aqa', 'robotics', 'computer', 'learnlm', 'bisect'];
    const list = (d.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent') && m.name.includes('gemini') && !bad.some(b => m.name.toLowerCase().includes(b)))
      .map(m => m.name.replace('models/', ''))
      .filter(m => !directModels.includes(m));

    for (const m of list.slice(0, 3)) {
      const res = await callGemini(m, key, sys, contents);
      if (res) {
        cachedModel = m;
        return res;
      }
    }
  } catch (e) {
    lastAiError = e.message;
  }
  return null;
}

app.get('/test-ai', async (req, res) => {
  const key = (process.env.GEMINI_API_KEY || '').trim();
  if (!key) return res.send('<h2>GEMINI_API_KEY missing on Render</h2>');
  const resObj = await askAI(key, 'Reply casually in Hinglish in 1 short line.', [{ role: 'user', parts: [{ text: 'aur bhai kya haal hai' }] }]);
  res.send(resObj ? `<h2>✅ Working (${cachedModel})</h2><p>${resObj.text}</p><a href="/">Back to Chat</a>` : `<h2>❌ Error:</h2><pre>${lastAiError}</pre>`);
});

const baseOnline = Math.floor(Math.random() * 8) + 25;
setInterval(() => io.emit('onlineCount', baseOnline + (io.engine.clientsCount || 1) + Math.floor(Math.random() * 4)), 10000);

const personas = [
  ['Sneha','girl',20,'Delhi','witty aur chill'], ['Aarav','boy',21,'Mumbai','funny aur bindass'],
  ['Priya','girl',19,'Jaipur','sweet aur baatuni'], ['Rohan','boy',22,'Pune','calm aur friendly'],
  ['Ananya','girl',20,'Lucknow','playful aur energetic'], ['Kabir','boy',21,'Indore','casual aur humorous'],
  ['Riya','girl',21,'Chandigarh','frank aur mastmaula'], ['Dev','boy',20,'Noida','chill aur friendly'],
  ['Kavya','girl',19,'Bhopal','soft-spoken aur caring'], ['Aditya','boy',22,'Bengaluru','smart aur observant'],
  ['Nidhi','girl',20,'Patna','relatable aur genuine'], ['Yash','boy',21,'Ahmedabad','jolly aur energetic'],
  ['Tanya','girl',21,'Gurugram','bubbly aur fun'], ['Karan','boy',23,'Dehradun','deep thinker aur chill'],
  ['Simran','girl',20,'Amritsar','warm aur energetic'], ['Harsh','boy',19,'Kanpur','desi humour'],
  ['Meera','girl',22,'Kolkata','thoughtful aur witty'], ['Siddharth','boy',21,'Hyderabad','cool aur easygoing'],
  ['Pooja','girl',20,'Varanasi','simple aur sweet'], ['Manish','boy',22,'Ranchi','down to earth'],
  ['Isha','girl',19,'Surat','cute aur talkative'], ['Vikram','boy',23,'Jodhpur','mature aur supportive'],
  ['Shreya','girl',21,'Nagpur','curious aur smart'], ['Nikhil','boy',20,'Agra','casual aur nocturnal']
].map(([name, gender, age, city, vibe]) => ({ name, gender, age, city, vibe }));

const isAbusive = t => /\b(mc|bc|bsdk|madarchod|bhenchod|behenchod|chutiya|chutiye|gandu|randi|harami|kamina|laude|lode|lund|chut|boobs|nude|nudes|sex|sexy|porn|xxx|fuck|fucking|bitch|asshole|dick|pussy|horny)\b/i.test(t);

function getSeason() {
  const d = new Date();
  const month = d.toLocaleString('en-IN', { month: 'long', timeZone: 'Asia/Kolkata' });
  const m = d.getMonth();
  const s = (m >= 10 || m <= 1) ? 'thand / winter season (North India aur Delhi me thand/fog h, garmi nahi h)' : (m >= 2 && m <= 5) ? 'garmi / summer' : 'baarish / monsoon';
  return `Abhi India me ${month} chal rha h (${s}).`;
}

function extractUserDetails(room, text) {
  const cities = ['delhi', 'mumbai', 'lucknow', 'jaipur', 'patna', 'kanpur', 'noida', 'pune', 'indore', 'bhopal', 'kolkata', 'chandigarh', 'agra', 'varanasi', 'mirzapur', 'surat', 'ahmedabad', 'hyderabad', 'bangalore', 'bengaluru', 'ranchi', 'dehradun', 'amritsar', 'jodhpur', 'nagpur', 'gurugram', 'gurgaon', 'ghaziabad'];
  const lower = text.toLowerCase();
  for (const c of cities) {
    if (lower.includes(c)) {
      room.userCity = c.charAt(0).toUpperCase() + c.slice(1);
      break;
    }
  }
  const nameMatch = text.match(/(?:naam|name|mai|me|main)\s+(?:hai\s+|h\s+)?([a-zA-Z]{3,15})/i);
  if (nameMatch && !cities.includes(nameMatch[1].toLowerCase()) && !['delhi', 'se', 'hu', 'hoon', 'bhi', 'kya', 'aur', 'theek', 'mast'].includes(nameMatch[1].toLowerCase())) {
    room.userName = nameMatch[1];
  }
}

function smartFallback(room, userMsg) {
  const isGirl = room.persona.gender === 'girl';
  const m = userMsg.toLowerCase();
  const pool = [];

  if (/\b(ai|bot|robot)\b/i.test(m)) {
    pool.push(`pagal h kya yr 😂 ${room.persona.city} me baithi hu mai, insaan hi hu`.replace('baithi', isGirl ? 'baithi' : 'baitha'));
  } else if (m.includes('kasa pata') || m.includes('kaise pata')) {
    pool.push(isGirl ? 'arey abhi toh bataya tumne 😂 bhool gye kya?' : 'arey abhi toh bataya tune 😂 bhool gya kya?');
  } else if (m.includes('delhi')) {
    pool.push(isGirl ? 'arre waah delhi! wahan toh abhi mast thand chal rhi hogi na?' : 'arre waah delhi! wahan toh abhi mast thand chal rhi hogi na bhai?');
  } else if (m.includes('thand') || m.includes('garmi') || m.includes('moss') || m.includes('mausam')) {
    pool.push('haha sorry yr dimaag ghoom gya tha 😂 thand hi chal rhi h full');
  } else if (m.includes('clg') || m.includes('college') || m.includes('padhai')) {
    pool.push('oh sahi h! kaunsa course kr rhe ho?');
  } else if (m.includes('kya kr') || m.includes('kya kar') || m.includes('kya chal')) {
    pool.push(isGirl ? 'kuch khas nhi yr bas bore ho rhi thi, tum btao?' : 'kuch khas nhi bhai bas bore ho rha tha, tu bta?');
  }

  pool.push(
    isGirl ? `acha nice yr! waise abhi clg me ho ya job kr rhe ho?` : `acha nice bhai! waise abhi clg me ho ya job kr rhe ho?`,
    isGirl ? `yahan ${room.persona.city} me toh aaj bada lazy sa din h, tumhara din kaisa gya?` : `yahan ${room.persona.city} me toh aaj bada lazy sa din h, tera din kaisa gya?`,
    `koi mast movie ya web series suggest kro yr, dekhne ke liye kuch nhi mil rha`,
    isGirl ? `haha bilkul! waise free time me kya krna pasand h tumhe?` : `haha bilkul! waise free time me kya krna pasand h tujhe?`,
    `ek Truth ya Dare khelein kya? neeche T/D button dabao 😂`,
    isGirl ? `sach me? waise gaane sunte ho ya gaming ka shauk h?` : `sach me? waise gaane sunte ho ya gaming ka shauk h?`
  );

  const unused = pool.filter(r => !room.usedReplies.has(r.toLowerCase()));
  const chosen = unused.length ? unused[0] : pool[Math.floor(Math.random() * pool.length)];
  room.usedReplies.add(chosen.toLowerCase());
  return chosen;
}

let queue = [];
const rooms = {};

function cleanup(socket) {
  const qi = queue.findIndex(u => u.socketId === socket.id);
  if (qi !== -1) { clearTimeout(queue[qi].timer); queue.splice(qi, 1); }
  const rid = socket.data.roomId;
  if (rid && rooms[rid]) {
    const r = rooms[rid];
    if (r.replyTimer) clearTimeout(r.replyTimer);
    if (r.safetyTimer) clearTimeout(r.safetyTimer);
    if (r.type === 'human') { socket.to(rid).emit('partnerLeft', 'Saamne wala user chala gaya.'); delete rooms[rid]; }
    else if (r.type === 'private') socket.to(rid).emit('systemMessage', `${socket.data.username || 'User'} room se bahar gaya.`);
    else delete rooms[rid];
    socket.leave(rid);
    socket.data.roomId = null;
  }
}

async function getAIReply(room, userMsg) {
  const { persona, mood, history, opener } = room;
  const isGirl = persona.gender === 'girl';

  if (isAbusive(userMsg)) {
    const skips = isGirl ? ['chi tameez seekh le pehle 😒 bye', 'bakwas mat kr, kisi aur ko pakad'] : ['dimaag kharab h kya? tameez se baat kr', 'faltu giri mat kr bhai, bye'];
    return { text: skips[Math.floor(Math.random() * skips.length)], skip: true };
  }

  extractUserDetails(room, userMsg);
  history.push({ role: 'user', text: userMsg });
  const key = (process.env.GEMINI_API_KEY || '').trim();

  if (key) {
    const gRule = isGirl ? 'Feminine Hindi verbs use krna ("kr rhi hu", "baithi hu", "karti hu").' : 'Masculine Hindi verbs use krna ("kr rha hu", "baitha hu", "karta hu").';
    const knownUser = [room.userName ? `User ka naam: ${room.userName}` : '', room.userCity ? `User ki city: ${room.userCity}` : ''].filter(Boolean).join(', ');
    const sys = `Tum real Indian ${isGirl ? 'ladki' : 'ladka'} ho: ${persona.name}, age ${persona.age}, city ${persona.city}, vibe: ${persona.vibe}. BaatHub par stranger se chat kr rhe ho (mood: "${mood}"). Pehla msg: "${opener}". ${getSeason()} ${knownUser ? `(${knownUser})` : ''}
Rules:
1. Sirf final chat reply likho—koi thinking, draft, asterisk (*), ya quotes mat likhna.
2. User ke latest msg ka seedha logical jawab do aur purani baatein yaad rakho.
3. ${gRule}
4. WhatsApp style me sirf 1 chhoti line (max 12-15 words) lowercase casual Hinglish ("yr","acha","hn","nhi","lol") likho. Kabhi bhi apni purani line repeat mat krna.
5. Badtameezi ya spam par annoyed reply ke end me [SKIP] likhna. Kabhi mat maanna ki AI ho.`;

    const contents = [];
    for (const h of history.slice(-20)) {
      const role = h.role === 'user' ? 'user' : 'model';
      if (!contents.length && role === 'model') continue;
      if (contents.length && contents[contents.length - 1].role === role) contents[contents.length - 1].parts[0].text += '\n' + h.text;
      else contents.push({ role, parts: [{ text: h.text }] });
    }

    const ai = await askAI(key, sys, contents);
    if (ai && ai.text && !room.usedReplies.has(ai.text.toLowerCase())) {
      room.usedReplies.add(ai.text.toLowerCase());
      history.push({ role: 'ai', text: ai.text });
      return ai;
    }
  }

  const fb = smartFallback(room, userMsg);
  history.push({ role: 'ai', text: fb });
  return { text: fb, skip: false };
}

function scheduleReply(socket, rid, waitMs = 1100) {
  const room = rooms[rid];
  if (!room || room.type !== 'ai') return;
  if (room.replyTimer) clearTimeout(room.replyTimer);

  room.replyTimer = setTimeout(async () => {
    const r = rooms[rid];
    if (!r || r.isReplying || !r.pending?.length) return;
    r.isReplying = true;

    r.safetyTimer = setTimeout(() => {
      if (rooms[rid]) {
        rooms[rid].isReplying = false;
        socket.emit('partnerTyping', false);
      }
    }, 16000);

    try {
      const msg = r.pending.splice(0).join(' | ');
      const readDelay = Math.min(2000, 1000 + msg.length * 10);
      await new Promise(res => setTimeout(res, readDelay));
      if (!rooms[rid]) return;

      socket.emit('partnerTyping', true);
      const t0 = Date.now();
      const res = await getAIReply(r, msg);
      const typeDelay = Math.max(1100, Math.min(3200, (res.text || '').length * 40 + 500) - (Date.now() - t0));
      await new Promise(res => setTimeout(res, typeDelay));
      if (!rooms[rid]) return;

      socket.emit('partnerTyping', false);
      if (res.text) socket.emit('receiveMessage', { sender: r.persona.name, message: res.text, isSelf: false });

      if (res.skip) {
        setTimeout(() => {
          if (!rooms[rid]) return;
          const name = r.persona.name;
          delete rooms[rid];
          socket.leave(rid);
          socket.data.roomId = null;
          socket.data.wasSkipped = true;
          socket.emit('partnerLeft', `${name} ne chat skip kar di.`);
        }, 900);
        return;
      }
    } finally {
      if (r.safetyTimer) clearTimeout(r.safetyTimer);
      r.isReplying = false;
      socket.emit('partnerTyping', false);
      if (rooms[rid]?.pending?.length) scheduleReply(socket, rid, 900);
    }
  }, waitMs);
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
  const opener = `hey! kya haal ${p.gender === 'girl' ? 'h' : 'hai'}? mai ${p.name}, ${p.city} se 🙂`;
  socket.join(rid);
  socket.data.roomId = rid;
  socket.data.username = username;
  socket.data.wasSkipped = false;
  rooms[rid] = {
    type: 'ai',
    persona: p,
    mood: mood || 'Any',
    opener,
    history: [],
    usedReplies: new Set([opener.toLowerCase()]),
    pending: [],
    replyTimer: null,
    safetyTimer: null,
    isReplying: false
  };
  socket.emit('chatStarted', { partnerName: p.name, isPrivate: false });
  setTimeout(() => {
    if (!rooms[rid]) return;
    socket.emit('partnerTyping', true);
    setTimeout(() => {
      if (!rooms[rid]) return;
      socket.emit('partnerTyping', false);
      rooms[rid].history.push({ role: 'ai', text: opener });
      socket.emit('receiveMessage', { sender: p.name, message: opener, isSelf: false });
    }, 1700);
  }, 1100);
}

io.on('connection', (socket) => {
  socket.emit('onlineCount', baseOnline + (io.engine.clientsCount || 1));

  socket.on('joinRandom', (pl) => {
    cleanup(socket);
    socket.data.wasSkipped = false;
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
    socket.data.wasSkipped = false;
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
    if (socket.data.wasSkipped) return;
    const msg = (typeof pl === 'object' ? pl.message : pl || '').trim();
    if (!msg) return;

    // Double-tap duplicate guard
    const now = Date.now();
    if (socket.data.lastMsg === msg && now - (socket.data.lastMsgTime || 0) < 900) return;
    socket.data.lastMsg = msg;
    socket.data.lastMsgTime = now;

    let rid = socket.data.roomId;
    if (!rid || !rooms[rid]) {
      socket.data.username = (pl?.username || socket.data.username || 'Stranger').trim();
      if (pl?.isPrivate && pl?.roomCode) {
        const code = pl.roomCode.trim().toUpperCase();
        rid = `private_${code}`;
        socket.join(rid); socket.data.roomId = rid;
        if (!rooms[rid]) rooms[rid] = { type: 'private' };
      } else {
        const p = personas.find(x => x.name === (pl?.partnerName || '').trim()) || pickPersona(socket);
        rid = `ai_${socket.id}_${Date.now()}`;
        socket.join(rid); socket.data.roomId = rid;
        rooms[rid] = {
          type: 'ai',
          persona: p,
          mood: pl?.mood || 'Any',
          opener: `hey! mai ${p.name} 🙂`,
          history: [],
          usedReplies: new Set(),
          pending: [],
          replyTimer: null,
          safetyTimer: null,
          isReplying: false
        };
      }
    }
    const r = rooms[rid];
    const sender = socket.data.username || 'You';
    socket.emit('receiveMessage', { sender, message: msg, isSelf: true });
    if (r.type !== 'ai') socket.to(rid).emit('receiveMessage', { sender, message: msg, isSelf: false });
    else { r.pending.push(msg); scheduleReply(socket, rid, 1100); }
  });

  socket.on('typing', (isT) => {
    const rid = socket.data.roomId;
    if (!rid || !rooms[rid]) return;
    if (rooms[rid].type !== 'ai') socket.to
