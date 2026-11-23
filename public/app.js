const socket = io({ reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 1000 });

const landingView = document.getElementById('landingView');
const chatView = document.getElementById('chatView');
const navDrawer = document.getElementById('navDrawer');
const menuToggle = document.getElementById('menuToggle');
const homeBrand = document.getElementById('homeBrand');

const nickInput = document.getElementById('nickInput');
const roomCodeField = document.getElementById('roomCodeField');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const mainStartBtn = document.getElementById('mainStartBtn');

const landingOnline = document.getElementById('landingOnline');
const roomOnlineTag = document.getElementById('roomOnlineTag');
const chatStatusLabel = document.getElementById('chatStatusLabel');
const chatStream = document.getElementById('chatStream');
const emptyLobby = document.getElementById('emptyLobby');
const emptyHeading = document.getElementById('emptyHeading');
const emptySub = document.getElementById('emptySub');
const startChatNowBtn = document.getElementById('startChatNowBtn');

const composerForm = document.getElementById('composerForm');
const msgInput = document.getElementById('msgInput');
const nextBtn = document.getElementById('nextBtn');
const picPickBtn = document.getElementById('picPickBtn');
const picFile = document.getElementById('picFile');
const filterPill = document.getElementById('filterPill');
const exitChatBtn = document.getElementById('exitChatBtn');

let mode = 'text';
let mood = 'Any';
let typingTimer;
let session = { active: false, isPrivate: false, partnerName: '', roomCode: '', username: 'Stranger' };

menuToggle.addEventListener('click', () => navDrawer.classList.toggle('hidden'));
document.addEventListener('click', (e) => {
  if (!navDrawer.contains(e.target) && e.target !== menuToggle) navDrawer.classList.add('hidden');
});

document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    mode = btn.dataset.mode;
    const labels = { text: 'Start Text Chat →', voice: 'Start Voice Chat →', video: 'Start Video Chat →' };
    mainStartBtn.textContent = labels[mode];
  });
});

document.querySelectorAll('.chip[data-mood]').forEach(ch => {
  ch.addEventListener('click', () => {
    document.querySelectorAll('.chip[data-mood]').forEach(x => x.classList.remove('active'));
    ch.classList.add('active');
    mood = ch.dataset.mood;
  });
});

socket.on('onlineCount', (c) => {
  if (landingOnline) landingOnline.textContent = `${c} people chatting right now`;
  if (roomOnlineTag) roomOnlineTag.textContent = `${c} online`;
});

function showLanding() {
  navDrawer.classList.add('hidden');
  chatView.classList.add('hidden');
  landingView.classList.remove('hidden');
}

function showChatScreen(title, sub, showStartBtn = true) {
  navDrawer.classList.add('hidden');
  landingView.classList.add('hidden');
  chatView.classList.remove('hidden');
  chatStream.innerHTML = '';
  emptyHeading.textContent = title;
  emptySub.textContent = sub;
  startChatNowBtn.classList.toggle('hidden', !showStartBtn);
  chatStream.appendChild(emptyLobby);
  emptyLobby.classList.remove('hidden');
  chatStatusLabel.textContent = showStartBtn ? 'Ready' : 'Connecting...';
}

function showWelcomeNotice(countText) {
  emptyLobby.classList.add('hidden');
  const box = document.createElement('div');
  box.className = 'welcome-card';
  box.textContent = `Welcome back to BaatHub 🎉 — ${countText} people online right now. Ready to meet someone new?`;
  chatStream.appendChild(box);
}

function appendSys(txt) {
  const d = document.createElement('div');
  d.className = 'sys-note';
  d.textContent = txt;
  chatStream.appendChild(d);
  chatStream.scrollTop = chatStream.scrollHeight;
}

function appendMsg(sender, text, isSelf, image) {
  emptyLobby.classList.add('hidden');
  const row = document.createElement('div');
  row.className = `m-row ${isSelf ? 'me' : 'them'}`;
  const bub = document.createElement('div');
  bub.className = 'm-bub';
  if (image) {
    const img = document.createElement('img');
    img.src = image;
    bub.appendChild(img);
  }
  if (text) {
    const sp = document.createElement('span');
    sp.textContent = text;
    bub.appendChild(sp);
  }
  row.appendChild(bub);
  chatStream.appendChild(row);
  chatStream.scrollTop = chatStream.scrollHeight;
}

function triggerMatch() {
  const username = nickInput.value.trim() || 'Stranger';
  session = { active: true, isPrivate: false, partnerName: '', roomCode: '', username };
  chatStatusLabel.textContent = 'Finding match...';
  appendSys('Connecting to a stranger...');
  if (!socket.connected) socket.connect();
  socket.emit('joinRandom', { username, mood });
}

function openRandomLobby() {
  const heading = mode === 'voice' ? 'Random Voice Chat' : mode === 'video' ? 'Random Video Chat' : 'Random Text Chat';
  showChatScreen(heading, 'Chat anonymously with strangers — no signup', true);
  showWelcomeNotice(roomOnlineTag.textContent.replace(' online', '') || '540+');
}

mainStartBtn.addEventListener('click', () => {
  openRandomLobby();
  triggerMatch();
});

startChatNowBtn.addEventListener('click', triggerMatch);
nextBtn.addEventListener('click', () => {
  if (session.isPrivate) {
    appendSys('Private room mein Next active nahi hai.');
    return;
  }
  showChatScreen('Random Text Chat', 'Matching next stranger...', false);
  triggerMatch();
});

joinRoomBtn.addEventListener('click', () => {
  const username = nickInput.value.trim() || 'Guest';
  const code = (roomCodeField.value.trim() || 'ROOM' + Math.floor(100 + Math.random() * 900)).toUpperCase();
  session = { active: true, isPrivate: true, partnerName: `Room: ${code}`, roomCode: code, username };
  showChatScreen(`Room: ${code}`, 'Share room code with friends', false);
  appendSys(`Joined room ${code}`);
  if (!socket.connected) socket.connect();
  socket.emit('joinPrivate', { username, roomCode: code });
});

filterPill.addEventListener('click', () => {
  const moods = ['Any', '🎲 Truth / Dare', '😂 Timepass', '💔 Dil ki Baat'];
  mood = moods[(moods.indexOf(mood) + 1) % moods.length];
  appendSys(`Mood set to: ${mood}`);
});

exitChatBtn.addEventListener('click', () => {
  session.active = false;
  socket.emit('leaveChat');
  showLanding();
});

homeBrand.addEventListener('click', (e) => { e.preventDefault(); showLanding(); });
document.getElementById('navTextChat').addEventListener('click', openRandomLobby);
document.getElementById('navPrivateRoom').addEventListener('click', () => {
  const code = (roomCodeField.value.trim() || 'DOST123').toUpperCase();
  session = { active: true, isPrivate: true, partnerName: `Room: ${code}`, roomCode: code, username: nickInput.value.trim() || 'Guest' };
  showChatScreen(`Room: ${code}`, 'Private friend room', false);
  if (!socket.connected) socket.connect();
  socket.emit('joinPrivate', { username: session.username, roomCode: code });
});
document.getElementById('navVip').addEventListener('click', () => {
  navDrawer.classList.add('hidden');
  appendSys('VIP gender & priority filters jald aa rahe hain.');
});
document.getElementById('fRandom').addEventListener('click', (e) => { e.preventDefault(); openRandomLobby(); });
document.getElementById('fRoom').addEventListener('click', (e) => { e.preventDefault(); roomCodeField.focus(); });

function sendChat(text, image = null) {
  if (!session.active) triggerMatch();
  const payload = {
    message: text,
    image,
    partnerName: session.partnerName,
    isPrivate: session.isPrivate,
    roomCode: session.roomCode,
    mood,
    username: session.username
  };
  if (socket.connected) socket.emit('sendMessage', payload);
  else {
    socket.connect();
    socket.once('connect', () => socket.emit('sendMessage', payload));
  }
}

composerForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const t = msgInput.value.trim();
  if (!t) return;
  sendChat(t);
  msgInput.value = '';
  if (socket.connected) socket.emit('typing', false);
});

msgInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    composerForm.dispatchEvent(new Event('submit'));
  }
});

msgInput.addEventListener('input', () => {
  if (!socket.connected) return;
  socket.emit('typing', true);
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => { if (socket.connected) socket.emit('typing', false); }, 900);
});

picPickBtn.addEventListener('click', () => picFile.click());
picFile.addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const rd = new FileReader();
  rd.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      const s = Math.min(1, 520 / img.width);
      c.width = img.width * s;
      c.height = img.height * s;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      sendChat('', c.toDataURL('image/jpeg', 0.72));
    };
    img.src = ev.target.result;
  };
  rd.readAsDataURL(f);
  picFile.value = '';
});

socket.on('chatStarted', ({ partnerName, isPrivate }) => {
  session.active = true;
  session.partnerName = partnerName;
  session.isPrivate = Boolean(isPrivate);
  chatStatusLabel.textContent = isPrivate ? partnerName : `Connected • ${partnerName}`;
});

socket.on('receiveMessage', ({ sender, message, image, isSelf }) => appendMsg(sender, message, isSelf, image));
socket.on('systemMessage', (m) => appendSys(m));
socket.on('partnerTyping', (t) => { chatStatusLabel.textContent = t ? 'typing...' : (session.partnerName || 'Connected'); });
socket.on('partnerLeft', (m) => {
  session.active = false;
  chatStatusLabel.textContent = 'Disconnected';
  appendSys(`${m} Hit Next for a new chat.`);
});
