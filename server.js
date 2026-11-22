const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Public folder ki files serve karein
app.use(express.static(path.join(__dirname, 'public')));

// Basic Profanity Filter (Google AdSense safety ke liye)
const badWords = ['spamlink', 'abuse1', 'abuse2']; // Yahan apne hisab se words add karein
function cleanMessage(text) {
  let cleaned = text;
  badWords.forEach((word) => {
    const regex = new RegExp(`\\b${word}\\b`, 'gi');
    cleaned = cleaned.replace(regex, '***');
  });
  return cleaned;
}

// Google Search Console ke liye automatic robots.txt
app.get('/robots.txt', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  res.type('text/plain');
  res.send(`User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml`);
});

// Google Search Console ke liye automatic sitemap.xml
app.get('/sitemap.xml', (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  res.type('application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${baseUrl}/</loc><priority>1.0</priority></url>
  <url><loc>${baseUrl}/privacy</loc><priority>0.5</priority></url>
  <url><loc>${baseUrl}/terms</loc><priority>0.5</priority></url>
</urlset>`);
});

// AdSense Approval ke liye zaroori Legal Pages
app.get('/privacy', (req, res) => {
  res.send(`
    <div style="font-family:sans-serif;max-width:700px;margin:40px auto;line-height:1.6;">
      <h1>Privacy Policy</h1>
      <p>Hum users ki privacy ka samman karte hain. Is platform par ki gayi chats server par permanently save nahi hoti hain.</p>
      <p>Hum third-party advertising partners (jaise Google AdSense) ka upyog kar sakte hain jo cookies ke zariye relevant ads dikhate hain.</p>
      <a href="/">Wapas Home par jayein</a>
    </div>
  `);
});

app.get('/terms', (req, res) => {
  res.send(`
    <div style="font-family:sans-serif;max-width:700px;margin:40px auto;line-height:1.6;">
      <h1>Terms & Community Guidelines</h1>
      <p>1. Is website ka upyog karne ke liye aapki umar 18 varsh ya usse adhik honi chahiye.</p>
      <p>2. Kisi bhi tarah ka spam, gali-galoch, ya illegal content bhejna sakht mana hai.</p>
      <a href="/">Wapas Home par jayein</a>
    </div>
  `);
});

// Real-Time Chat aur Matchmaking Logic
let waitingStranger = null;

io.on('connection', (socket) => {
  socket.data.username = 'Guest';
  socket.data.room = null;
  socket.data.mode = null;

  // Mode 1: Anjaan vyakti (Stranger) se baat karein
  socket.on('find_stranger', (username) => {
    leaveCurrentRoom(socket);
    socket.data.username = (username || 'Guest').trim().slice(0, 20);
    socket.data.mode = 'stranger';

    if (waitingStranger && waitingStranger.connected && waitingStranger.id !== socket.id) {
      const partner = waitingStranger;
      waitingStranger = null;

      const roomId = `stranger_${partner.id}_${socket.id}`;
      socket.join(roomId);
      partner.join(roomId);

      socket.data.room = roomId;
      partner.data.room = roomId;

      socket.emit('chat_started', {
        mode: 'stranger',
        partnerName: partner.data.username
      });
      partner.emit('chat_started', {
        mode: 'stranger',
        partnerName: socket.data.username
      });
    } else {
      waitingStranger = socket;
      socket.emit('waiting_stranger');
    }
  });

  // Mode 2: Doston ke saath Private Room join/create karein
  socket.on('join_private', ({ username, roomCode }) => {
    leaveCurrentRoom(socket);
    const cleanCode = (roomCode || '').trim().toUpperCase().slice(0, 15);
    if (!cleanCode) return;

    socket.data.username = (username || 'Guest').trim().slice(0, 20);
    socket.data.mode = 'private';
    const roomId = `private_${cleanCode}`;

    socket.join(roomId);
    socket.data.room = roomId;

    socket.emit('chat_started', {
      mode: 'private',
      roomCode: cleanCode
    });

    socket.to(roomId).emit('system_message', `${socket.data.username} ne room join kiya.`);
  });

  // Message bhejna
  socket.on('send_message', (rawText) => {
    const room = socket.data.room;
    if (!room || !rawText || !rawText.trim()) return;

    const safeText = cleanMessage(rawText.trim().slice(0, 1000));
    io.to(room).emit('receive_message', {
      senderId: socket.id,
      senderName: socket.data.username,
      text: safeText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });

  // Typing indicator
  socket.on('typing', (isTyping) => {
    if (socket.data.room) {
      socket.to(socket.data.room).emit('partner_typing', {
        username: socket.data.username,
        isTyping
      });
    }
  });

  // Chat chhodna
  socket.on('leave_chat', () => {
    leaveCurrentRoom(socket);
  });

  socket.on('disconnect', () => {
    leaveCurrentRoom(socket);
  });

  function leaveCurrentRoom(sock) {
    if (waitingStranger && waitingStranger.id === sock.id) {
      waitingStranger = null;
    }
    if (sock.data.room) {
      const oldRoom = sock.data.room;
      sock.to(oldRoom).emit('partner_left', `${sock.data.username} ne chat chhod di hai.`);
      sock.leave(oldRoom);
      sock.data.room = null;
    }
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server chal raha hai: http://localhost:${PORT}`);
});
