const socket = io({ reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 1000 });

const landingView = document.getElementById('landingView');
const chatView = document.getElementById('chatView');
const navDrawer = document.getElementById('navDrawer');
const menuToggle = document.getElementById('menuToggle');
const homeBrand = document.getElementById('homeBrand');

const girlModeLockBtn = document.getElementById('girlModeLockBtn');
const chatGirlLockBtn = document.getElementById('chatGirlLockBtn');
const subModal = document.getElementById('subModal');
const activateSubBtn = document.getElementById('activateSubBtn');
const closeSubBtn = document.getElementById('closeSubBtn');

const nickInput = document.getElementById('nickInput');
const roomCodeField = document.getElementById('roomCodeField');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const mainStartBtn = document.getElementById('mainStartBtn');

const landingLiveText = document.getElementById('landingLiveText');
const landingLoveText = document.getElementById('landingLoveText');
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
const exitChatBtn = document.getElementById('exitChatBtn');

let mode = 'text';
let mood = 'Any';
let girlModeUnlocked = false;
let genderFilter = 'any';
let typingTimer;
let session = { active: false, isPrivate: false, partnerName: '', roomCode: '', username: 'Stranger' };

function syncGirlLockUI() {
  const txt = girlModeUnlocked
    ? (genderFilter === 'girl' ? '💖 Girl Mode ON' : '🔓 Girl Mode (Tap)')
    : '🔒 Girl Mode';
  [girlModeLockBtn, chatGirlLockBtn].forEach(btn => {
    if (!btn) return;
    btn.textContent = txt;
    btn.classList.toggle('unlocked', girlModeUnlocked && genderFilter === 'girl');
  });
}

function handleGirlLockClick() {
  if (!girlModeUnlocked) {
    subModal.classList.remove('hidden');
    return;
  }
  genderFilter = genderFilter === 'girl' ? 'any' : 'girl';
  syncGirlLockUI();
  appendSys(genderFilter === 'girl' ? 'Girl Mode ON — sirf girl profiles match hongi.' : 'Random mode ON — koi bhi aa sakta hai.');
}

girlModeLockBtn.addEventListener('click', handleGirlLockClick);
chatGirlLockBtn.addEventListener('click', handleGirlLockClick);
document.getElementById('navUnlockGirl').addEventListener('click', () => { navDrawer.classList.add('hidden'); handleGirlLockClick(); });

activateSubBtn.addEventListener('click', () => {
  girlModeUnlocked = true;
  genderFilter = 'girl';
  subModal.classList.add('hidden');
  syncGirlLockUI();
  appendSys('Subscription active! Girl Mode unlock ho gaya.');
});

closeSubBtn.addEventListener('click', () => {
  genderFilter = 'any';
  subModal.classList.add('hidden');
  syncGirlLockUI();
});

menuToggle.addEventListener('click', () => navDrawer.classList.toggle('hidden'));
document.addEventListener('click', (e) => {
  if (!navDrawer.contains(e.target) && e.target !== menuToggle) navDrawer.classList.add('hidden');
});

document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    mode = btn.dataset.mode;
    const labels = { text: 'Start Live Chat →', voice: 'Start Voice Chat →', video: 'Start Video Chat →' };
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
  const kVal = (Math.max(10240, Number(c) || 10240) / 1000).toFixed(2) + 'k';
  if (landingLiveText) landingLiveText.textContent = `${kVal} people live`;
  if (landingLoveText) landingLoveText.textContent = '9k love';
  if (roomOnlineTag) roomOnlineTag.textContent = `${kVal} people live • 9k love`;
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

function showWelcomeNotice() {
  emptyLobby.classList.add('hidden');
  const box = document.createElement('div');
  box.className = 'welcome-card';
  box.textContent = 'Welcome back to BaatHub 🎉 — 10k+ people live & 9k love right now. Ready to chat?';
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
  const activeGender = girlModeUnlocked ? genderFilter : 'any';
  session = { active: true, isPrivate: false, partnerName: '', roomCode: '', username };
  chatStatusLabel.textContent = 'Matching...';
  appendSys(activeGender === 'girl' ? 'Girl Mode matching...' : 'Random match — koi bhi aa sakta hai...');
  if (!socket.connected) socket.connect();
  socket.emit('joinRandom', { username, mood, genderFilter: activeGender });
}

function openRandomLobby() {
  showChatScreen('Random Chat', '10k+ people live • 9k love — no signup', true);
  showWelcomeNotice();
}

mainStartBtn.addEventListener('click', () => { openRandomLobby(); triggerMatch(); });
startChatNowBtn.addEventListener('click', triggerMatch);

nextBtn.addEventListener('click', () => {
  if (session.isPrivate) { appendSys('Private room mein Next active nahi hai.'); return; }
  showChatScreen('Random Chat', 'Matching next person...', false);
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

exitChatBtn.addEventListener('click', () => { session.active = false; socket.emit('leaveChat'); showLanding(); });
homeBrand.addEventListener('click', (e) => { e.preventDefault(); showLanding(); });
document.getElementById('navTextChat').addEventListener('click', openRandomLobby);
document.getElementById('navPrivateRoom').addEventListener('click', () => {
  const code = (roomCodeField.value.trim() || 'DOST123').toUpperCase();
  session = { active: true, isPrivate: true, partnerName: `Room: ${code}`, roomCode: code, username: nickInput.value.trim() || 'Guest' };
  showChatScreen(`Room: ${code}`, 'Private friend room', false);
  if (!socket.connected) socket.connect();
  socket.emit('joinPrivate', { username: session.username, roomCode: code });
});
document.getElementById('fRandom').addEventListener('click', (e) => { e.preventDefault(); openRandomLobby(); });
document.getElementById('fRoom').addEventListener('click', (e) => { e.preventDefault(); roomCodeField.focus(); });

function sendChat(text, image = null) {
  if (!session.active) triggerMatch();
  const payload = {
    message: text, image,
    partnerName: session.partnerName, isPrivate: session.isPrivate,
    roomCode: session.roomCode, mood, username: session.username
  };
  if (socket.connected) socket.emit('sendMessage', payload);
  else { socket.connect(); socket.once('connect', () => socket.emit('sendMessage', payload)); }
}

composerForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const t = msgInput.value.trim();
  if (!t) return;
  sendChat(t);
  msgInput.value = '';
  if (socket.connected) socket.emit('typing', false);
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
      c.width = img.width * s; c.height = img.height * s;
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

syncGirlLockUI();
