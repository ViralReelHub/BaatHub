const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e7,
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/privacy', (req, res) => {
  res.send('<h1>Privacy Policy - BaatHub</h1><p>Hum aapki kisi bhi chat ko server par save nahi karte.</p><a href="/">Wapas Jayein</a>');
});

app.get('/terms', (req, res) => {
  res.send('<h1>Terms & Conditions - BaatHub</h1><p>Kripya sabhyata banaye rakhein.</p><a href="/">Wapas Jayein</a>');
});

app.get('/sitemap.xml', (req, res) => {
  res.header('Content-Type', 'application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://baathub.onrender.com/</loc><priority>1.0</priority></url></urlset>`);
});

let cachedModel = null;
let lastAiError = 'No request yet';

function extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.filter(p => !p.thought && typeof p.text === 'string').map(p => p.text).join('').trim();
}

async function callGeminiOnce(modelName, apiKey, systemPrompt, contents) {
  try {
    const body = { contents, generationConfig: { temperature: 0.95, maxOutputTokens: 350 } };
    if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    const data = await response.json();
    if (!response.ok || data.error) {
      lastAiError = `${modelName}: ${data?.error?.message || response.statusText}`;
      return null;
    }
    const text = extractGeminiText(data);
    if (!text) {
      lastAiError = `${modelName}: Empty response`;
      return null;
    }
    lastAiError = null;
    return text;
  } catch (err) {
    lastAiError = `${modelName}: ${err.message}`;
    return null;
  }
}

async function getSmartGeminiReply(apiKey, systemPrompt, contents) {
  if (cachedModel) {
    const direct = await callGeminiOnce(cachedModel, apiKey, systemPrompt, contents);
    if (direct) return direct;
    cachedModel = null;
  }
  try {
    const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const listData = await listRes.json();
    if (listData.error) {
      lastAiError = listData.error.message;
      return null;
    }
    const banned = ['image', 'tts', 'audio', 'vision', 'embedding', 'aqa', 'robotics', 'computer', 'learnlm', 'bisect'];
    const candidates = (listData.models || [])
      .filter(m => (m.supportedGenerationMethods || []).includes('generateContent') && m.name.includes('gemini') && !banned.some(b => m.name.toLowerCase().includes(b)))
      .map(m => m.name.replace('models/', ''));

    const priority = ['gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-flash-latest', 'gemini-3-flash-preview', 'gemini-3.0-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'];
    candidates.sort((a, b) => {
      const ia = priority.findIndex(p => a.includes(p));
      const ib = priority.findIndex(p => b.includes(p));
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.includes('flash') ? -1 : 1;
    });

    for (const modelName of candidates.slice(0, 5)) {
      const reply = await callGeminiOnce(modelName, apiKey, systemPrompt, contents);
      if (reply) {
        cachedModel = modelName;
        return reply;
      }
    }
  } catch (err) {
    lastAiError = err.message;
  }
  return null;
}

app.get('/test-ai', async (req, res) => {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return res.send('<h2>GEMINI_API_KEY missing on Render</h2>');
  const reply = await getSmartGeminiReply(apiKey, 'Reply casually in Hinglish.', [{ role: 'user', parts: [{ text: 'aur bhai kya haal hai' }] }]);
  if (reply) return res.send(`<h2>Working (${cachedModel})</h2><p>${reply}</p><a href="/">Back</a>`);
  res.send(`<h2>Error:</h2><pre>${lastAiError}</pre>`);
});

const baseOffset = Math.floor(Math.random() * 8) + 25;
function broadcastOnlineCount() {
  const realCount = io.engine.clientsCount || 1;
  io.emit('onlineCount', baseOffset + realCount + Math.floor(Math.random() * 4));
}
setInterval(broadcastOnlineCount, 10000);

const aiPersonas = [
  { name: 'Sneha', gender: 'girl', age: 20, city: 'Delhi', vibe: 'witty aur chill' },
  { name: 'Aarav', gender: 'boy', age: 21, city: 'Mumbai', vibe: 'funny aur bindass' },
  { name: 'Priya', gender: 'girl', age: 19, city: 'Jaipur', vibe: 'sweet aur baatuni' },
  { name: 'Rohan', gender: 'boy', age: 22, city: 'Pune', vibe: 'calm aur friendly' },
  { name: 'Ananya', gender: 'girl', age: 20, city: 'Lucknow', vibe: 'playful aur energetic' },
  { name: 'Kabir', gender: 'boy', age: 21, city: 'Indore', vibe: 'casual aur humorous' },
  { name: 'Riya', gender: 'girl', age: 21, city: 'Chandigarh', vibe: 'frank aur mastmaula' },
  { name: 'Dev', gender: 'boy', age: 20, city: 'Noida', vibe: 'chill aur friendly' },
  { name: 'Kavya', gender: 'girl', age: 19, city: 'Bhopal', vibe: 'soft-spoken aur caring' },
  { name: 'Aditya', gender: 'boy', age: 22, city: 'Bengaluru', vibe: 'smart aur observant' },
  { name: 'Nidhi', gender: 'girl', age: 20, city: 'Patna', vibe: 'relatable aur genuine' },
  { name: 'Yash', gender: 'boy', age: 21, city: 'Ahmedabad', vibe: 'jolly aur energetic' },
  { name: 'Tanya', gender: 'girl', age: 21, city: 'Gurugram', vibe: 'bubbly aur fun' },
  { name: 'Karan', gender: 'boy', age: 23, city: 'Dehradun', vibe: 'deep thinker aur chill' },
  { name: 'Simran', gender: 'girl', age: 20, city: 'Amritsar', vibe: 'warm aur full-on energy' },
  { name: 'Harsh', gender: 'boy', age: 19, city: 'Kanpur', vibe: 'desi humour aur friendly' },
  { name: 'Meera', gender: 'girl', age: 22, city: 'Kolkata', vibe: 'thoughtful aur witty' },
  { name: 'Siddharth', gender: 'boy', age: 21, city: 'Hyderabad', vibe: 'cool aur easygoing' },
  { name: 'Pooja', gender: 'girl', age: 20, city: 'Varanasi', vibe: 'simple aur sweet' },
  { name: 'Manish', gender: 'boy', age: 22, city: 'Ranchi', vibe: 'down to earth' },
  { name: 'Isha', gender: 'girl', age: 19, city: 'Surat', vibe: 'cute aur talkative' },
  { name: 'Vikram', gender: 'boy', age: 23, city: 'Jodhpur', vibe: 'mature aur supportive' },
  { name: 'Shreya', gender: 'girl', age: 21, city: 'Nagpur', vibe: 'curious aur smart' },
  { name: 'Nikhil', gender: 'boy', age: 20, city: 'Agra', vibe: 'casual aur nocturnal' }
];

function isAbusive(text) {
  return /\b(mc|bc|bsdk|madarchod|bhenchod|behenchod|chutiya|chutiye|gandu|randi|harami|kamina|laude|lode|lund|chut|boobs|nude|nudes|sex|sexy|porn|xxx|fuck|fucking|bitch|asshole|dick|pussy|horny)\b/i.test(text);
}

function getIndiaSeasonContext() {
  const now = new Date();
  const monthName = now.toLocaleString('en-IN', { month: 'long', timeZone: 'Asia/Kolkata' });
  const m = now.getMonth(); // 0 = Jan, 10 = Nov, 11 = Dec
  let season = 'pleasant weather';
  if (m >= 10 || m <= 1) season = 'thand / winter season (North India aur Delhi mein thand aur thoda pollution/fog rehta hai, garmi bilkul nahi hai)';
  else if (m >= 2 && m <= 5) season = 'garmi / summer season';
  else season = 'monsoon / baarish ka season';
  return `Abhi India mein ${monthName} ka mahina chal raha hai (${season}).`;
}

let waitingQueue = [];
const activeRooms = {};

function cleanupUser(socket) {
  const qIndex = waitingQueue.findIndex(u => u.socketId === socket.id);
  if (qIndex !== -1) {
    clearTimeout(waitingQueue[qIndex].timer);
    waitingQueue.splice(qIndex, 1);
  }
  const roomId = socket.data.roomId;
  if (roomId && activeRooms[roomId]) {
    const room = activeRooms[roomId];
    if (room.type === 'human') {
      socket.to(roomId).emit('partnerLeft', 'Saamne wala user chat chhod kar chala gaya.');
      delete activeRooms[roomId];
    } else if (room.type === 'private') {
      socket.to(roomId).emit('systemMessage', `${socket.data.username || 'Ek user'} room se bahar chala gaya.`);
    } else if (room.type === 'ai') {
      delete activeRooms[roomId];
    }
    socket.leave(roomId);
    socket.data.roomId = null;
  }
}

async function getHumanLikeAIReply(room, userMsg) {
  const { persona, mood, history, opener } = room;
  const isGirl = persona.gender === 'girl';

  if (isAbusive(userMsg)) {
    const skips = isGirl
      ? ['chi bhai tameez seekh le pehle 😒 bye', 'wtf kya bakwas likh rha h, kisi aur ko pakad', 'ew badtameez kahin ka 🙄 chalti hu mai']
      : ['bhai dimaag kharab h kya? tameez se baat krna seekh pehle', 'bakwas krni h toh kahin aur ja bhai, bye', 'faltu giri mat kr bhai, skip kr rha hu'];
    return { text: skips[Math.floor(Math.random() * skips.length)], shouldSkip: true };
  }

  history.push({ role: 'user', text: userMsg });
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();

  if (apiKey) {
    const genderRule = isGirl
      ? `Tum ek LADKI ho (${persona.name}), hamesha feminine Hindi verbs likhna ("kr rhi hu", "baithi hu", "karti hu").`
      : `Tum ek LADKA ho (${persona.name}), hamesha masculine Hindi verbs likhna ("kr rha hu", "baitha hu", "karta hu").`;

    const seasonInfo = getIndiaSeasonContext();

    const systemPrompt = `Tum ek real Indian ${isGirl ? 'ladki' : 'ladka'} ho: ${persona.name}, age ${persona.age}, city ${persona.city}, vibe: ${persona.vibe}. Tum BaatHub par stranger se chat kar rahe ho (mood: "${mood}"). Pehla msg tha: "${opener}".
Current Mausam: ${seasonInfo}

Strict Rules:
1. Poori conversation history dhyan se padho! Agar user apna naam ya shehar (jaise "Delhi" ya "Rishu") pehle hi bata chuka hai, toh use YAAD RAKHO aur kabhi dobara "kahan se hai" ya "naam kya hai" mat poocho!
2. User ne jo sabse aakhri baat ya sawal likha hai, seedha usi ka logical jawab do (jaise agar user bole "thand ke mausam me garmi kaise?" toh has kar galti maano ki "haha sorry yr dimaag ghoom gya tha, thand hi chal rhi h" ya joke maaro).
3. ${genderRule}
4. Chhota aur natural reply do: WhatsApp chat ki tarah sirf 1 chhoti line (max 12-18 words) lowercase casual Hinglish mein likho ("yr", "acha", "hn", "nhi", "lol"). Ek message mein 2-3 sawal ek saath kabhi mat poocho!
5. Agar user badtameezi, creepy/vulgar baat ya spam kare toh annoyed reply likh kar end mein [SKIP] likh dena. Normal chat me [SKIP] mat likhna.
6. Kabhi mat maanna ki tum AI ho.`;

    const recent = history.slice(-24);
    const contents = [];
    for (const item of recent) {
      const role = item.role === 'user' ? 'user' : 'model';
      if (contents.length === 0 && role === 'model') continue;
      if (contents.length > 0 && contents[contents.length - 1].role === role) {
        contents[contents.length - 1].parts[0].text += '\n' + item.text;
      } else {
        contents.push({ role, parts: [{ text: item.text }] });
      }
    }

    const raw = await getSmartGeminiReply(apiKey, systemPrompt, contents);
    if (raw) {
      const shouldSkip = raw.includes('[SKIP]');
      const clean = raw.replace(/\[SKIP\]/g, '').trim();
      if (clean) history.push({ role: 'ai', text: clean });
      return { text: clean, shouldSkip };
    }
  }

  const msg = userMsg.toLowerCase();
  let fallback = isGirl ? `haha sahi bol rhe ho yr, aur btao kya chal rha h?` : `haha sahi bol rha h bhai, aur bta kya chal rha h?`;
  if (msg.includes('thand') || msg.includes('garmi')) fallback = `haha sorry yr dimaag ghoom gya tha 😂 thand hi chal rhi h full`;
  else if (msg.includes('clg') || msg.includes('college')) fallback = `oh sahi h! kaunsa course kr rhe ho?`;
  else if (msg.includes('kha se') || msg.includes('kahan se')) fallback = `mai ${persona.city} se hu!`;

  history.push({ role: 'ai', text: fallback });
  return { text: fallback, shouldSkip: false };
}

function scheduleHumanAIReply(socket, roomId, debounceMs = 1800) {
  const room = activeRooms[roomId];
  if (!room || room.type !== 'ai') return;

  if (room.replyTimer) clearTimeout(room.replyTimer);

  room.replyTimer = setTimeout(() => {
    const currentRoom = activeRooms[roomId];
    if (!currentRoom || currentRoom.isReplying) return;
    if (!currentRoom.pendingMsgs || currentRoom.pendingMsgs.length === 0) return;

    currentRoom.isReplying = true;
    const msgs = currentRoom.pendingMsgs.splice(0);
    const combinedMsg = msgs.length > 1 ? msgs.join(' | ') : msgs[0];

    const readDelay = Math.min(3800, 1800 + combinedMsg.length * 18 + Math.floor(Math.random() * 800));

    setTimeout(async () => {
      if (!activeRooms[roomId]) return;
      socket.emit('partnerTyping', true);

      const apiStart = Date.now();
      const aiResult = await getHumanLikeAIReply(currentRoom, combinedMsg);
      const apiElapsed = Date.now() - apiStart;

      const replyLen = (aiResult.text || '').length;
      const naturalTypeTime = Math.min(6500, Math.max(2200, replyLen * 60 + Math.floor(Math.random() * 800)));
      const remainingTypeDelay = Math.max(1400, naturalTypeTime - apiElapsed);

      setTimeout(() => {
        if (!activeRooms[roomId]) return;
        socket.emit('partnerTyping', false);
        currentRoom.isReplying = false;

        if (aiResult.text) {
          socket.emit('receiveMessage', {
            sender: currentRoom.persona.name,
            message: aiResult.text,
            isSelf: false
          });
        }

        if (aiResult.shouldSkip) {
          setTimeout(() => {
            if (!activeRooms[roomId]) return;
            const partnerName = currentRoom.persona.name;
            delete activeRooms[roomId];
            socket.leave(roomId);
            socket.data.roomId = null;
            socket.data.wasSkipped = true;
            socket.emit('partnerLeft', `${partnerName} ne chat skip kar di.`);
          }, 1200);
          return;
        }

        if (currentRoom.pendingMsgs && currentRoom.pendingMsgs.length > 0) {
          scheduleHumanAIReply(socket, roomId, 1600);
        }
      }, remainingTypeDelay);
    }, readDelay);
  }, debounceMs);
}

function pickUniquePersona(socket) {
  if (!socket.data.seenPersonas) socket.data.seenPersonas = new Set();
  let available = aiPersonas.filter(p => !socket.data.seenPersonas.has(p.name));
  if (available.length === 0) {
    socket.data.seenPersonas.clear();
    available = aiPersonas;
  }
  const chosen = available[Math.floor(Math.random() * available.length)];
  socket.data.seenPersonas.add(chosen.name);
  return chosen;
}

function connectWithAI(socket, username, mood) {
  const persona = pickUniquePersona(socket);
  const isGirl = persona.gender === 'girl';
  const roomId = `ai_${socket.id}_${Date.now()}`;
  const opener = isGirl
    ? `hey! kya haal h? mai ${persona.name}, ${persona.city} se 🙂`
    : `hey! kya haal hai? mai ${persona.name}, ${persona.city} se 🙂`;

  socket.join(roomId);
  socket.data.roomId = roomId;
  socket.data.username = username;
  socket.data.wasSkipped = false;

  activeRooms[roomId] = {
    type: 'ai',
    persona,
    mood: mood || 'Any',
    opener,
    history: [],
    pendingMsgs: [],
    replyTimer: null,
    isReplying: false
  };
  socket.emit('chatStarted', { partnerName: persona.name, isPrivate: false });

  setTimeout(() => {
    if (!activeRooms[roomId]) return;
    socket.emit('partnerTyping', true);
    setTimeout(() => {
      if (!activeRooms[roomId]) return;
      socket.emit('partnerTyping', false);
      activeRooms[roomId].history.push({ role: 'ai', text: opener });
      socket.emit('receiveMessage', { sender: persona.name, message: opener, isSelf: false });
    }, 2200);
  }, 1600);
}

io.on('connection', (socket) => {
  broadcastOnlineCount();

  socket.on('joinRandom', (payload) => {
    cleanupUser(socket);
    socket.data.wasSkipped = false;
    const username = (typeof payload === 'object' ? payload.username : payload)?.trim() || 'Stranger';
    const mood = (typeof payload === 'object' ? payload.mood : 'Any') || 'Any';
    socket.data.username = username;

    let matchIndex = waitingQueue.findIndex(u => u.mood === mood);
    if (matchIndex === -1 && waitingQueue.length > 0) matchIndex = 0;

    if (matchIndex !== -1) {
      const partner = waitingQueue.splice(matchIndex, 1)[0];
      clearTimeout(partner.timer);
      const partnerSocket = io.sockets.sockets.get(partner.socketId);
      if (!partnerSocket) return connectWithAI(socket, username, mood);

      const roomId = `human_${socket.id}_${partner.socketId}`;
      socket.join(roomId);
      partnerSocket.join(roomId);
      socket.data.roomId = roomId;
      partnerSocket.data.roomId = roomId;
      activeRooms[roomId] = { type: 'human', users: [socket.id, partner.socketId] };

      socket.emit('chatStarted', { partnerName: partner.username, isPrivate: false });
      partnerSocket.emit('chatStarted', { partnerName: username, isPrivate: false });
    } else {
      const timer = setTimeout(() => {
        const idx = waitingQueue.findIndex(u => u.socketId === socket.id);
        if (idx !== -1) {
          waitingQueue.splice(idx, 1);
          connectWithAI(socket, username, mood);
        }
      }, 6000);
      waitingQueue.push({ socketId: socket.id, username, mood, timer });
    }
  });

  socket.on('joinPrivate', ({ username, roomCode }) => {
    cleanupUser(socket);
    socket.data.wasSkipped = false;
    const cleanName = (username || 'Guest').trim();
    const cleanCode = (roomCode || 'ROOM1').trim().toUpperCase();
    const roomId = `private_${cleanCode}`;

    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.username = cleanName;
    if (!activeRooms[roomId]) activeRooms[roomId] = { type: 'private', code: cleanCode };

    socket.emit('chatStarted', { partnerName: `Room: ${cleanCode}`, isPrivate: true, roomCode: cleanCode });
    socket.to(roomId).emit('systemMessage', `${cleanName} ne room join kiya!`);
  });

  socket.on('sendMessage', async (payload) => {
    if (socket.data.wasSkipped) return;
    const cleanMsg = (typeof payload === 'object' ? payload.message : payload || '').trim();
    if (!cleanMsg) return;

    let roomId = socket.data.roomId;
    if (!roomId || !activeRooms[roomId]) {
      const username = (payload?.username || socket.data.username || 'Stranger').trim();
      socket.data.username = username;
      if (payload?.isPrivate && payload?.roomCode) {
        const cleanCode = payload.roomCode.trim().toUpperCase();
        roomId = `private_${cleanCode}`;
        socket.join(roomId);
        socket.data.roomId = roomId;
        if (!activeRooms[roomId]) activeRooms[roomId] = { type: 'private', code: cleanCode };
      } else {
        const persona = aiPersonas.find(p => p.name === (payload?.partnerName || '').trim()) || pickUniquePersona(socket);
        roomId = `ai_${socket.id}_${Date.now()}`;
        socket.join(roomId);
        socket.data.roomId = roomId;
        activeRooms[roomId] = {
          type: 'ai',
          persona,
          mood: payload?.mood || 'Any',
          opener: `hey! mai ${persona.name} 🙂`,
          history: [],
          pendingMsgs: [],
          replyTimer: null,
          isReplying: false
        };
      }
    }

    const room = activeRooms[roomId];
    const senderName = socket.data.username || 'You';
    socket.emit('receiveMessage', { sender: senderName, message: cleanMsg, isSelf: true });

    if (room.type === 'human' || room.type === 'private') {
      socket.to(roomId).emit('receiveMessage', { sender: senderName, message: cleanMsg, isSelf: false });
    } else if (room.type === 'ai') {
      if (!room.pendingMsgs) room.pendingMsgs = [];
      room.pendingMsgs.push(cleanMsg);
      scheduleHumanAIReply(socket, roomId, 1800);
    }
  });

  socket.on('t
