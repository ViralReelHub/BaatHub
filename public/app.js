const socket = io({
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000
});

// Touch & Layer Fix
(function fixChatTouchLayer() {
  const style = document.createElement('style');
  style.textContent = `
    .chat-box, .message-form, #messageInput, .message-form button {
      position: relative;
      z-index: 25;
    }
    .ad-banner {
      overflow: hidden;
      z-index: 1;
    }
  `;
  document.head.appendChild(style);
})();

// Elements
const lobbySection = document.getElementById('lobbySection');
const chatSection = document.getElementById('chatSection');
const usernameInput = document.getElementById('usernameInput');
const roomCodeInput = document.getElementById('roomCodeInput');
const randomChatBtn = document.getElementById('randomChatBtn');
const privateChatBtn = document.getElementById('privateChatBtn');

const chatTitle = document.getElementById('chatTitle');
const typingStatus = document.getElementById('typingStatus');
const messagesContainer = document.getElementById('messagesContainer');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const diceBtn = document.getElementById('diceBtn');

const copyRoomBtn = document.getElementById('copyRoomBtn');
const nextStrangerBtn = document.getElementById('nextStrangerBtn');
const leaveChatBtn = document.getElementById('leaveChatBtn');
const onlineCountText = document.getElementById('onlineCountText');

// VIP Modal Elements
const vipBtn = document.getElementById('vipBtn');
const vipModal = document.getElementById('vipModal');
const closeVipBtn = document.getElementById('closeVipBtn');
const payVipBtn = document.getElementById('payVipBtn');

let selectedMood = 'Any';
let currentRoomCode = '';
let typingTimeout;
let currentSession = {
  active: false,
  isPrivate: false,
  partnerName: '',
  roomCode: '',
  mood: 'Any',
  username: 'Stranger'
};

// WhatsApp-style Pop Sound
function playPopSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(620, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(920, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.09);
  } catch (e) {}
}

function setChatInputEnabled(enabled, customPlaceholder) {
  if (messageInput) {
    messageInput.disabled = !enabled;
    messageInput.placeholder = customPlaceholder || (enabled ? 'Apna message likhein...' : 'Chat khatam — naye partner ke liye "Next" dabayein');
  }
  if (diceBtn) {
    diceBtn.disabled = !enabled;
  }
}

// Mood Chips Selection
document.querySelectorAll('.mood-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.mood-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    selectedMood = chip.getAttribute('data-mood');
  });
});

// Live Online Counter
socket.on('onlineCount', (count) => {
  if (onlineCountText) {
    onlineCountText.textContent = `${count} Online`;
  }
});

// Helper: Add Message to Screen
function addMessage(sender, text, isSelf) {
  const div = document.createElement('div');
  div.className = `msg ${isSelf ? 'self' : 'other'}`;
  div.innerHTML = `<small>${sender}</small><p>${escapeHtml(text)}</p>`;
  messagesContainer.appendChild(div);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function addSystemMessage(text) {
  const div = document.createElement('div');
  div.className = 'system-msg';
  div.textContent = text;
  messagesContainer.appendChild(div);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function escapeHtml(str) {
  const p = document.createElement('p');
  p.textContent = str;
  return p.innerHTML;
}

function openChatScreen(titleText, isPrivate) {
  lobbySection.classList.add('hidden');
  chatSection.classList.remove('hidden');
  chatTitle.textContent = titleText;
  typingStatus.textContent = '';
  messagesContainer.innerHTML = '';
  setChatInputEnabled(true);

  if (isPrivate) {
    copyRoomBtn.classList.remove('hidden');
    nextStrangerBtn.classList.add('hidden');
  } else {
    copyRoomBtn.classList.add('hidden');
    nextStrangerBtn.classList.remove('hidden');
  }
}

// Start Random Chat
function startRandomSearch() {
  const username = usernameInput.value.trim() || 'Stranger';
  currentSession = {
    active: true,
    isPrivate: false,
    partnerName: '',
    roomCode: '',
    mood: selectedMood,
    username
  };
  openChatScreen('Naya partner dhoondh rahe hain...', false);
  addSystemMessage('Kisi mast insaan se connect kiya ja raha hai...');
  if (!socket.connected) socket.connect();
  socket.emit('joinRandom', { username, mood: selectedMood });
}

randomChatBtn.addEventListener('click', startRandomSearch);

nextStrangerBtn.addEventListener('click', () => {
  startRandomSearch();
});

// Start Private Room
privateChatBtn.addEventListener('click', () => {
  const username = usernameInput.value.trim() || 'Guest';
  const code = roomCodeInput.value.trim().toUpperCase() || 'DOST' + Math.floor(100 + Math.random() * 900);
  currentRoomCode = code;
  currentSession = {
    active: true,
    isPrivate: true,
    partnerName: `Room: ${code}`,
    roomCode: code,
    mood: selectedMood,
    username
  };
  openChatScreen(`Room: ${code}`, true);
  addSystemMessage(`Room code "${code}" doston ko share karein!`);
  if (!socket.connected) socket.connect();
  socket.emit('joinPrivate', { username, roomCode: code });
});

copyRoomBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(currentRoomCode);
  copyRoomBtn.textContent = 'Copied!';
  setTimeout(() => (copyRoomBtn.textContent = 'Copy Code'), 1500);
});

leaveChatBtn.addEventListener('click', () => {
  currentSession.active = false;
  socket.emit('leaveChat');
  chatSection.classList.add('hidden');
  lobbySection.classList.remove('hidden');
});

// Transmit Message with Auto-Reconnect Protection
function transmitChatMessage(text) {
  const payload = {
    message: text,
    partnerName: currentSession.partnerName,
    isPrivate: currentSession.isPrivate,
    roomCode: currentSession.roomCode,
    mood: currentSession.mood,
    username: currentSession.username
  };

  if (socket.connected) {
    socket.emit('sendMessage', payload);
  } else {
    socket.connect();
    socket.once('connect', () => {
      socket.emit('sendMessage', payload);
    });
  }
}

// Truth / Dare Icebreaker Button
const icebreakers = [
  '🎲 Truth: Apni phone gallery ki sabse aakhri photo kiski hai? Sach batana!',
  '🎲 Truth: Aaj tak ka sabse bada jhooth jo tumne ghar walon se bola ho?',
  '🎲 Dare: Apne naam ka ulta likh kar bhejo bina backspace dabaye!',
  '🎲 Truth: Kis cheez se sabse zyada darr lagta hai?',
  '🎲 Truth: Agar ₹1 Crore abhi mil jayein toh sabse pehla kaam kya karoge?',
  '🎲 Truth: Apne crush ka pehla letter batao 😉',
  '🎲 Dare: Abhi apni battery percentage aur last played song batao!',
  '🎲 Truth: Koi aisa secret jo tumhare best friend ko bhi nahi pata?',
  '🎲 Dare: Apne keyboard ke pehle 5 suggested words bina soche bhej do!',
  '🎲 Truth: School ya college ka sabse embarrassing moment kaunsa tha?',
  '🎲 Truth: Agar ek din ke liye invisible ho jao toh sabse pehle kya karoge?',
  '🎲 Dare: Abhi bina emoji use kiye apna mood 3 words mein likho!'
];

if (diceBtn) {
  diceBtn.addEventListener('click', () => {
    if (messageInput && messageInput.disabled) return;
    const randomPrompt = icebreakers[Math.floor(Math.random() * icebreakers.length)];
    transmitChatMessage(randomPrompt);
  });
}

// Send Message
messageForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (messageInput && messageInput.disabled) return;
  const msg = messageInput.value.trim();
  if (!msg) return;
  transmitChatMessage(msg);
  if (socket.connected) socket.emit('typing', false);
  messageInput.value = '';
});

messageInput.addEventListener('input', () => {
  if (!socket.connected || messageInput.disabled) return;
  socket.emit('typing', true);
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    if (socket.connected) socket.emit('typing', false);
  }, 1000);
});

// Socket Listeners
socket.on('chatStarted', ({ partnerName, isPrivate }) => {
  currentSession.active = true;
  currentSession.partnerName = partnerName;
  currentSession.isPrivate = Boolean(isPrivate);
  messagesContainer.innerHTML = '';
  chatTitle.textContent = partnerName;
  setChatInputEnabled(true);
  playPopSound();
  if (!isPrivate) {
    addSystemMessage(`Aap ${partnerName} se jud gaye hain! Say Hi 👋`);
  }
});

socket.on('receiveMessage', ({ sender, message, isSelf }) => {
  addMessage(sender, message, isSelf);
  if (!isSelf) {
    playPopSound();
  }
});

socket.on('systemMessage', (msg) => {
  addSystemMessage(msg);
});

socket.on('partnerTyping', (isTyping) => {
  typingStatus.textContent = isTyping ? 'typing...' : '';
});

socket.on('partnerLeft', (msg) => {
  currentSession.active = false;
  typingStatus.textContent = '';
  setChatInputEnabled(false);
  addSystemMessage(msg + ' Naye partner ke liye "Next" dabayein.');
});

// VIP Modal Events
vipBtn.addEventListener('click', () => vipModal.classList.remove('hidden'));
closeVipBtn.addEventListener('click', () => vipModal.classList.add('hidden'));
payVipBtn.addEventListener('click', () => {
  alert('Razorpay payment link banakar yahan lagayein!');
});
