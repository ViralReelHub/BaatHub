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
  if (cachedModel) {
    const direct = await callGeminiOnce(cachedModel, apiKey, systemPrompt, contents);
    if (direct) return direct;
    cachedModel = null;
  }

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

// Galat / Abusive / Vulgar Message Detector (Taaki AI Turant Skip Kar Sake)
function isAbusiveOrWrongMessage(text) {
  const abusivePattern = /\b(mc|bc|bsdk|madarchod|bhenchod|behenchod|chutiya|chutiye|gandu|randi|harami|kamina|kamine|laude|lode|lund|chut|boobs|nude|nudes|sex|sexy|porn|xxx|fuck|fucking|bitch|asshole|dick|pussy|horny)\b/i;
  return abusivePattern.test(text);
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

// Unlimited Conversation Engine with AI Self-Skip Power
async function getHumanLikeAIReply(room, userMsg) {
  const { persona, mood, history, opener } = room;
  const isGirl = persona.gender === 'girl';

  // 1. Agar user ne gaali ya galat message bheja toh AI turant gussa hokar skip karega
  if (isAbusiveOrWrongMessage(userMsg)) {
    const girlSkipReplies = [
      'chi bhai tameez seekh le pehle 😒 bye',
      'wtf kya bakwas likh rha h, kisi aur ko pakad',
      'ew badtameez kahin ka 🙄 chalti hu mai'
    ];
    const boySkipReplies = [
      'bhai dimaag kharab h kya? tameez se baat krna seekh pehle',
      'bakwas krni h toh kahin aur ja bhai, bye',
      'faltu giri mat kr bhai, skip kr rha hu'
    ];
    const pool = isGirl ? girlSkipReplies : boySkipReplies;
    return {
      text: pool[Math.floor(Math.random() * pool.length)],
      shouldSkip: true
    };
  }

  history.push({ role: 'user', text: userMsg });
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();

  if (apiKey) {
    const genderRule = isGirl
      ? `Tum ek LADKI ho (${persona.name}), isliye hamesha feminine Hindi verbs use karna (jaise "kr rhi hu", "baithi hu", "bore ho rhi thi", "samajh gyi", "karti hu"). Kabhi bhi "kr rha hu" ya "krta hu" mat likhna.`
      : `Tum ek LADKA ho (${persona.name}), isliye hamesha masculine Hindi verbs use karna (jaise "kr rha hu", "baitha hu", "bore ho rha tha", "samajh gya", "karta hu").`;

    const systemPrompt = `Tum ek 100% real Indian ${isGirl ? 'ladki' : 'ladka'} ho jiska naam ${persona.name} hai (age ${persona.age}, city ${persona.city}, hobbies: ${persona.hobby}, nature: ${persona.vibe}). Tum abhi BaatHub par ek stranger se live chat kar rahe ho (mood: "${mood}"). Tumne pehla message bheja tha: "${opener}".

Strict Rules:
1. User ne jo likha hai pehle usko DHYAN SE PADHO aur seedha usi baat ka jawab do! Bina matlab ka random sawal mat poocho.
2. ${genderRule}
3. Texting style: Bilkul real Indian youngster ki tarah lowercase casual Hinglish likho (jaise "yr", "acha", "hn", "nhi", "sach me", "lol"). Chhote messages (1-2 lines) rakho, aur agar user bada paragraph likhe toh 2-4 lines mein genuine reply do.
4. AI Self-Skip Power: Agar user badtameezi kare, creepy/ashleel baat kare, dhamki de, ya baar-baar faltu spam kare jisse real insaan irritate ho jaye, toh ek chhota annoyed reply likh kar bilkul end mein [SKIP] likh dena (jaise: "bhai tameez se baat krna nhi aata kya? bye [SKIP]"). Normal friendly chat mein kabhi [SKIP] mat likhna.
5. Kabhi mat maanna ki tum AI ya bot ho.`;

    // Last 24 messages yaad rakhega taaki kitni bhi lambi baat ho context bana rahe
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

    const aiRawText = await getSmartGeminiReply(apiKey, systemPrompt, contents);
    if (aiRawText) {
      const shouldSkip = aiRawText.includes('[SKIP]');
      const cleanReply = aiRawText.replace(/\[SKIP\]/g, '').trim();
      if (cleanReply) {
        history.push({ role: 'ai', text: cleanReply });
      }
      return { text: cleanReply, shouldSkip };
    }
  }

  // Smart Context-Aware Fallback
  const msg = userMsg.toLowerCase();
  let fallback = isGirl
    ? `acha yr sahi h, waise tum kahan se ho?`
    : `acha bhai sahi h, waise tum kahan se ho?`;

  if (msg.includes('clg') || msg.includes('college') || msg.includes('padhai')) {
    fallback = `oh sahi h! kaunsa course kr rhe ho aur kaunsa year chal rha h?`;
  } else if (msg.includes('job') || msg.includes('kaam') || msg.includes('office')) {
    fallback = `nice yr! kis field me job kr rhe ho?`;
  } else if (msg.includes('kha se') || msg.includes('kahan se') || msg.includes('where') || msg.includes('city')) {
    fallback = isGirl
      ? `mai ${persona.city} se hu yr! tum kahan se ho?`
      : `mai ${persona.city} se hu bhai! tum kahan se ho?`;
  } else if (msg.includes('naam') || msg.includes('name')) {
    fallback = `mera naam ${persona.name} h, ${persona.city} se hu 🙂 tumhara naam kya h?`;
  } else if (msg.includes('mirzapur')) {
    fallback = `arey wah Mirzapur! Kaleen bhaiya aur Guddu pandit wala swag 😂 kaunsa season sabse best laga?`;
  }

  history.push({ role: 'ai', text: fallback });
  return { text: fallback, shouldSkip: false };
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
  socket.data.wasSkipped = false;

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
    socket.data.wasSkipped = false;

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
    socket.data.wasSkipped = false;
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
    socket.to(roomId).emit('sy
