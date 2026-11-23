const socket = io({ reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 1000 });

const landingView = document.getElementById('landingView');
const chatView = document.getElementById('chatView');
const navDrawer = document.getElementById('navDrawer');
const menuToggle = document.getElementById('menuToggle');
const homeBrand = document.getElementById('homeBrand');
const motionPreviewBox = document.getElementById('motionPreviewBox');

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
const chatStream = document.getElementById('chatStream');
const emptyLobby = document.getElementById('emptyLobby');
const emptyHeading = document.getElementById('emptyHeading');
const emptySub = document.getElementById('emptySub');
const startChatNowBtn = document.getElementById('startChatNowBtn');

const voicePanel = document.getElementById('voicePanel');
const videoPanel = document.getElementById('videoPanel');
const voiceStatusText = document.getElementById('voiceStatusText');
const micToggleBtn = document.getElementById('micToggleBtn');
const localVideoEl = document.getElementById('localVideoEl');
const partnerFaceImg = document.getElementById('partnerFaceImg');
const partnerCamTag = document.getElementById('partnerCamTag');

const composerForm = document.getElementById('composerForm');
const msgInput = document.getElementById('msgInput');
const nextBtn = document.getElementById('nextBtn');
const picPickBtn = document.getElementById('picPickBtn');
const picFile = document.getElementById('picFile');
const exitChatBtn = document.getElementById('exitChatBtn');

const partnerFaces = [
  'https://randomuser.me/api/portraits/women/44.jpg',
  'https://randomuser.me/api/portraits/women/65.jpg',
  'https://randomuser.me/api/portraits/women/68.jpg',
  'https://randomuser.me/api/portraits/women/12.jpg',
  'https://randomuser.me/api/portraits/women/26.jpg',
  'https://randomuser.me/api/portraits/women/33.jpg',
  'https://randomuser.me/api/portraits/men/32.jpg',
  'https://randomuser.me/api/portraits/men/45.jpg'
];

let mode = 'text';
let mood = 'Any';
let girlModeUnlocked = false;
let genderFilter = 'any';
let typingTimer;
let localStream = null;
let faceIndex = 0;
let session = { active: false, isPrivate: false, partnerName: '', roomCode: '', username: 'Stranger' };

function setPartnerFace(name = 'Partner') {
  faceIndex = (faceIndex + 1) % partnerFaces.length;
  if (partnerFaceImg) partnerFaceImg.src = partnerFaces[faceIndex];
  if (partnerCamTag) partnerCamTag.textContent = name;
}

function runMotionPreview() {
  if (!motionPreviewBox) return;
  const steps = [
    () => { motionPreviewBox.innerHTML = `<div class="p-bub left">Hey 👋</div><div class="p-dots">•••</div>`; },
    () => { motionPreviewBox.innerHTML = `<div class="p-bub left">Hey 👋</div><div class="p-bub right">Hi! Where you from?</div><div class="p-dots">•••</div>`; },
    () => { motionPreviewBox.innerHTML = `<div class="p-bub left">Hey 👋</div><div class="p-bub right">Hi! Where you from?</div><div class="p-bub left">Delhi se 😊 tum kahan se?</div>`; },
    () => { motionPreviewBox.innerHTML = `<div class="p-bub right">Hi! Where you from?</div><div class="p-bub left">Delhi se 😊 tum kahan se?</div><div class="p-dots">•••</div>`; }
  ];
  let idx = 0;
  steps[0]();
  setInterval(() => { idx = (idx + 1) % steps.length; steps[idx](); }, 1900);
}
runMotionPreview();

function stopLocalCam() {
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  if (localVideoEl) localVideoEl.srcObject = null;
}

async function applyModeUI(newMode) {
  mode = newMode;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  document.querySelectorAll('.mini-m-btn').forEach(b => b.classList.toggle('active', b.dataset.mm === mode));

  const btnLabels = { text: 'Start Text Chat →', voice: 'Start Voice Chat →', video: 'Start Video Chat →' };
  mainStartBtn.textContent = btnLabels[mode];
  emptyHeading.textContent = mode === 'voice' ? 'Random Voice Chat' : mode === 'video' ? 'Random Video Chat' : 'Random Text Chat';

  voicePanel.classList.toggle('hidden', mode !== 'voice');
  videoPanel.classList.toggle('hidden', mode !== 'video');

  if (mode === 'video') {
    setPartnerFace(session.partnerName || 'Partner');
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localVideoEl.srcObject = localStream;
    } catch (_) {}
  } else {
    stopLocalCam();
  }
}

document.querySelectorAll('.mode-btn').forEach(btn => btn.addEventListener('click', () => applyModeUI(btn.dataset.mode)));
document.querySelectorAll('.mini-m-btn').forEach(btn => btn.addEventListener('click', () => applyModeUI(btn.dataset.mm)));

micToggleBtn.addEventListener('click', () => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    voiceStatusText.textContent = '🎙️ Mic ready — neeche type karke send karein';
    msgInput.focus();
    return;
  }
  const rec = new SR();
  rec.lang = 'hi-IN';
  micToggleBtn.classList.add('listening');
  micToggleBtn.textContent = '⏹️ Listening...';
  voiceStatusText.textContent = '🎙️ Sun raha hu... boliye';
  rec.onresult = (ev) => {
    const spoken = ev.results[0][0].transcript;
    if (spoken) sendChat(spoken);
  };
  rec.onerror = () => { voiceStatusText.textContent = '🎙️ Mic dabakar bolein ya type karein'; };
  rec.onend = () => {
    micToggleBtn.classList.remove('listening');
    micToggleBtn.textContent = '🎙️ Speak';
    voiceStatusText.textContent = '🎤 Voice Mic Ready';
  };
  rec.start();
});

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
  if (!girlModeUnlocked) { subModal.classList.remove('hidden'); return; }
  genderFilter = genderFilter === 'girl' ? 'any' : 'girl';
  syncGirlLockUI();
  appendSys(genderFilter === 'girl' ? 'Girl Mode ON — sirf girl profiles match hongi.' : 'Random mode ON — koi bhi aa sakta hai.');
}

girlModeLockBtn.addEventListener('click', handleGirlLockClick);
chatGirlLockBtn.addEventListener('click', handleGirlLockClick);
document.getElementById('navUnlockGirl').addEventListener('click', () => { navDrawer.classList.add('hidden'); handleGirlLockClick(); });

activateSubBtn.addEventListener('click', () => {
  girlModeUnlocked = true; genderFilter = 'girl';
  subModal.classList.add('hidden'); syncGirlLockUI();
  appendSys('Subscription active! Girl Mode unlock ho gaya.');
});
closeSubBtn.addEventListener('click', () => { genderFilter = 'any'; subModal.classList.add('hidden'); syncGirlLockUI(); });

menuToggle.addEventListener('click', () => navDrawer.classList.toggle('hidden'));
document.addEventListener('click', (e) => { if (!navDrawer.contains(e.target) && e.target !== menuToggle) navDrawer.classList.add('hidden'); });

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
  stopLocalCam();
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
  if (image) { const img = document.createElement('img'); img.src = image; bub.appendChild(img); }
  if (text) { const sp = document.createElement('span'); sp.textContent = text; bub.appendChild(sp); }
  row.appendChild(bub);
  chatStream.appendChild(row);
  chatStream.scrollTop = chatStream.scrollHeight;
  if (!isSelf && text && mode === 'voice' && 'speechSynthesis' in window) {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'hi-IN';
    window.speechSynthesis.speak(u);
  }
}

function triggerMatch() {
  const username = nickInput.value.trim() || 'Stranger';
  const activeGender = girlModeUnlocked ? genderFilter : 'any';
  session = { active: true, isPrivate: false, partnerName: '', roomCode: '', username };
  appendSys(`${mode.toUpperCase()} mode matching...`);
  if (!socket.connected) socket.connect();
  socket.emit('joinRandom', { username, mood, genderFilter: activeGender, mode });
}

function openRandomLobby() {
  showChatScreen(emptyHeading.textContent, '10k+ people live • 9k love — no signup', true);
  showWelcomeNotice();
  applyModeUI(mode);
}

mainStartBtn.addEventListener('click', () => { openRandomLobby(); triggerMatch(); });
startChatNowBtn.addEventListener('click', triggerMatch);

nextBtn.addEventListener('click', () => {
  if (session.isPrivate) { appendSys('Private room mein Next active nahi hai.'); return; }
  showChatScreen(emptyHeading.textContent, 'Matching next person...', false);
  triggerMatch();
});

joinRoomBtn.addEventListener('click', () => {
  const username = nickInput.value.trim() || 'Guest';
  const code = (roomCodeField.value.trim() || 'ROOM' + Math.floor(100 + Math.random() * 900)).toUpperCase();
  session = { active: true, isPrivate: true, partnerName: `Room: ${code}`, roomCode: code, username };
  showChatScreen(`Room: ${code}`, 'Share room code with friends', false);
  applyModeUI(mode);
  appendSys(`Joined room ${code}`);
  if (!socket.connected) socket.connect();
  socket.emit('joinPrivate', { username, roomCode: code });
});

exitChatBtn.addEventListener('click', () => { session.active = false; socket.emit('leaveChat'); showLanding(); });
homeBrand.addEventListener('click', (e) => { e.preventDefault(); showLanding(); });
document.getElementById('navTextChat').addEventListener('click', () => { applyModeUI('text'); openRandomLobby(); });
document.getElementById('navVoiceChat').addEventListener('click', () => { applyModeUI('voice'); openRandomLobby(); });
document.getElementById('navVideoChat').addEventListener('click', () => { applyModeUI('video'); openRandomLobby(); });
document.getElementById('navPrivateRoom').addEventListener('click', () => {
  const code = (roomCodeField.value.trim() || 'DOST123').toUpperCase();
  session = { active: true, isPrivate: true, partnerName: `Room: ${code}`, roomCode: code, username: nickInput.value.trim() || 'Guest' };
  showChatScreen(`Room: ${code}`, 'Private friend room', false);
  applyModeUI(mode);
  if (!socket.connected) socket.connect();
  socket.emit('joinPrivate', { username: session.username, roomCode: code });
});
document.getElementById('fRandom').addEventListener('click', (e) => { e.preventDefault(); openRandomLobby(); });
document.getElementById('fRoom').addEventListener('click', (e) => { e.preventDefault(); roomCodeField.focus(); });

function sendChat(text, image = null) {
  if (!session.active) triggerMatch();
  const payload = {
    message: text, image, mode,
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

msgInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); composerForm.dispatchEvent(new Event('submit')); }
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
  setPartnerFace(partnerName);
  appendSys(isPrivate ? partnerName : `Connected with ${partnerName}`);
});

socket.on('receiveMessage', ({ sender, message, image, isSelf }) => appendMsg(sender, message, isSelf, image));
socket.on('systemMessage', (m) => appendSys(m));
socket.on('partnerTyping', (t) => { if (t) appendSys('typing...'); });
socket.on('partnerLeft', (m) => { session.active = false; appendSys(`${m} Hit Next for a new chat.`); });

syncGirlLockUI();
