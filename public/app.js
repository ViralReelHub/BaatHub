const socket = io({ reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 1000 });

const lobbySection = document.getElementById('lobbySection');
const chatSection = document.getElementById('chatSection');
const usernameInput = document.getElementById('usernameInput');
const roomCodeInput = document.getElementById('roomCodeInput');
const randomChatBtn = document.getElementById('randomChatBtn');
const privateChatBtn = document.getElementById('privateChatBtn');

const headerAvatar = document.getElementById('headerAvatar');
const chatTitle = document.getElementById('chatTitle');
const typingStatus = document.getElementById('typingStatus');
const messagesContainer = document.getElementById('messagesContainer');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const photoBtn = document.getElementById('photoBtn');
const imageInput = document.getElementById('imageInput');
const diceBtn = document.getElementById('diceBtn');

const copyRoomBtn = document.getElementById('copyRoomBtn');
const nextStrangerBtn = document.getElementById('nextStrangerBtn');
const leaveChatBtn = document.getElementById('leaveChatBtn');
const onlineCountText = document.getElementById('onlineCountText');

const vipBtn = document.getElementById('vipBtn');
const vipModal = document.getElementById('vipModal');
const closeVipBtn = document.getElementById('closeVipBtn');
const payVipBtn = document.getElementById('payVipBtn');

let selectedMood = 'Any';
let currentRoomCode = '';
let typingTimeout;
let session = { active: false, isPrivate: false, partnerName: '', roomCode: '', mood: 'Any', username: 'Stranger' };

function setInputEnabled(on) {
  messageInput.disabled = !on;
  diceBtn.disabled = !on;
  photoBtn.disabled = !on;
  messageInput.placeholder = on ? 'Message...' : 'Chat khatam — Next dabayein';
}

document.querySelectorAll('.mood-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.mood-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    selectedMood = chip.getAttribute('data-mood');
  });
});

socket.on('onlineCount', count => { if (onlineCountText) onlineCountText.textContent = `${count} Online`; });

function addMessage(sender, text, isSelf, image) {
  const row = document.createElement('div');
  row.className = `msg-row ${isSelf ? 'self' : 'other'}`;

  if (!isSelf) {
    const dp = document.createElement('div');
    dp.className = 'mini-dp';
    dp.textContent = (sender || '?').charAt(0).toUpperCase();
    row.appendChild(dp);
  }

  const bubble = document.createElement('div');
  bubble.className = 'bubble';

  if (image) {
    const img = document.createElement('img');
    img.src = image;
    bubble.appendChild(img);
  }
  if (text) {
    const span = document.createElement('span');
    span.textContent = text;
    bubble.appendChild(span);
  }

  row.appendChild(bubble);
  messagesContainer.appendChild(row);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function addSystemMessage(text) {
  const div = document.createElement('div');
  div.className = 'system-msg';
  div.textContent = text;
  messagesContainer.appendChild(div);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function openChat(title, isPrivate) {
  lobbySection.classList.add('hidden');
  chatSection.classList.remove('hidden');
  chatTitle.textContent = title;
  headerAvatar.textContent = title.charAt(0).toUpperCase();
  typingStatus.textContent = '';
  messagesContainer.innerHTML = '';
  setInputEnabled(true);
  copyRoomBtn.classList.toggle('hidden', !isPrivate);
  nextStrangerBtn.classList.toggle('hidden', isPrivate);
}

function startRandom() {
  const username = usernameInput.value.trim() || 'Stranger';
  session = { active: true, isPrivate: false, partnerName: '', roomCode: '', mood: selectedMood, username };
  openChat('Searching...', false);
  addSystemMessage('Kisi mast insaan se connect ho raha hai...');
  if (!socket.connected) socket.connect();
  socket.emit('joinRandom', { username, mood: selectedMood });
}

randomChatBtn.addEventListener('click', startRandom);
nextStrangerBtn.addEventListener('click', startRandom);

privateChatBtn.addEventListener('click', () => {
  const username = usernameInput.value.trim() || 'Guest';
  const code = roomCodeInput.value.trim().toUpperCase() || 'DOST' + Math.floor(100 + Math.random() * 900);
  currentRoomCode = code;
  session = { active: true, isPrivate: true, partnerName: `Room: ${code}`, roomCode: code, mood: selectedMood, username };
  openChat(`Room: ${code}`, true);
  addSystemMessage(`Room code "${code}" doston ko share karein!`);
  if (!socket.connected) socket.connect();
  socket.emit('joinPrivate', { username, roomCode: code });
});

copyRoomBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(currentRoomCode);
  copyRoomBtn.textContent = 'Copied!';
  setTimeout(() => (copyRoomBtn.textContent = 'Copy'), 1500);
});

leaveChatBtn.addEventListener('click', () => {
  session.active = false;
  socket.emit('leaveChat');
  chatSection.classList.add('hidden');
  lobbySection.classList.remove('hidden');
});

function sendPayload(text, image = null) {
  if (!session.active) return;
  const payload = {
    message: text,
    image,
    partnerName: session.partnerName,
    isPrivate: session.isPrivate,
    roomCode: session.roomCode,
    mood: session.mood,
    username: session.username
  };
  if (socket.connected) socket.emit('sendMessage', payload);
  else {
    socket.connect();
    socket.once('connect', () => socket.emit('sendMessage', payload));
  }
}

// Photo Share (Auto-compressed for fast mobile chat)
photoBtn.addEventListener('click', () => { if (!messageInput.disabled) imageInput.click(); });
imageInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 550 / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      sendPayload('', canvas.toDataURL('image/jpeg', 0.72));
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
  imageInput.value = '';
});

const icebreakers = [
  '🎲 Truth: Apne crush ka pehla letter batao 😉',
  '🎲 Truth: Phone gallery ki sabse aakhri photo kiski hai?',
  '🎲 Dare: Apne naam ka ulta likh kar bhejo!',
  '🎲 Truth: Aaj tak ka sabse bada jhooth jo ghar par bola ho?',
  '🎲 Dare: Apni battery percentage aur last played song batao!'
];

diceBtn.addEventListener('click', () => {
  if (messageInput.disabled) return;
  sendPayload(icebreakers[Math.floor(Math.random() * icebreakers.length)]);
});

messageForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (messageInput.disabled) return;
  const msg = messageInput.value.trim();
  if (!msg) return;
  sendPayload(msg);
  if (socket.connected) socket.emit('typing', false);
  messageInput.value = '';
});

messageInput.addEventListener('input', () => {
  if (!socket.connected || messageInput.disabled) return;
  socket.emit('typing', true);
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => { if (socket.connected) socket.emit('typing', false); }, 1000);
});

socket.on('chatStarted', ({ partnerName, isPrivate }) => {
  session.active = true;
  session.partnerName = partnerName;
  session.isPrivate = Boolean(isPrivate);
  messagesContainer.innerHTML = '';
  chatTitle.textContent = partnerName;
  headerAvatar.textContent = partnerName.charAt(0).toUpperCase();
  setInputEnabled(true);
});

socket.on('receiveMessage', ({ sender, message, image, isSelf }) => addMessage(sender, message, isSelf, image));
socket.on('systemMessage', msg => addSystemMessage(msg));
socket.on('partnerTyping', isT => { typingStatus.textContent = isT ? 'typing...' : ''; });
socket.on('partnerLeft', msg => {
  session.active = false;
  typingStatus.textContent = '';
  setInputEnabled(false);
  addSystemMessage(msg + ' Naye partner ke liye "Next" dabayein.');
});

vipBtn.addEventListener('click', () => vipModal.classList.remove('hidden'));
closeVipBtn.addEventListener('click', () => vipModal.classList.add('hidden'));
payVipBtn.addEventListener('click', () => alert('Razorpay payment link yahan lagayein!'));

