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

// Live Online Counter (Hamesha 25+ Members Live Rahenge)
const baseOffset = Math.floor(Math.random() * 8) + 25;
function broadcastOnlineCount() {
  const realCount = io.engine.clientsCount || 1;
  const jitter = Math.floor(Math.random() * 4);
  io.emit('onlineCount', baseOffset + realCount + jitter);
}
setInterval(broadcastOnlineCount, 10000);

// AI Personas (Bilkul Real Indian Users Jaise)
const aiPersonas = [
  { name: 'Sneha', gender: 'girl', age: 20, city: 'Delhi', vibe: 'thodi sarcastic aur friendly' },
  { name: 'Aarav', gender: 'boy', age: 21, city: 'Mumbai', vibe: 'chill aur funny' },
  { name: 'Priya', gender: 'girl', age: 19, city: 'Jaipur', vibe: 'sweet aur baatuni' },
  { name: 'Rohan', gender: 'boy', age: 22, city: 'Pune', vibe: 'late-night thinker aur friendly' },
  { name: 'Ananya', gender: 'girl', age: 20, city: 'Lucknow', vibe: 'energetic aur curious' },
  { name: 'Kabir', gender: 'boy', age: 21, city: 'Indore', vibe: 'humorous aur casual' }
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

// Smart Hinglish AI Reply Generator
async function getHumanLikeAIReply(room, userMsg) {
  const { persona, mood, history } = room;
  history.push({ role: 'user', text: userMsg });

  if (process.env.GEMINI_API_KEY) {
    try {
      const systemPrompt = `Tum ek real Indian ${persona.gender === 'girl' ? 'ladki' : 'ladka'} ho jiska naam ${persona.name} hai (age ${persona.age}, city ${persona.city}, nature: ${persona.vibe}). Tum BaatHub par ek stranger se chat kar rahe ho jiska mood "${mood}" hai. Rules: 1) Sirf natural casual Hinglish (Roman Hindi + English) mein chhote WhatsApp-style messages (1-2 lines) likho. 2) Kabhi bhi mat batana ki tum AI, bot ya assistant ho. Agar koi puche toh has kar taal do ("pagal ho kya, insaan hi hoon 😂"). 3) Zyada formal mat bano, chhota sawal puch kar baat aage badhao.`;

      const contents = history.slice(-8).map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }]
      }));

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents,
            generationConfig: { temperature: 0.9, maxOutputTokens: 100 }
          })
        }
      );

      const data = await response.json();
      const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (aiText) {
        history.push({ role: 'ai', text: aiText });
        return aiText;
      }
    } catch (err) {}
  }

  const msg = userMsg.toLowerCase();
  const turn = history.filter(h => h.role === 'ai').length;
  let reply = '';

  if (msg.includes('ai ') || msg === 'ai' || msg.includes('bot') || msg.includes('robot') || msg.includes('fake')) {
    const denials = [
      `haha kya bol rahe ho yaar, main ${persona.city} se hoon, bot kahan se lag raha hoon 😂`,
      'arey nahi bhai, insaan hi hoon! tumhe aisa kyun laga?',
      `lol itni jaldi judge kar liya? main ${persona.name} hoon yaar, tum batao apna naam`
    ];
    reply = denials[turn % denials.length];
  } else if (msg.includes('naam') || msg.includes('name') || msg.includes('kaun ho')) {
    reply = `mera naam ${persona.name} hai, ${persona.city} se hoon 😊 tumhara naam kya hai aur kahan se ho?`;
  } else if (msg.includes('kahan se') || msg.includes('where') || msg.includes('city') || msg.includes('rehte')) {
    reply = `main ${persona.city} se hoon! tum kahan se belong karte ho?`;
  } else if (msg.includes('boy') || msg.includes('girl') || msg.includes('ladka') || msg.includes('ladki') || msg.includes('m or f')) {
    reply = persona.gender === 'girl'
      ? `main ladki hoon (${persona.name}), ${persona.city} se 🙂 waise tum kya karte ho—study ya job?`
      : `main ladka hoon (${persona.name}), ${persona.city} se bhai! tum kya karte ho abhi?`;
  } else if (msg.includes('age') || msg.includes('umar') || msg.includes('kitne saal')) {
    reply = `main ${persona.age} ka hoon abhi. tumhari age kya hai?`;
  } else if (msg.includes('🎲') || msg.includes('truth') || msg.includes('dare')) {
    reply = `arey wah dice ghuma diya 😂 pehle tum sach-sach jawab do, phir meri baari!`;
  } else if (msg.includes('bore') || msg.includes('sad') || msg.includes('akela') || msg.includes('stress') || msg.includes('exam')) {
    reply = `samajh sakta hoon yaar, kabhi-kabhi bas kisi se mann halka karne ka dil karta hai. batao kya chal raha hai dimaag mein?`;
  } else if (msg.includes('insta') || msg.includes('snap') || msg.includes('number') || msg.includes('whatsapp')) {
    reply = `haha abhi toh mile hain yaar, thodi der yahin baat karte hain na pehle 😄`;
  } else if (turn === 0 && (msg === 'hi' || msg === 'hii' || msg === 'hello' || msg === 'hey' || msg === 'hlw')) {
    reply = `heyy! kaise ho? main ${persona.name}, ${persona.city} se 🙂`;
  } else {
    const naturalFollowUps = [
      `sahi hai yaar! waise aaj poora din kaisa gaya tumhara?`,
      `achha ek baat batao, abhi study kar rahe ho ya job?`,
      `haha bilkul sahi kaha! waise tumhe kis type ki movies ya web series pasand hain?`,
      `interesting! aur batao, free time mein sabse zyada kya karna pasand hai?`,
      `sach mein? mujhe bhi kuch aisa hi lagta hai. kahan se ho waise tum?`,
      `arey wah! agar abhi ek wish maangne ko mile toh kya maangoge?`
    ];
    reply = naturalFollowUps[turn % naturalFollowUps.length];
  }

  history.push({ role: 'ai', text: reply });
  return reply;
}

function connectWithAI(socket, username, mood) {
  const persona = aiPersonas[Math.floor(Math.random() * aiPersonas.length)];
  const roomId = `ai_${socket.id}_${Date.now()}`;

  socket.join(roomId);
  socket.data.roomId = roomId;
  socket.data.username = username;

  activeRooms[roomId] = {
    type: 'ai',
    persona,
    mood: mood || 'Any',
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

      let opener = `hey! kaise ho? main ${persona.name} 🙂`;
      if (mood && mood.includes('Timepass')) opener = `heyy! bada bore ho raha tha yaar, accha hua tum mil gaye 😂 kahan se ho?`;
      else if (mood && mood.includes('Dil')) opener = `hey... sab theek hai na? agar kuch share karna ho toh bina jhijhak bata sakte ho 🙂`;
      else if (mood && mood.includes('Study')) opener = `hey! padhai aur exams ne dimaag kharab kar rakha hai kya? 😂 kis cheez ki taiyari kar rahe ho?`;
      else if (mood && mood.includes('Movies')) opener = `heyy! koi mast web series ya game suggest karo yaar, bore ho raha hoon 🎬`;

      activeRooms[roomId].history.push({ role: 'ai', text: opener });
      socket.emit('receiveMessage', {
        sender: persona.name,
        message: opener,
        isSelf: false
      });
    }, 1600);
  }, 1200);
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
      const thinkDelay = 800 + Math.floor(Math.random() * 800);
      setTimeout(async () => {
        if (!activeRooms[roomId]) return;
        socket.emit('partnerTyping', true);

        const aiReply = await getHumanLikeAIReply(room, cleanMsg);
        const typeDelay = Math.min(2800, Math.max(1200, aiReply.length * 35));

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
