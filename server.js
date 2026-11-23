const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e7
});

app.use(express.static(path.join(__dirname, 'public')));

// SEO & Legal Pages
app.get('/privacy', (req, res) => {
  res.send('<h1>Privacy Policy - BaatHub</h1><p>Hum aapki kisi bhi chat ko server par save nahi karte. Sabhi baatein temporary aur private hain.</p><a href="/">Wapas Jayein</a>');
});

app.get('/terms', (req, res) => {
  res.send('<h1>Terms & Conditions - BaatHub</h1><p>Kripya sabhyata banaye rakhein. Kisi bhi galat vyavahar par aap chat chhod sakte hain.</p><a href="/">Wapas Jayein</a>');
});

app.get('/sitemap.xml', (req, res) => {
  res.header('Content-Type', 'application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url><loc>https://baathub.onrender.com/</loc><priority>1.0</priority></url>
    <url><loc>https://baathub.onrender.com/privacy</loc><priority>0.5</priority></url>
    <url><loc>https://baathub.onrender.com/terms</loc><priority>0.5</priority></url>
  </urlset>`);
});

let cachedModel = null;
let lastAiError = 'Abhi tak koi request nahi aayi';

function extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts
    .filter(p => !p.thought && typeof p.text === 'string')
    .map(p => p.text)
    .join('')
    .trim();
}

async function callGeminiOnce(modelName, apiKey, systemPrompt, contents) {
  try {
    const body = {
      contents,
      generationConfig: {
        temperature: 1.0,
        maxOutputTokens: 500
      }
    };
    if (systemPrompt) {
      body.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    );

    const data = await response.json();
    if (!response.ok || data.error) {
      lastAiError = `${modelName} -> ${data?.error?.message || response.statusText}`;
      console.error('Gemini Error:', lastAiError);
      return null;
    }

    const text = extractGeminiText(data);
    if (!text) {
      lastAiError = `${modelName} -> Empty response`;
      return null;
    }

    lastAiError = null;
    return text;
  } catch (err) {
    lastAiError = `${modelName} -> ${err.message}`;
    return null;
  }
}

async function getSmartGeminiReply(apiKey, systemPrompt, contents) {
  // 1. Agar pehle se working model mil chuka hai toh seedha use karein
  if (cachedModel) {
    const direct = await callGeminiOnce(cachedModel, apiKey, systemPrompt, contents);
    if (direct) return direct;
    cachedModel = null;
  }

  // 2. Google se available models ki list mangwayein aur sirf text chat models filter karein
  try {
    const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const listData = await listRes.json();

    if (listData.error) {
      lastAiError = `ListModels -> ${listData.error.message}`;
      return null;
    }

    const bannedKeywords = ['image', 'tts', 'audio', 'vision', 'embedding', 'aqa', 'robotics', 'computer', 'learnlm', 'bisect'];
    const candidates = (listData.models || [])
      .filter(m =>
        (m.supportedGenerationMethods || []).includes('generateContent') &&
        m.name.includes('gemini') &&
        !bannedKeywords.some(bad => m.name.toLowerCase().includes(bad))
      )
      .map(m => m.name.replace('models/', ''));

    // Flash models ko pehle rakhein (fast replies ke liye)
    const priorityOrder = [
      'gemini-2.5-flash-lite',
      'gemini-2.0-flash',
      'gemini-flash-latest',
      'gemini-3-flash-preview',
      'gemini-3.0-flash',
      'gemini-2.5-flash',
      'gemini-1.5-flash'
    ];

    candidates.sort((a, b) => {
      const ia = priorityOrder.findIndex(p => a.includes(p));
      const ib = priorityOrder.findIndex(p => b.includes(p));
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.includes('flash') ? -1 : 1;
    });

    // Top 5 models mein se jo sabse pehle sahi jawab de use lock karein
    for (const modelName of candidates.slice(0, 5)) {
      const reply = await callGeminiOnce(modelName, apiKey, systemPrompt, contents);
      if (reply) {
        cachedModel = modelName;
        console.log('Working Gemini Model Locked:', cachedModel);
        return reply;
      }
    }
  } catch (err) {
    lastAiError = `Discovery -> ${err.message}`;
  }

  return null;
}

// AI Connection Check Route
app.get('/test-ai', async (req, res) => {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    return res.send('<h2>❌ Error: Render par GEMINI_API_KEY set nahi hai!</h2>');
  }
  const reply = await getSmartGeminiReply(
    apiKey,
    'Tum ek real Indian dost ho. Casual Hinglish mein chhota jawab do.',
    [{ role: 'user', parts: [{ text: 'aur bhai kya haal hai, kahan se ho?' }] }]
  );
  if (reply) {
    res.send(`<h2>✅ Real AI 100% Working!</h2><p><strong>Active Model:</strong> ${cachedModel}</p><p><strong>AI Reply:</strong> ${reply}</p><a href="/">Ab Chat Test Karein</a>`);
  } else {
    res.send(`<h2>❌ AI Error Mila:</h2><pre>${lastAiError}</pre>`);
  }
});

// Live Online Counter (Hamesha 25+ Members Live Rahenge)
const baseOffset = Math.floor(Math.random() * 8) + 25;
function broadcastOnlineCount() {
  const realCount = io.engine.clientsCount || 1;
  const jitter = Math.floor(Math.random() * 4);
  io.emit('onlineCount', baseOffset + realCount + jitter);
}
setInterval(broadcastOnlineCount, 10000);

// 24 Unique Indian Personas
const aiPersonas = [
  { name: 'Sneha', gender: 'girl', age: 20, city: 'Delhi', hobby: 'reels, momos aur late night songs', vibe: 'thodi sarcastic, witty aur chill' },
  { name: 'Aarav', gender: 'boy', age: 21, city: 'Mumbai', hobby: 'bgmi, cricket aur standup comedy', vibe: 'bindass, funny aur friendly' },
  { name: 'Priya', gender: 'girl', age: 19, city: 'Jaipur', hobby: 'web series, cold coffee aur ghumna', vibe: 'sweet, expressive aur baatuni' },
  { name: 'Rohan', gender: 'boy', age: 22, city: 'Pune', hobby: 'gym, movies aur bike rides', vibe: 'relatable, calm aur friendly' },
  { name: 'Ananya', gender: 'girl', age: 20, city: 'Lucknow', hobby: 'shayari, music aur gossip', vibe: 'energetic, playful aur thodi dramatic' },
  { name: 'Kabir', gender: 'boy', age: 21, city: 'Indore', hobby: 'street food, memes aur football', vibe: 'humorous aur casual' },
  { name: 'Riya', gender: 'girl', age: 21, city: 'Chandigarh', hobby: 'punjabi songs, shopping aur cafes', vibe: 'confident, frank aur mastmaula' },
  { name: 'Dev', gender: 'boy', age: 20, city: 'Noida', hobby: 'coding, anime aur night walks', vibe: 'thoda introvert par mast dost' },
  { name: 'Kavya', gender: 'girl', age: 19, city: 'Bhopal', hobby: 'sketching, novels aur chai', vibe: 'soft-spoken, genuine aur caring' },
  { name: 'Aditya', gender: 'boy', age: 22, city: 'Bengaluru', hobby: 'startups, coffee aur tech', vibe: 'smart, chill aur observant' },
  { name: 'Nidhi', gender: 'girl', age: 20, city: 'Patna', hobby: 'ssc prep, music aur comedy shows', vibe: 'hardworking par abhi break par hai' },
  { name: 'Yash', gender: 'boy', age: 21, city: 'Ahmedabad', hobby: 'garba, business ideas aur movies', vibe: 'energetic aur jolly' },
  { name: 'Tanya', gender: 'girl', age: 21, city: 'Gurugram', hobby: 'fashion, bollywood aur brunch', vibe: 'bubbly, straight-forward aur fun' },
  { name: 'Karan', gender: 'boy', age: 23, city: 'Dehradun', hobby: 'pahad, photography aur acoustic guitar', vibe: 'deep thinker aur poetic' },
  { name: 'Simran', gender: 'girl', age: 20, city: 'Amritsar', hobby: 'food, reels aur doston ke saath masti', vibe: 'full-on Punjabi energy aur warm' },
  { name: 'Harsh', gender: 'boy', age: 19, city: 'Kanpur', hobby: 'cricket, memes aur college bakchodi', vibe: 'desi humour aur friendly' },
  { name: 'Meera', gender: 'girl', age: 22, city: 'Kolkata', hobby: 'books, indie music aur street food', vibe: 'thoughtful, artsy aur witty' },
  { name: 'Siddharth', gender: 'boy', age: 21, city: 'Hyderabad', hobby: 'biryani, gaming aur thriller movies', vibe: 'cool, grounded aur easygoing' },
  { name: 'Pooja', gender: 'girl', age: 20, city: 'Varanasi', hobby: 'ghats, classical fusion aur tea', vibe: 'simple, sweet aur observant' },
  { name: 'Manish', gender: 'boy', age: 22, city: 'Ranchi', hobby: 'bikes, cricket aur old hindi songs', vibe: 'down to earth aur loyal dost type' },
  { name: 'Isha', gender: 'girl', age: 19, city: 'Surat', hobby: 'dance, skincare aur kdramas', vibe: 'cute, talkative aur expressive' },
  { name: 'Vikram', gender: 'boy', age: 23, city: 'Jodhpur', hobby: 'travelling, photography aur gym', vibe: 'mature, chill aur supportive' },
  { name: 'Shreya', gender: 'girl', age: 21, city: 'Nagpur', hobby: 'podcasts, psychology aur chocolates', vibe: 'curious, empathetic aur smart' },
  { name: 'Nikhil', gender: 'boy', age: 20, city: 'Agra', hobby: 'youtube, gaming aur late night chats', vibe: 'casual, funny aur nocturnal' }
];

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

// Real Human-Like Hinglish AI Conversation Engine
async function getHumanLikeAIReply(room, userMsg) {
  const { persona, mood, history, opener } = room;
  history.push({ role: 'user', text: userMsg });

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  const isGirl = persona.gender === 'girl';

  if (apiKey) {
    const genderRule = isGirl
      ? `Tum ek LADKI ho (${persona.name}), isliye hamesha feminine Hindi verbs use karna (jaise "kr rhi hu", "baithi hu", "bore ho rhi thi", "samajh gyi", "karti hu"). Kabhi bhi "kr rha hu" ya "krta hu" mat likhna.`
      : `Tum ek LADKA ho (${persona.name}), isliye hamesha masculine Hindi verbs use karna (jaise "kr rha hu", "baitha hu", "bore ho rha tha", "samajh gya", "karta hu").`;

    const systemPrompt = `Tum ek 100% real Indian ${isGirl ? 'ladki' : 'ladka'} ho jiska naam ${persona.name} hai (age ${persona.age}, city ${persona.city}, hobbies: ${persona.hobby}, nature: ${persona.vibe}). Tum abhi BaatHub par ek stranger se live chat kar rahe ho (mood: "${mood}"). Tumne pehla message bheja tha: "${opener}".

Strict Rules:
1. User ne jo likha hai pehle usko DHYAN SE PADHO aur seedha usi baat ka jawab do! Bina matlab ka koi random sawal mat poocho. (Jaise agar user ne "Mirzapur" likha hai toh Mirzapur web series ya shehar par baat karo; agar user ne pucha "tum kha se ho" toh batao ki tum ${persona.city} se ho).
2. ${genderRule}
3. Texting style: Bilkul real Indian youngster ki tarah lowercase casual Hinglish likho (jaise "yr", "acha", "hn", "nhi", "sach me", "lol"). Chhote messages (1-2 lines) rakho, aur agar user bada paragraph likhe toh 2-4 lines mein genuine reply do.
4. Kabhi mat maanna ki tum AI ya bot ho. Koi puche toh has kar taal do ("pagal h kya ${persona.city} me baithi hu mai 😂").`;

    const recent = history.slice(-16);
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

    const aiText = await getSmartGeminiReply(apiKey, systemPrompt, contents);
    if (aiText) {
      history.push({ role: 'ai', text: aiText });
      return aiText;
    }
  }

  // Smart Context-Aware Fallback (Sirf tab chalega jab API key fail ho)
  const msg = userMsg.toLowerCase();
  let fallback = isGirl
    ? `acha yr, waise mai ${persona.city} se hu, tum kahan se ho?`
    : `acha bhai, waise mai ${persona.city} se hu, tum kahan se ho?`;

  if (msg.includes('kha se') || msg.includes('kahan se') || msg.includes('where') || msg.includes('city')) {
    fallback = isGirl
      ? `mai ${persona.city} se hu yr! tum kahan se ho?`
      : `mai ${persona.city} se hu bhai! tum kahan se ho?`;
  } else if (msg.includes('naam') || msg.includes('name')) {
    fallback = `mera naam ${persona.name} h, ${persona.city} se hu 🙂 tumhara naam kya h?`;
  } else if (msg.includes('kya kr') || msg.includes('kya kar')) {
    fallback = isGirl
      ? `kuch nhi yr bas phone chala rhi thi aur bore ho rhi thi, tum btao?`
      : `kuch nhi bhai bas phone chala rha tha aur bore ho rha tha, tum btao?`;
  }

  history.push({ role: 'ai', text: fallback });
  return fallback;
}

function pickUniquePersona(socket) {
  if (!socket.data.seenPersonas) {
    socket.data.seenPersonas = new Set();
  }
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

  const casualOpeners = isGirl
    ? [
        `hey! kya haal h? mai ${persona.name} 🙂`,
        `heyy, kahan se ho? mai ${persona.city} se hu`,
        `hi! aaj bada bore ho rhi thi yr, kya scene chal rha h?`
      ]
    : [
        `hey! kya haal hai? mai ${persona.name} 🙂`,
        `heyy, kahan se ho? mai ${persona.city} se hu`,
        `hi! aaj bada bore ho rha tha yaar, kya scene chal rha h?`
      ];
  let opener = casualOpeners[Math.floor(Math.random() * casualOpeners.length)];

  if (mood && mood.includes('Timepass')) {
    opener = isGirl
      ? `heyy! full bore ho rhi thi yr, accha hua tum mil gaye 😂 kahan se ho?`
      : `heyy! full bore ho rha tha yr, accha hua tum mil gaye 😂 kahan se ho?`;
  } else if (mood && mood.includes('Dil')) {
    opener = `hey... sab theek h na? agar kuch mann me ho toh bina soche bta sakte ho 🙂`;
  } else if (mood && mood.includes('Study')) {
    opener = `hey! padhai aur exams ne dimaag kharab kr rakha h kya 😂 kis cheez ki prep kr rhe ho?`;
  } else if (mood && mood.includes('Movies')) {
    opener = isGirl
      ? `heyy! koi mast web series ya movie suggest kro yr, bore ho rhi hu 🎬`
      : `heyy! koi mast web series ya game suggest kro yr, bore ho rha hu 🎬`;
  }

  socket.join(roomId);
  socket.data.roomId = roomId;
  socket.data.username = username;

  activeRooms[roomId] = {
    type: 'ai',
    persona,
    mood: mood || 'Any',
    opener,
    history: [],
    userSocketId: socket.id
  };

  socket.emit('chatStarted', {
    partnerName: persona.name,
    isPrivate: false
  });

  setTimeout(() => {
    if (!activeRooms[roomId]) return;
    socket.emit('partnerTyping', true);

    setTimeout(() => {
      if (!activeRooms[roomId]) return;
      socket.emit('partnerTyping', false);
      activeRooms[roomId].history.push({ role: 'ai', text: opener });
      socket.emit('receiveMessage', {
        sender: persona.name,
        message: opener,
        isSelf: false
      });
    }, 1500);
  }, 1000);
}

io.on('connection', (socket) => {
  broadcastOnlineCount();

  socket.on('joinRandom', (payload) => {
    cleanupUser(socket);

    const username = (typeof payload === 'object' ? payload.username : payload)?.trim() || 'Stranger';
    const mood = (typeof payload === 'object' ? payload.mood : 'Any') || 'Any';
    socket.data.username = username;

    let matchIndex = waitingQueue.findIndex(u => u.mood === mood);
    if (matchIndex === -1 && waitingQueue.length > 0) {
      matchIndex = 0;
    }

    if (matchIndex !== -1) {
      const partner = waitingQueue.splice(matchIndex, 1)[0];
      clearTimeout(partner.timer);

      const partnerSocket = io.sockets.sockets.get(partner.socketId);
      if (!partnerSocket) {
        connectWithAI(socket, username, mood);
        return;
      }

      const roomId = `human_${socket.id}_${partner.socketId}`;
      socket.join(roomId);
      partnerSocket.join(roomId);

      socket.data.roomId = roomId;
      partnerSocket.data.roomId = roomId;

      activeRooms[roomId] = {
        type: 'human',
        users: [socket.id, partner.socketId]
      };

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

      waitingQueue.push({
        socketId: socket.id,
        username,
        mood,
        timer
      });
    }
  });

  socket.on('joinPrivate', ({ username, roomCode }) => {
    cleanupUser(socket);
    const cleanName = (username || 'Guest').trim();
    const cleanCode = (roomCode || 'ROOM1').trim().toUpperCase();
    const roomId = `private_${cleanCode}`;

    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.username = cleanName;

    if (!activeRooms[roomId]) {
      activeRooms[roomId] = { type: 'private', code: cleanCode };
    }

    socket.emit('chatStarted', {
      partnerName: `Room: ${cleanCode}`,
      isPrivate: true,
      roomCode: cleanCode
    });
    socket.to(roomId).emit('systemMessage', `${cleanName} ne room join kiya!`);
  });

  socket.on('sendMessage', async ({ message }) => {
    const roomId = socket.data.roomId;
    const cleanMsg = (message || '').trim();
    if (!roomId || !cleanMsg || !activeRooms[roomId]) return;

    const room = activeRooms[roomId];
    const senderName = socket.data.username || 'You';

    socket.emit('receiveMessage', {
      sender: senderName,
      message: cleanMsg,
      isSelf: true
    });

    if (room.type === 'human' || room.type === 'private') {
      socket.to(roomId).emit('receiveMessage', {
        sender: senderName,
        message: cleanMsg,
        isSelf: false
      });
    } else if (room.type === 'ai') {
      const thinkDelay = 700 + Math.floor(Math.random() * 700);
      setTimeout(async () => {
        if (!activeRooms[roomId]) return;
        socket.emit('partnerTyping', true);

        const aiReply = await getHumanLikeAIReply(room, cleanMsg);
        const typeDelay = Math.min(3000, Math.max(1100, aiReply.length * 25));

        setTimeout(() => {
          if (!activeRooms[roomId]) return;
          socket.emit('partnerTyping', false);
          socket.emit('receiveMessage', {
            sender: room.persona.name,
            message: aiReply,
            isSelf: false
          });
        }, typeDelay);
      }, thinkDelay);
    }
  });

  socket.on('typing', (isTyping) => {
    const roomId = socket.data.roomId;
    if (roomId && ac
