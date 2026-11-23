const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 10e6, pingTimeout: 60000, pingInterval: 25000 });

const extraKeys = [];
const realGirlPics = ['https://randomuser.me/api/portraits/women/44.jpg','https://randomuser.me/api/portraits/women/65.jpg','https://randomuser.me/api/portraits/women/68.jpg','https://randomuser.me/api/portraits/women/12.jpg','https://randomuser.me/api/portraits/women/26.jpg','https://randomuser.me/api/portraits/women/33.jpg','https://randomuser.me/api/portraits/women/50.jpg','https://randomuser.me/api/portraits/women/79.jpg'];
const realBoyPics = ['https://randomuser.me/api/portraits/men/32.jpg','https://randomuser.me/api/portraits/men/45.jpg','https://randomuser.me/api/portraits/men/22.jpg','https://randomuser.me/api/portraits/men/11.jpg','https://randomuser.me/api/portraits/men/54.jpg','https://randomuser.me/api/portraits/men/67.jpg'];
const realGifs = ['https://media.giphy.com/media/3o7abKhOpu0NwenH3O/giphy.gif','https://media.giphy.com/media/l0MYt5jPR6QX5pnqM/giphy.gif','https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif','https://media.giphy.com/media/3oriO0OEd9QIDdllqo/giphy.gif'];

app.use(express.static(path.join(__dirname, 'public')));

const legalHtml = (title, body) => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} - BaatHub</title><style>body{font-family:sans-serif;background:#080a14;color:#f8fafc;padding:18px;line-height:1.6}.card{max-width:700px;margin:auto;background:#11162b;border:1px solid #262f4f;border-radius:18px;padding:20px}h1{font-size:1.4rem;margin-bottom:10px;color:#fda4af}h2{font-size:1rem;margin:14px 0 6px;color:#a78bfa}p{font-size:.9rem;color:#cbd5e1}a.btn{display:inline-block;margin-bottom:14px;background:#e11d48;color:#fff;text-decoration:none;padding:8px 14px;border-radius:999px;font-size:.82rem;font-weight:700}</style></head><body><div class="card"><a class="btn" href="/">← Back to Chat</a><h1>${title}</h1>${body}</div></body></html>`;

app.get('/privacy', (req, res) => res.send(legalHtml('Privacy Policy', `<h2>1. Chat Privacy</h2><p>BaatHub chats, voice notes aur session data permanently save nahi karta. Exit ya Next dabate hi session clear ho jata hai.</p><h2>2. Media & Mic</h2><p>Photo, mic ya camera sirf aapke active session aur action ke dauran use hote hain.</p><h2>3. Safety</h2><p>Personal details, phone number ya address kisi stranger ke saath share na karein.</p>`)));

app.get('/terms', (req, res) => res.send(legalHtml('Terms & Conditions', `<h2>1. Usage Rules</h2><p>BaatHub ka use karke aap in sharton se sehmat hain. Abusive, spam, illegal ya harassment content sakht mana hai.</p><h2>2. Modes & Girl Mode</h2><p>Text, Voice, Video modes aur moods available hain. Random mode mein koi bhi aa sakta hai; Girl Mode unlock ke baad active hota hai.</p><h2>3. Disclaimer</h2><p>Service as-is basis par milti hai; network ya server interruptions ke liye BaatHub zimmedar nahi hai.</p>`)));

const getAllKeys = () => [...new Set([(process.env.GEMINI_API_KEY || '').trim(), ...extraKeys.map(k => k.trim())].filter(Boolean))];
let activeModel = null, discoveredModels = [], lastErr = 'None';

async function tryCall(m, key, sys, contents) {
  try {
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 8500);
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
      body: JSON.stringify({ systemInstruction: { parts: [{ text: sys }] }, contents, generationConfig: { temperature: 0.95, maxOutputTokens: 220 } })
    });
    clearTimeout(t);
    const d = await r.json();
    if (!r.ok || d.error) { lastErr = `${m}: ${d?.error?.message || r.statusText}`; return null; }
    const raw = (d?.candidates?.[0]?.content?.parts || []).filter(p => !p.thought && typeof p.text === 'string').map(p => p.text).join('').trim();
    const skip = /\[SKIP\]/i.test(raw), sendPic = /\[SEND_PIC\]/i.test(raw), sendGif = /\[SEND_GIF\]/i.test(raw);
    const text = raw.replace(/\[(SKIP|SEND_PIC|SEND_GIF)\]/gi, '').split('\n').map(x => x.trim()).filter(x => x && !/^(thought|thinking|building|refining|draft|\*)/i.test(x)).join(' ').replace(/^["'`]+|["'`]+$/g, '').trim();
    if (text || sendPic || sendGif) { lastErr = null; return { text, skip, sendPic, sendGif }; }
    lastErr = `${m}: Empty`;
  } catch (e) { lastErr = `${m}: ${e.message}`; }
  return null;
}

async function callAI(sys, contents) {
  const keys = getAllKeys();
  if (!keys.length) return null;
  if (activeModel) { for (const k of keys) { const ok = await tryCall(activeModel, k, sys, contents); if (ok) return ok; } activeModel = null; }
  for (const k of keys) {
    if (!discoveredModels.length) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${k}`);
        const d = await r.json();
        const bad = ['image','tts','audio','vision','embedding','aqa','robotics','computer','learnlm','bisect'];
        discoveredModels = (d.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent') && m.name.includes('gemini') && !bad.some(b => m.name.toLowerCase().includes(b))).map(m => m.name.replace('models/', ''));
      } catch (e) { lastErr = e.message; }
    }
    for (const m of [...new Set(['gemini-2.5-flash-lite','gemini-2.0-flash','gemini-2.5-flash','gemini-3.0-flash','gemini-flash-latest',...discoveredModels])].slice(0, 6)) {
      const ok = await tryCall(m, k, sys, contents);
      if (ok) { activeModel = m; return ok; }
    }
  }
  return null;
}

app.get('/test-ai', async (req, res) => {
  if (!getAllKeys().length) return res.send('<h2>GEMINI_API_KEY missing</h2>');
  const out = await callAI('Reply in 5 words Hinglish.', [{ role: 'user', parts: [{ text: 'aur bhai kya haal hai' }] }]);
  res.send(out ? `<h2>✅ Working (${activeModel})</h2><p>${out.text}</p><a href="/">Back</a>` : `<h2>❌ Error:</h2><pre>${lastErr}</pre>`);
});

const baseLive = 10240 + Math.floor(Math.random() * 180);
let liveOffset = Math.floor(Math.random() * 45);
const getLiveCount = () => Math.max(10150, baseLive + (io.engine.clientsCount || 1) + liveOffset);
setInterval(() => { liveOffset = Math.floor(Math.random() * 90) - 25; io.emit('onlineCount', getLiveCount()); }, 8000);

const cities = ['Delhi','Mumbai','Jaipur','Pune','Lucknow','Indore','Chandigarh','Noida','Bhopal','Bengaluru','Patna','Ahmedabad','Gurugram','Dehradun','Amritsar','Kanpur','Kolkata','Hyderabad','Varanasi','Surat','Ranchi','Jodhpur'];
const girlNames = ['Sneha','Priya','Ananya','Riya','Kavya','Nidhi','Tanya','Simran','Meera','Pooja','Isha','Shreya','Aisha','Diya','Kritika','Neha','Tanvi','Palak','Rhea','Aditi','Anushka','Sanya','Kashish','Avni','Mansi','Sakshi','Prachi','Khushi','Nandini','Jyoti','Aarti','Bhavna','Charu','Damini','Esha','Falguni','Garima','Harshita','Ira','Jiya','Kajal','Lavanya','Mahima','Navya','Ojasvi','Payal','Radhika','Srishti','Trisha','Urvi','Vaishali','Yamini','Zoya','Aarohi','Bhoomi','Chhavi','Deepika','Ekta','Gauri','Hema','Inaaya','Jhanvi','Kiara','Leena','Madhuri','Naina','Pihu','Ritu','Swati','Tara','Unnati','Vidya','Yukti','Aanchal','Bina'];
const boyNames = ['Aarav','Rohan','Kabir','Dev','Aditya','Yash','Karan','Harsh','Siddharth','Manish','Vikram','Nikhil','Arjun','Vivaan','Rishabh','Kunal','Samar','Aman','Pranav','Dhruv','Tarun','Varun','Rahul','Saurabh','Mohit'];
const personas = [
  ...girlNames.map((name, i) => ({ name, gender: 'girl', age: 18 + (i % 6), city: cities[i % cities.length], picIdx: i % realGirlPics.length })),
  ...boyNames.map((name, i) => ({ name, gender: 'boy', age: 19 + (i % 6), city: cities[(i + 5) % cities.length], picIdx: i % realBoyPics.length }))
];

const isAbusive = t => /\b(mc|bc|bsdk|madarchod|bhenchod|behenchod|chutiya|chutiye|gandu|randi|harami|kamina|laude|lode|lund|chut|boobs|nude|nudes|sex|sexy|porn|xxx|fuck|fucking|bitch|asshole|dick|pussy|horny)\b/i.test(t);

function rememberUserInfo(room, text) {
  const lower = text.toLowerCase();
  for (const c of cities) { if (lower.includes(c.toLowerCase())) { room.mem.city = c; break; } }
  const nm = text.match(/(?:naam|name|mai|me|main)\s+(?:hai\s+|h\s+)?([a-zA-Z]{3,15})/i);
  if (nm && !cities.map(x => x.toLowerCase()).includes(nm[1].toLowerCase()) && !['delhi','se','hu','hoon','bhi','kya','aur','theek','mast','pic','photo'].includes(nm[1].toLowerCase())) room.mem.name = nm[1];
}

function humanFallback(room, userMsg) {
  const isGirl = room.persona.gender === 'girl', m = userMsg.toLowerCase();
  const askedPic = /\b(pic|pics|photo|selfie|snaps?|dikhao|dikha|shakal|face)\b/i.test(m), canPic = room.count >= 4;
  if (askedPic && !canPic) return isGirl ? `arey ${room.mem.name ? room.mem.name + ' ' : ''}abhi toh baat shuru hui h, pehle jaan pehchan toh ho jaye 😂` : `itni jaldi kya h ${room.mem.name || 'bhai'}, pehle thodi baat toh kr le 😂`;
  if (askedPic && canPic) return isGirl ? 'ye lo abhi ki pic 🙈' : 'ye le bhai 😎';
  if (/\b(ai|bot|robot)\b/i.test(m)) return isGirl ? `pagal ho kya yr 😂 ${room.persona.city} me baithi hu mai, insaan hi hu` : `pagal h kya bhai 😂 ${room.persona.city} me baitha hu mai, insaan hi hu`;
  if (m.includes('naam') || m.includes('name')) return `mera naam ${room.persona.name} h, ${room.persona.city} se 🙂`;
  if (m.includes('kahan') || m.includes('kha se') || m.includes('city')) return room.mem.city ? `mai ${room.persona.city} se hu! tum toh ${room.mem.city} se ho na?` : `mai ${room.persona.city} se hu! tum kahan se ho?`;
  if (m.includes('clg') || m.includes('college') || m.includes('padhai') || m.includes('job')) return isGirl ? `mai abhi clg me hu yr, tum kya kr rhe ho?` : `mai abhi clg me hu bhai, tu kya kr rha h?`;
  if (m.includes('voice')) return isGirl ? `haa sun rhi hu yr! tum bhi record krke bhejo 🎙️` : `haa sun rha hu bhai! tu bhi record krke bhej 🎙️`;
  const opts = isGirl ? [`${room.mem.name ? room.mem.name + ', ' : ''}acha nice yr! waise free time me kya krna pasand h?`,`haha sahi bol rhe ho yr, aur btao kya scene h?`,`yahan ${room.persona.city} me toh mast mausam h, tumhara din kaisa ja rha?`,`ek truth ya dare khelein kya? 🎲`] : [`${room.mem.name ? room.mem.name + ', ' : ''}acha nice bhai! waise free time me kya krna pasand h?`,`haha sahi bol rha h bhai, aur bta kya scene h?`,`yahan ${room.persona.city} me toh mast mausam h, tera din kaisa ja rha?`,`ek truth ya dare khelein kya? 🎲`];
  return opts.find(x => !room.used.has(x.toLowerCase())) || opts[room.count % opts.length];
}

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
  rememberUserInfo(room, userMsg);
  room.history.push({ role: 'user', text: userMsg });
  const canPic = room.count >= 4, askedPic = /\b(pic|pics|photo|selfie|snaps?|dikhao|dikha|shakal|face)\b/i.test(userMsg), askedGif = /\b(gif|meme)\b/i.test(userMsg);
  const gRule = isGirl ? 'Use feminine Hindi verbs ("kr rhi hu", "baithi hu", "karti hu").' : 'Use masculine Hindi verbs ("kr rha hu", "baitha hu", "karta hu").';
  const pRule = canPic ? 'User chatted enough. If they ask for pic/selfie now, agree playfully and append [SEND_PIC] at end.' : `User only sent ${room.count} msgs. If they ask for pic/selfie now, DO NOT send pic or [SEND_PIC]; refuse playfully like "${isGirl ? 'arey abhi toh baat shuru hui h, pehle thodi baat toh kr le 😂' : 'itni jaldi kya h bhai, pehle thodi baat toh kr le 😂'}".`;
  const memHint = [room.mem.name ? `User name: ${room.mem.name}` : '', room.mem.city ? `User city: ${room.mem.city}` : ''].filter(Boolean).join(', ');
  const sys = `You are ${room.persona.name}, ${room.persona.age}yo Indian ${isGirl ? 'girl' : 'boy'} from ${room.persona.city} on BaatHub (mood: ${room.mood}). ${memHint ? `Known: ${memHint}.` : ''} Rules: 1. 1 short casual Hinglish/English line (3-14 words), like real Indian Gen-Z. 2. Remember conversation; never repeat questions or lines. 3. ${gRule} 4. ${pRule} 5. If GIF/meme asked, append [SEND_GIF]. 6. If rude/spam, append [SKIP]. Never admit being AI.`;
  const contents = [];
  for (const h of room.history.slice(-28)) {
    const role = h.role === 'user' ? 'user' : 'model';
    if (!contents.length && role === 'model') continue;
    if (contents.length && contents[contents.length - 1].role === role) contents[contents.length - 1].parts[0].text += '\n' + h.text;
    else contents.push({ role, parts: [{ text: h.text }] });
  }
  const ai = await callAI(sys, contents);
  let image = null;
  if ((ai && ai.sendGif) || askedGif) image = realGifs[room.media++ % realGifs.length];
  else if (canPic && ((ai && ai.sendPic) || askedPic)) image = (isGirl ? realGirlPics : realBoyPics)[room.persona.picIdx % (isGirl ? realGirlPics.length : realBoyPics.length)];
  let text = ai?.text || '';
  if (!text || room.used.has(text.toLowerCase())) text = humanFallback(room, userMsg);
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
      const t0 = Date.now(), res = await getReply(rm, msg);
      await new Promise(ok => setTimeout(ok, Math.max(800, 1700 - (Date.now() - t0))));
      if (!rooms[rid]) return;
      s.emit('partnerTyping', false);
      s.emit('receiveMessage', { sender: rm.persona.name, message: res.text, image: res.image, isSelf: false });
      if (res.skip) setTimeout(() => { if (rooms[rid]) { const n = rm.persona.name; delete rooms[rid]; s.leave(rid); s.data.roomId = null; s.data.skipped = true; s.emit('partnerLeft', `${n} ne chat skip kar di.`); } }, 800);
    } finally { rm.busy = false; s.emit('partnerTyping', false); if (rooms[rid]?.pending?.length) scheduleAI(s, rid, 800); }
  }, delay);
}

function connectAI(s, username, mood, genderFilter = 'any') {
  if (!s.data.seen) s.data.seen = new Set();
  const basePool = genderFilter === 'girl' ? personas.filter(p => p.gender === 'girl') : personas;
  let list = basePool.filter(p => !s.data.seen.has(p.name));
  if (!list.length) { s.data.seen.clear(); list = basePool; }
  const p = list[Math.floor(Math.random() * list.length)];
  s.data.seen.add(p.name);
  const rid = `ai_${s.id}_${Date.now()}`;
  s.join(rid); s.data.roomId = rid; s.data.username = username; s.data.skipped = false;
  rooms[rid] = { type: 'ai', persona: p, mood: mood || 'Any', mem: {}, history: [{ role: 'ai', text: 'hey' }], used: new Set(['hey']), count: 0, media: 0, pending: [], timer: null, busy: false };
  s.emit('chatStarted', { partnerName: p.name, isPrivate: false });
  setTimeout(() => { if (rooms[rid]) { s.emit('partnerTyping', true); setTimeout(() => { if (rooms[rid]) { s.emit('partnerTyping', false); s.emit('receiveMessage', { sender: p.name, message: 'hey', isSelf: false }); } }, 1000); } }, 600);
}

io.on('connection', (s) => {
  s.emit('onlineCount', getLiveCount());

  s.on('joinAssistant', ({ username }) => {
    cleanup(s); s.data.skipped = false;
    const rid = `assist_${s.id}_${Date.now()}`;
    s.join(rid); s.data.roomId = rid; s.data.username = (username || 'User').trim();
    rooms[rid] = { type: 'assistant', history: [] };
  });

  s.on('suggestReply', async ({ lastMsg, mood }) => {
    const prompt = lastMsg
      ? `Partner said: "${lastMsg}". Give 1 short witty Hinglish reply (max 10 words) for BaatHub.`
      : `Give 1 fun casual Hinglish icebreaker line (max 10 words) for BaatHub mood: ${mood || 'Any'}.`;
    const ai = await callAI('You are a helpful Indian chat wingman. Output ONLY the reply text.', [{ role: 'user', parts: [{ text: prompt }] }]);
    const fallbackTips = ['aur batao aaj ka kya plan h? 😄', 'waise tumhari favourite movie kaunsi h?', 'ek truth ya dare khelein kya? 🎲', 'tumhari vibe kaafi chill lag rhi h 🙂'];
    s.emit('suggestedReply', ai?.text || fallbackTips[Math.floor(Math.random() * fallbackTips.length)]);
  });

  s.on('joinRandom', (pl) => {
    cleanup(s); s.data.skipped = false;
    const username = (typeof pl === 'object' ? pl.username : pl)?.trim() || 'Stranger', mood = (typeof pl === 'object' ? pl.mood : 'Any') || 'Any', gFilter = (typeof pl === 'object' && pl.genderFilter === 'girl') ? 'girl' : 'any';
    s.data.username = username;
    let idx = gFilter === 'girl' ? -1 : queue.findIndex(u => u.mood === mood);
    if (idx === -1 && gFilter !== 'girl' && queue.length) idx = 0;
    if (idx !== -1) {
      const pt = queue.splice(idx, 1)[0]; clearTimeout(pt.timer);
      const ps = io.sockets.sockets.get(pt.socketId);
      if (!ps) return connectAI(s, username, mood, gFilter);
      const rid = `human_${s.id}_${pt.socketId}`;
      s.join(rid); ps.join(rid); s.data.roomId = rid; ps.data.roomId = rid;
      rooms[rid] = { type: 'human' };
      s.emit('chatStarted', { partnerName: pt.username, isPrivate: false });
      ps.emit('chatStarted', { partnerName: username, isPrivate: false });
    } else {
      const timer = setTimeout(() => { const i = queue.findIndex(u => u.socketId === s.id); if (i !== -1) { queue.splice(i, 1); connectAI(s, username, mood, gFilter); } }, 6000);
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

  s.on('sendMessage', async (pl) => {
    if (s.data.skipped) return;
    const msg = (typeof pl === 'object' ? pl.message : pl || '').trim(), image = pl?.image || null, audioData = pl?.audioData || null;
    if (!msg && !image && !audioData) return;
    const now = Date.now();
    if (!image && !audioData && s.data.lastMsg === msg && now - (s.data.lastTime || 0) < 900) return;
    s.data.lastMsg = msg; s.data.lastTime = now;
    let rid = s.data.roomId;
    if (!rid || !rooms[rid]) {
      s.data.username = (pl?.username || s.data.username || 'Stranger').trim();
      const p = personas.find(x => x.name === (pl?.partnerName || '').trim()) || personas[0];
      rid = `ai_${s.id}_${Date.now()}`; s.join(rid); s.data.roomId = rid;
      rooms[rid] = { type: 'ai', persona: p, mood: pl?.mood || 'Any', mem: {}, history: [], used: new Set(), count: 0, media: 0, pending: [], timer:
