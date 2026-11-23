const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e7 // Bade messages ke liye 10MB limit
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

let cachedModel = 'gemini-3.0-flash';

function extractGeminiText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts
    .filter(p => !p.thought && typeof p.text === 'string')
    .map(p => p.text)
    .join('')
    .trim();
}

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
          contents: [{ role: 'user', parts: [{ text: 'Reply casually in 5 words in Hinglish: aur bhai kya haal hai' }] }],
          generationConfig: { maxOutputTokens: 300 }
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
            contents: [{ role: 'user', parts: [{ text: 'Reply casually in 5 words in Hinglish: aur bhai kya haal hai' }] }],
            generationConfig: { maxOutputTokens: 300 }
          })
        }
      );
      data = await response.json();
    }

    if (data.error) {
      return res.send(`<h2>❌ Google API Error:</h2><pre>${JSON.stringify(data.error, null, 2)}</pre>`);
    }
    const reply = extractGeminiText(data) || 'Empty response';
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

// 24 Unique Indian Personas (Taaki Naam Kabhi Repeat Na Ho)
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
          temperature: 1.1,
          topP: 0.95,
          maxOutputTokens: 800
        }
      })
    }
  );
  const data = await response.json();
  if (data.error) {
    console.error(`Gemini (${modelName}) Error:`, data.error.message);
    return { error: true };
  }
  const text = extractGeminiText(data);
  return { text: text || null };
}

// Real Human-Like Hinglish AI Conversation Engine
async function getHumanLikeAIReply(room, userMsg) {
  const { persona, mood, history, opener, usedFallbacks } = room;
  history.push({ role: 'user', text: userMsg });

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (apiKey) {
    try {
      const systemPrompt = `Tum ek 100% real Indian ${persona.gender === 'girl' ? 'ladki' : 'ladka'} ho jiska naam ${persona.name} hai (age ${persona.age}, city ${persona.city}, interests: ${persona.hobby}, personality: ${persona.vibe}). Tum abhi BaatHub par ek random stranger se chat kar rahe ho (mood: "${mood}"). Tumne chat ki shuruat is message se ki thi: "${opener}".

Bilkul Real Insaan Lagne Ke Rules:
1. Texting style: Bilkul asli Indian youngster ki tarah lowercase mein casual Hinglish likho (jaise "yr", "acha", "hn", "nhi", "sach me", "kya scene", "lol", "bro"). Formal Hindi ya textbook English bilkul mat likhna, aur har sentence ke end mein full-stop (.) mat lagana.
2. Message length match karo: Agar user chhota message bheje (jaise "hi" ya "kya kr rhe ho"), toh 1 chhoti line mein jawab do. Agar user bada paragraph ya apni koi story/problem likhe, toh dhyan se padhkar 2-4 lines mein genuine, emotional aur detailed reaction do.
3. Interview mat lo: Har message ke end mein sawal mat poocho! Kabhi sirf react karo, mazak karo, apni life ki koi chhoti baat batao, ya user ki baat par comment karo—jaise real dost karte hain.
4. Kabhi mat maanna ki tum AI, bot ya program ho: Agar koi shak kare ya puche "tum AI ho kya?", toh has kar casual jawab do (jaise "pagal h kya ${persona.city} me baitha hu mai 😂" ya "itni jaldi judge kr liya bhai, insaan hi hu").
5. Kabhi bhi apni purani line ya pattern repeat mat karo.`;

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

      let result = await callGeminiModel(cachedModel, apiKey, systemPrompt, contents);
      if (result.error || !result.text) {
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

  // Backup pool (agar kabhi API key quota hit ho jaye)
  const backupReplies = [
    `acha yr sahi h, mai ${persona.city} se hu waise, tum kahan se ho?`,
    `lol sach me? aajkal toh bas yahi sab chal rha h life me`,
    `yr aaj subah se itna bore ho rha tha, socha kisi random bande se hi baat kr lu`,
    `waise tum abhi clg me ho ya job wagera kr rhe ho?`,
    `koi mast movie ya series btao yr dekhne ke liye, dimaag kharab ho gya h scroll krte krte`,
    `haha baat toh sahi boli tumne, bilkul agree krta hu`
  ];

  const available = backupReplies.filter(r => !usedFallbacks.has(r));
  const pool = available.length > 0 ? available : backupReplies;
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  usedFallbacks.add(chosen);

  history.push({ role: 'ai', text: chosen });
  return chosen;
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
  const roomId = `ai_${socket.id}_${Date.now()}`;

  const casualOpeners = [
    `hey! kya haal hai? mai ${persona.name} 🙂`,
    `heyy, kahan se ho? mai ${persona.city} se hu`,
    `hi! aaj bada bore ho rha tha yaar, kya scene chal rha h?`,
    `heyy ${persona.name} here, kaise ho?`
  ];
  let opener = casualOpeners[Math.floor(Math.random() * casualOpeners.length)];

  if (mood && mood.includes('Timepass')) opener = `heyy! full bore ho rha tha yr, accha hua tum mil gaye 😂 kahan se ho?`;
  else if (mood && mood.includes('Dil')) opener = `hey... sab theek h na? agar kuch mann me ho toh bina soche bta sakte ho 🙂`;
  else if (mood && mood.includes('Study')) opener = `hey! padhai aur exams ne dimaag kharab kr rakha h kya 😂 kis cheez ki prep kr rhe ho?`;
  else if (mood && mood.includes('Movies')) opener = `heyy! koi mast web series ya game suggest kro yr, kuch dekhne ko nhi mil rha 🎬`;

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
        const typeDelay = Math.min(3200, Math.max(1100, aiReply.length * 25));

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
                                   
