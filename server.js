const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 5e6, pingTimeout: 60000, pingInterval: 25000 });

const extraKeys = [];

const realGirlPics = [
  'https://randomuser.me/api/portraits/women/44.jpg',
  'https://randomuser.me/api/portraits/women/65.jpg',
  'https://randomuser.me/api/portraits/women/68.jpg',
  'https://randomuser.me/api/portraits/women/12.jpg',
  'https://randomuser.me/api/portraits/women/26.jpg',
  'https://randomuser.me/api/portraits/women/33.jpg',
  'https://randomuser.me/api/portraits/women/50.jpg',
  'https://randomuser.me/api/portraits/women/79.jpg',
  'https://randomuser.me/api/portraits/women/85.jpg',
  'https://randomuser.me/api/portraits/women/90.jpg'
];

const realBoyPics = [
  'https://randomuser.me/api/portraits/men/32.jpg',
  'https://randomuser.me/api/portraits/men/45.jpg',
  'https://randomuser.me/api/portraits/men/22.jpg',
  'https://randomuser.me/api/portraits/men/11.jpg',
  'https://randomuser.me/api/portraits/men/54.jpg',
  'https://randomuser.me/api/portraits/men/67.jpg',
  'https://randomuser.me/api/portraits/men/75.jpg',
  'https://randomuser.me/api/portraits/men/83.jpg'
];

const realGifs = [
  'https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif',
  'https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif',
  'https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif',
  'https://media.giphy.com/media/3oriO0OEd9QIDdllqo/giphy.gif'
];

app.use(express.static(path.join(__dirname, 'public')));
app.get('/privacy', (req, res) => res.send('<h1>Privacy Policy - BaatHub</h1><p>Hum aapki chat save nahi karte.</p><a href="/">Back</a>'));
app.get('/terms', (req, res) => res.send('<h1>Terms - BaatHub</h1><p>Sabhyata banaye rakhein.</p><a href="/">Back</a>'));

function getAllKeys() {
  const envKey = (process.env.GEMINI_API_KEY || '').trim();
  return [...new Set([envKey, ...extraKeys.map(k => k.trim())].filter(Boolean))];
}

let activeModel = null;
let discoveredModels = [];
let lastErr = 'No API call yet';

async function tryCall(model, key, sys, contents) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8500);
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sys }] },
        contents,
        generationConfig: { temperature: 0.95, maxOutputTokens: 250 }
      })
    });
    clearTimeout(t);
    const d = await r.json();
    if (!r.ok || d.error) {
      lastErr = `${model}: ${d?.error?.message || r.statusText}`;
      return null;
    }
    const raw = (d?.candidates?.[0]?.content?.parts || [])
      .filter(p => !p.thought && typeof p.text === 'string')
      .map(p => p.text)
      .join('')
      .trim();

    const skip = /\[SKIP\]/i.test(raw);
    const sendPic = /\[SEND_PIC\]/i.test(raw);
    const sendGif = /\[SEND_GIF\]/i.test(raw);
    const text = raw
      .replace(/\[(SKIP|SEND_PIC|SEND_GIF)\]/gi, '')
      .split('\n')
      .map(x => x.trim())
      .filter(x => x && !/^(thought|thinking|building|refining|draft|\*)/i.test(x))
      .join(' ')
      .replace(/^["'`]+|["'`]+$/g, '')
      .trim();

    if (text || sendPic || sendGif) {
      lastErr = null;
      return { text, skip, sendPic, sendGif };
    }
    lastErr = `${model}: Empty`;
  } catch (e) {
    lastErr = `${model}: ${e.message}`;
  }
  return null;
}

async function callAI(sys, contents) {
  const keys = getAllKeys();
  if (!keys.length) return null;

  if (activeModel) {
    for (const k of keys) {
      const ok = await tryCall(activeModel, k, sys, contents);
      if (ok) return ok;
    }
    activeModel = null;
  }

  for (const k of keys) {
    if (!discoveredModels.length) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${k}`);
        const d = await r.json();
        const bad = ['image', 'tts', 'audio', 'vision', 'embedding', 'aqa', 'robotics', 'computer', 'learnlm', 'bisect'];
        discoveredModels = (d.models || [])
          .filter(m => (m.supportedGenerationMethods || []).includes('generateContent') && m.name.includes('gemini') && !bad.some(b => m.name.toLowerCase().includes(b)))
          .map(m => m.name.replace('models/', ''));
      } catch (e) {
        lastErr = `ListModels: ${e.message}`;
      }
    }
    const models = [...new Set(['gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-3.0-flash', 'gemini-flash-latest', ...discoveredModels])];
    for (const m of models.slice(0, 6)) {
      const ok = await tryCall(m, k, sys, contents);
      if (ok) {
        activeModel = m;
        return ok;
      }
    }
  }
  return null;
}

app.get('/test-ai', async (req, res) => {
  const keys = getAllKeys();
  if (!keys.length) return res.send('<h2>GEMINI_API_KEY missing on Render</h2>');
  const out = await callAI('Reply naturally in 5 words in Hinglish.', [{ role: 'user', parts: [{ text: 'aur bhai kya haal hai' }] }]);
  res.send(out ? `<h2>✅ Real AI Working (${activeModel})</h2><p>${out.text}</p><a href="/">Back to Chat</a>` : `<h2>❌ API Quota/Key Status:</h2><pre>${lastErr}</pre>`);
});

// Always 500+ Online Members with live natural fluctuation
const baseOnline = 515 + Math.floor(Math.random() * 25);
let liveJitter = Math.floor(Math.random() * 15);
function getOnlineCount() {
  const realCount = io.engine.clientsCount || 1;
  return Math.max(508, baseOnline + realCount + liveJitter);
}
setInterval(() => {
  liveJitter = Math.floor(Math.random() * 24) - 6;
  io.emit('onlineCount', getOnlineCount());
}, 8000);

const personas = [
  ['Sneha','girl',20,'Delhi',0],['Aarav','boy',21,'Mumbai',0],['Priya','girl',19,'Jaipur',1],['Rohan','boy',22,'Pune',1],
  ['Ananya','girl',20,'Lucknow',2],['Kabir','boy',21,'Indore',2],['Riya','girl',21,'Chandigarh',3],['Dev','boy',20,'Noida',3],
  ['Kavya','girl',19,'Bhopal',4],['Aditya','boy',22,'Bengaluru',4],['Nidhi','girl',20,'Patna',5],['Yash','boy',21,'Ahmedabad',5],
  ['Tanya','girl',21,'Gurugram',6],['Karan','boy',23,'Dehradun',6],['Simran','girl',20,'Amritsar',7],['Harsh','boy',19,'Kanpur',7],
  ['Meera','girl',22,'Kolkata',8],['Siddharth','boy',21,'Hyderabad',2],['Pooja','girl',20,'Varanasi',9],['Manish','boy',22,'Ranchi',3],
  ['Isha','girl',19,'Surat',4],['Vikram','boy',23,'Jodhpur',5],['Shreya','girl',21,'Nagpur',6],['Nikhil','boy',20,'Agra',7]
].map(([name, gender, age, city, picIdx]) => ({ name, gender, age, city, picIdx }));

const isAbusive = t => /\b(mc|bc|bsdk|madarchod|bhenchod|behenchod|chutiya|chutiye|gandu|randi|harami|kamina|laude|lode|lund|chut|boobs|nude|nudes|sex|sexy|porn|xxx|fuck|fucking|bitch|asshole|dick|pussy|horny)\b/i.test(t);

function rememberUserInfo(room, text) {
  const cities = ['delhi', 'mumbai', 'lucknow', 'jaipur', 'patna', 'kanpur', 'noida', 'pune', 'indore', 'bhopal', 'kolkata', 'chandigarh', 'agra', 'varanasi', 'surat', 'ahmedabad', 'hyderabad', 'bangalore', 'bengaluru', 'ranchi', 'dehradun', 'amritsar', 'jodhpur', 'nagpur', 'gurugram', 'gurgaon', 'ghaziabad'];
  const lower = text.toLowerCase();
  for (const c of cities) {
    if (lower.includes(c)) {
      room.mem.city = c.charAt(0).toUpperCase() + c.slice(1);
      break;
    }
  }
  const nameMatch = text.match(/(?:naam|name|mai|me|main)\s+(?:hai\s+|h\s+)?([a-zA-Z]{3,15})/i);
  if (nameMatch && !cities.includes(nameMatch[1].toLowerCase()) && !['delhi', 'se', 'hu', 'hoon', 'bhi', 'kya', 'aur', 'theek', 'mast', 'pic', 'photo'].includes(nameMatch[1].toLowerCase())) {
    room.mem.name = nameMatch[1];
  }
}

function humanFallback(room, userMsg) {
  const isGirl = room.persona.gender === 'girl';
  const m = userMsg.toLowerCase();
  const askedPic = /\b(pic|pics|photo|selfie|snaps?|dikhao|dikha|shakal|face)\b/i.test(m);
  const canPic = room.count >= 4;

  if (askedPic && !canPic) {
    return isGirl
      ? `arey ${room.mem.name ? room.mem.name + ' ' : ''}abhi toh baat shuru hui h, pehle jaan pehchan toh ho jaye 😂`
      : `itni jaldi kya h ${room.mem.name || 'bhai'}, pehle thodi baat toh kr le 😂`;
  }
  if (askedPic && canPic) {
    return isGirl ? 'ye lo abhi ki pic 🙈' : 'ye le bhai 😎';
  }
  if (/\b(ai|bot|robot)\b/i.test(m)) {
    return isGirl
      ? `pagal ho kya yr 😂 ${room.persona.city} me baithi hu mai, insaan hi hu`
      : `pagal h kya bhai 😂 ${room.persona.city} me baitha hu mai, insaan hi hu`;
  }
  if (m.includes('naam') || m.includes('name')) {
    return `mera naam ${room.persona.name} h, ${room.persona.city} se 🙂`;
  }
  if (m.includes('kahan') || m.includes('kha se') || m.includes('city')) {
    return room.mem.city
      ? `mai ${room.persona.city} se hu! tum toh ${room.mem.city} se ho na?`
      : `mai ${room.persona.city} se hu! tum kahan se ho?`;
  }
  if (m.includes('clg') || m.includes('college') || m.includes('padhai') || m.includes('job')) {
    return isGirl
      ? `mai abhi clg me hu yr, tum kya kr rhe ho?`
      : `mai abhi clg me hu bhai, tu kya kr rha h?`;
  }
  if (m.includes('kya kr') || m.includes('kya kar') || m.includes('kya chal')) {
    return isGirl
      ? `kuch khas nhi yr bas phone chala rhi hu, tum btao?`
      : `kuch khas nhi bhai bas phone chala rha hu, tu bta?`;
  }
  if (m.includes('truth')) {
    return isGirl
      ? `sach btau toh kabhi kabhi bina wajah late night jagti hu 😂`
      : `sach btau toh kabhi kabhi bina wajah late night jagta hu 😂`;
  }
  if (m.includes('dare')) {
    return `chal dare accepted! apna last searched song batao abhi 🎵`;
  }

  const options = isGirl
    ? [
        `${room.mem.name ? room.mem.name + ', ' : ''}acha nice yr! waise free time me kya krna pasand h?`,
        `haha sahi bol rhe ho yr, aur btao kya scene h?`,
        `yahan ${room.persona.city} me toh mast mausam h, tumhara din kaisa ja rha?`,
        `ek truth ya dare khelein kya? neeche dice dabao 🎲`
      ]
    : [
        `${room.mem.name ? room.mem.name + ', ' : ''}acha nice bhai! waise free time me kya krna pasand h?`,
        `haha sahi bol rha h bhai, aur bta kya scene h?`,
        `yahan ${room.persona.city} me toh mast mausam h, tera din kaisa ja rha?`,
        `ek truth ya dare khelein kya? neeche dice dabao 🎲`
      ];

  const unused = options.filter(x => !room.used.has(x.toLowerCase()));
  return unused.length ? unused[0] : options[room.count % options.length];
}

let queue = [];
const rooms = {};

function cleanup(s) {
  const qi = queue.findIndex(u => u.socketId === s.id);
  if (qi !== -1) { clearTimeout(queue[qi].timer); queue.splice(qi, 1); }
  const rid = s.data.roomId;
  if (rid && rooms[rid]) {
    if (rooms[rid].timer) clearTimeout(rooms[rid].timer);
    if (rooms[rid].type === 'human') {
      s.to(rid).emit('partnerLeft', 'Saamne wala user chala gaya.');
      delete rooms[rid];
    } else if (rooms[rid].type === 'private') {
      s.to(rid).emit('systemMessage', `${s.data.username || 'User'} room se bahar gaya.`);
    } else {
      delete rooms[rid];
    }
    s.leave(rid);
    s.data.roomId = null;
  }
}

async function getReply(room, userMsg) {
  const isGirl = room.persona.gender === 'girl';
  if (isAbusive(userMsg)) {
    return { text: isGirl ? 'tameez se baat kr pehle 😒 bye' : 'faltu giri mat kr bhai, bye', skip: true, image: null };
  }

  room.count = (room.count || 0) + 1;
  rememberUserInfo(room, userMsg);
  room.history.push({ role: 'user', text: userMsg });

  const canPic = room.count >= 4;
  const askedPic = /\b(pic|pics|photo|selfie|snaps?|dikhao|dikha|shakal|face)\b/i.test(userMsg);
  const askedGif = /\b(gif|meme)\b/i.test(userMsg);

  const gRule = isGirl
    ? 'Use feminine Hindi verbs ("kr rhi hu", "baithi hu", "karti hu").'
    : 'Use masculine Hindi verbs ("kr rha hu", "baitha hu", "karta hu").';
  const pRule = canPic
    ? 'User has chatted enough. If they ask for pic/selfie now, agree playfully and append [SEND_PIC] at the end.'
    : `User has only sent ${room.count} messages. If they ask for pic/selfie right now, DO NOT send pic or [SEND_PIC]; refuse playfully like "${isGirl ? 'arey abhi toh baat shuru hui h, pehle thodi baat toh kr le 😂' : 'itni jaldi kya h bhai, pehle thodi baat toh kr le 😂'}".`;
  const memHint = [
    room.mem.name ? `User name: ${room.mem.name}` : '',
    room.mem.city ? `User city: ${room.mem.city}` : ''
  ].filter(Boolean).join(', ');

  const sys = `You are ${room.persona.name}, a ${room.persona.age}yo Indian ${isGirl ? 'girl' : 'boy'} from ${room.persona.city} chatting live on BaatHub (mood: ${room.mood}). ${memHint ? `Known info: ${memHint}.` : ''}
Rules:
1. Reply in 1 short casual Hinglish/English line (3-14 words), like a real Indian Gen-Z person.
2. Remember everything from the conversation; never repeat questions or lines.
3. ${gRule}
4. ${pRule}
5. If user asks for GIF/meme, reply and append [SEND_GIF] at the end.
6. If user is rude/creepy/spamming, reply annoyed and append [SKIP] at the end. Never admit you are AI.`;

  const contents = [];
  for (const h of room.history.slice(-28)) {
    const role = h.role === 'user' ? 'user' : 'model';
    if (!contents.length && role === 'model') continue;
    if (contents.length && contents[contents.length - 1].role === role) {
      contents[contents.length - 1].parts[0].text += '\n' + h.text;
    } else {
      contents.push({ role, parts: [{ text: h.text }] });
    }
  }

  const ai = await callAI(sys, contents);

  let image = null;
  if ((ai && ai.sendGif) || askedGif) {
    image = realGifs[room.media++ % realGifs.length];
  } else if (canPic && ((ai && ai.sendPic) || askedPic)) {
    const list = isGirl ? realGirlPics : realBoyPics;
    image = list[room.persona.picIdx % list.length];
  }

  let text = ai?.text || '';
  if (!text || room.used.has(text.toLowerCase())) {
    text = humanFallback(room, userMsg);
  }

  room.used.add(text.toLowerCase());
  room.history.push({ role: 'ai', text });
  return { text, skip: Boolean(ai?.skip), image };
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
      s.emit('receiveMessage', { sender: rm.persona.name, message: res.text, image: res.image, isSelf: false });

      if (res.skip) {
        setTimeout(() => {
          if (!rooms[rid]) return;
          const n = rm.persona.name;
          delete rooms[rid];
          s.leave(rid);
          s.data.roomId = null;
          s.data.skipped = true;
          s.emit('partnerLeft', `${n} ne chat skip kar di.`);
        }, 800);
      }
    } finally {
      rm.busy = false;
      s.emit('partnerTyping', false);
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
  s.join(rid);
  s.data.roomId = rid;
  s.data.username = username;
  s.data.skipped = false;

  rooms[rid] = {
    type: 'ai',
    persona: p,
    mood: mood || 'Any',
    mem: {},
    history: [{ role: 'ai', text: 'hey' }],
    used: new Set(['hey']),
    count: 0,
    media: 0,
    pending: [],
    timer: null,
    busy: false
  };

  s.emit('chatStarted', { partnerName: p.name, isPrivate: false });
  setTimeout(() => {
    if (!rooms[rid]) return;
    s.emit('partnerTyping', true);
    setTimeout(() => {
      if (!rooms[rid]) return;
      s.emit('partnerTyping', false);
      s.emit('receiveMessage', { sender: p.name, message: 'hey', isSelf: false });
    }, 1000);
  }, 600);
}

io.on('connection', (s) => {
  s.emit('onlineCount', getOnlineCount());

  s.on('joinRandom', (pl) => {
    cleanup(s);
    s.data.skipped = false;
    const username = (typeof pl === 'object' ? pl.username : pl)?.trim() || 'Stranger';
    const mood = (typeof pl === 'object' ? pl.mood : 'Any') || 'Any';
    s.data.username = username;

    let idx = queue.findIndex(u => u.mood === mood);
    if (idx === -1 && queue.length) idx = 0;

    if (idx !== -1) {
      const pt = queue.splice(idx, 1)[0];
      clearTimeout(pt.timer);
      const ps = io.sockets.sockets.get(pt.socketId);
      if (!ps) return connectAI(s, username, mood);
      const rid = `human_${s.id}_${pt.socketId}`;
      s.join(rid);
      ps.join(rid);
      s.data.roomId = rid;
      ps.data.roomId = rid;
      rooms[rid] = { type: 'human' };
      s.emit('chatStarted', { partnerName: pt.username, isPrivate: false });
      ps.emit('chatStarted', { partnerName: username, isPrivate: false });
    } else {
      const timer = setTimeout(() => {
        const i = queue.findIndex(u => u.socketId === s.id);
        if (i !== -1) { queue.splice(i, 1); connectAI(s, username, mood); }
      }, 6000);
      queue.push({ socketId: s.id, username, mood, timer });
    }
  });

  s.on('joinPrivate', ({ username, roomCode }) => {
    cleanup(s);
    s.data.skipped = false;
    const name = (username || 'Guest').trim();
    const code = (roomCode || 'ROOM1').trim().toUpperCase();
    const rid = `private_${code}`;
    s.join(rid);
    s.data.roomId = rid;
    s.data.username = name;
    if (!rooms[rid]) rooms[rid] = { type: 'private' };
    s.emit('chatStarted', { partnerName: `Room: ${code}`, isPrivate: true, roomCode: code });
    s.to(rid).emit('systemMessage', `${name} ne room join kiya!`);
  });

  s.on('sendMessage', (pl) => {
    if (s.data.skipped) return;
    const msg = (typeof pl === 'object' ? pl.message : pl || '').trim();
    const image = pl?.image || null;
    if (!msg && !image) return;

    const now = Date.now();
    if (!image && s.data.lastMsg === msg && now - (s.data.lastTime || 0) < 900) return;
    s.data.lastMsg = msg;
    s.data.lastTime = now;

    let rid = s.data.roomId;
    if (!rid || !rooms[rid]) {
      s.data.username = (pl?.username || s.data.username || 'Stranger').trim();
      const p = personas.find(x => x.name === (pl?.partnerName || '').trim()) || personas[0];
      rid = `ai_${s.id}_${Date.now()}`;
      s.join(rid);
      s.data.roomId = rid;
      rooms[rid] = {
        type: 'ai',
        persona: p,
        mood: pl?.mood || 'Any',
        mem: {},
        history: [],
        used: new Set(),
        count: 0,
        media: 0,
        pending: [],
        timer: null,
        busy: false
      };
    }

    const r = rooms[rid];
    const sender = s.data.username || 'You';
    s.emit('receiveMessage', { sender, message: msg, image, isSelf: true });

    if (r.type !== 'ai') {
      s.to(rid).emit('receiveMessage', { sender, message: msg, image, isSelf: false });
    } else {
      r.pending.push(image ? `${msg || ''} [User sent photo]`.trim() : msg);
      scheduleAI(s, rid, 900);
    }
  });

  s.on('typing', (isT) => {
    const rid = s.data.roomId;
    if (rid && rooms[rid] && rooms[rid].type !== 'ai') s.to(rid).emit('partnerTyping', isT);
  });

  s.on('leaveChat', () => cleanup(s));
  s.on('disconnect', () => cleanup(s));
});

server.listen(process.env.PORT || 3000, () => co
