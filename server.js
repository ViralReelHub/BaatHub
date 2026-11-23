const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

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

let cachedModel = 'gemini-3.0-flash';

async function resolveWorkingModel(apiKey) {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await res.json();
    const models = (data.models || []).filter(m =>
      (m.supportedGenerationMethods || []).includes('generateContent') &&
      m.name.includes('gemini')
    );
    const preferred =
      models.find(m => m.name.includes('gemini-3.0-flash')) ||
      models.find(m => m.name.includes('flash')) ||
      models[0];
    if (preferred) {
      cachedModel = preferred.name.replace('models/', '');
      return cachedModel;
    }
  } catch (e) {}
  return cachedModel;
}

// AI Connection Check Route
app.get('/test-ai', async (req, res) => {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    return res.send('<h2>❌ Error: Render par GEMINI_API_KEY set nahi hai!</h2>');
  }
  try {
    let model = cachedModel;
    let response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Reply in 4 words in Hinglish: aur bhai kya haal' }] }]
        })
      }
    );
    let data = await response.json();

    if (data.error) {
      model = await resolveWorkingModel(apiKey);
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'Reply in 4 words in Hinglish: aur bhai kya haal' }] }]
          })
        }
      );
      data = await response.json();
    }

    if (data.error) {
      return res.send(`<h2>❌ Google API Error:</h2><pre>${JSON.stringify(data.error, null, 2)}</pre>`);
    }
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Empty response';
    res.send(`<h2>✅ Real AI Connected & Working! (${model})</h2><p><strong>AI Reply:</strong> ${reply}</p><a href="/">Ab Chat Test Karein</a>`);
  } catch (err) {
    res.send(`<h2>❌ Server Error:</h2><p>${err.message}</p>`);
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

// AI Personas (Real Indian Users Jaise)
const aiPersonas = [
  { name: 'Sneha', gender: 'girl', age: 20, city: 'Delhi', hobby: 'reels, momos aur late night music', vibe: 'thodi sarcastic, witty aur friendly' },
  { name: 'Aarav', gender: 'boy', age: 21, city: 'Mumbai', hobby: 'gaming, cricket aur standup comedy', vibe: 'chill, funny aur bindass' },
  { name: 'Priya', gender: 'girl', age: 19, city: 'Jaipur', hobby: 'web series, coffee aur travelling', vibe: 'sweet, expressive aur baatuni' },
  { name: 'Rohan', gender: 'boy', age: 22, city: 'Pune', hobby: 'coding, gym aur movies', vibe: 'friendly, relatable aur curious' },
  { name: 'Ananya', gender: 'girl', age: 20, city: 'Lucknow', hobby: 'shayari, songs aur gossip', vibe: 'energetic aur playful' },
  { name: 'Kabir', gender: 'boy', age: 21, city: 'Indore', hobby: 'street food, bikes aur memes', vibe: 'humorous aur casual' }
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

async function callGeminiModel(modelName, apiKey, systemPrompt, contents) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }
        ],
        generationConfig: {
          temperature: 1.05,
          topP: 0.95,
          maxOutputTokens: 200
        }
      })
    }
  );
  const data = await response.json();
  if (data.error) {
    console.error(`Gemini (${modelName}) Error:`, data.error.message);
    return { error: true };
  }
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  return { text };
}

// Real Gemini AI Conversation Engine
async function getHumanLikeAIReply(room, userMsg) {
  const { persona, mood, history, opener, usedFallbacks } = room;
  history.push({ role: 'user', text: userMsg });

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (apiKey) {
    try {
      const systemPrompt = `Tum ek real Indian ${persona.gender === 'girl' ? 'ladki' : 'ladka'} ho jiska naam ${persona.name} hai (age ${persona.age}, city ${persona.city}, hobbies: ${persona.hobby}, nature: ${persona.vibe}). Tum BaatHub par ek stranger se live chat kar rahe ho jiska mood "${mood}" hai. Tumne pehla message bheja tha: "${opener}".

Rules:
1. Bilkul asli Indian college student ki tarah casual Hinglish (Roman Hindi + English) mein 1-2 lines ke chhote WhatsApp-style replies do.
2. User ke message ka exact, natural aur naya jawab do—kabhi bhi apni baat repeat mat karo.
3. Kabhi mat maanna ki tum AI ya bot ho. Koi puche toh has kar casual jawab do ("pagal ho kya, ${persona.city} se hoon main 😂").`;

      const recent = history.slice(-14);
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

      let result = await callGeminiModel(cachedModel, apiKey, systemPrompt, contents);
      if (result.error) {
        const newModel = await resolveWorkingModel(apiKey);
        result = await callGeminiModel(newModel, apiKey, systemPrompt, contents);
      }

      if (result.text) {
        history.push({ role: 'ai', text: result.text });
        return result.text;
      }
    } catch (err) {
      console.error('AI Fetch Error:', err.message);
    }
  }

  // Non-repeating backup pool
  const backupReplies = [
    `haha sahi bol rahe ho yaar! waise tum kahan se ho?`,
    `achha ek baat batao, abhi study kar rahe ho ya job?`,
    `main ${persona.city} se hoon, yahan toh aaj mausam mast ho raha hai. tumhare wahan kaisa hai?`,
    `waise tumhe free time mein kya karna sabse zyada pasand hai?`,
    `koi achhi movie ya web series suggest karo yaar, dekhne ke liye kuch nahi mil raha`,
    `haha bilkul! aaj poora din kaisa gaya tumhara?`,
    `sach mein? waise tum kis type ke gaane sunte ho zyada?`,
    `arey wah! agar abhi kahin ghumne jaane ka mauka mile toh kahan jaoge?`
  ];

  const available = backupReplies.filter(r => !usedFallbacks.has(r));
  const pool = available.length > 0 ? available : backupReplies;
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  usedFallbacks.add(chosen);

  history.push({ role: 'ai', text: chosen });
  return chosen;
}

function connectWithAI(socket, username, mood) {
  const persona = aiPersonas[Math.floor(Math.random() * aiPersonas.length)];
  const roomId = `ai_${socket.id}_${Date.now()}`;

  let opener = `hey! kaise ho? main ${persona.name} 🙂`;
  if (mood && mood.includes('Timepass')) opener = `heyy! bada bore ho raha tha yaar, accha hua tum mil gaye 😂 kahan se ho?`;
  else if (mood && mood.includes('Dil')) opener = `hey... sab theek hai na? agar kuch share karna ho toh bina jhijhak bata sakte ho 🙂`;
  else if (mood && mood.includes('Study')) opener = `hey! padhai aur exams ne dimaag kharab kar rakha hai kya? 😂 kis cheez ki taiyari kar rahe ho?`;
  else if (mood && mood.includes('Movies')) opener = `heyy! koi mast web series ya game suggest karo yaar, bore ho raha hoon 🎬`;

  socket.join(roomId);
  socket.data.roomId = roomId;
  socket.data.username = username;

  activeRooms[roomId] = {
    type: 'ai',
    persona,
    mood: mood || 'Any',
    opener,
    history: [],
    usedFallbacks: new Set(),
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
  }, 1100);
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
        const typeDelay = Math.min(2500, Math.max(1000, aiReply.length * 30));

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
    if (roomId && activeRooms[roomId] && activeRooms[roomId].type !== 'ai') {
      socket.to(roomId).emit('partnerTyping', isTyping);
    }
  });

  socket.on('leaveChat', () => {
    cleanupUser(socket);
  });

  socket.on('disconnect', () => {
    cleanupUser(socket);
    broadcastOnlineCount();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server chal raha hai: http://localhost:${PORT}`);
});
