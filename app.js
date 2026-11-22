const socket = io();

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

const nextStrangerBtn = document.getElementById('nextStrangerBtn');
const copyRoomBtn = document.getElementById('copyRoomBtn');
const leaveChatBtn = document.getElementById('leaveChatBtn');

// VIP Modal elements
const vipModal = document.getElementById('vipModal');
document.getElementById('vipBtn').onclick = () => vipModal.classList.remove('hidden');
document.getElementById('closeVipBtn').onclick = () => vipModal.classList.add('hidden');
document.getElementById('payVipBtn').onclick = () => {
  alert('Yahan aap apna Razorpay Payment Link jodein!');
};

let currentRoomCode = '';
let typingTimeout;

// Random Stranger Chat shuru karein
randomChatBtn.addEventListener('click', () => {
  openChatScreen();
  socket.emit('find_stranger', usernameInput.value);
});

// Private Friend Room join karein
privateChatBtn.addEventListener('click', () => {
  const code = roomCodeInput.value.trim();
  if (!code) {
    alert('Pehle koi Room Code likhein (jaise: DOST123)');
    return;
  }
  openChatScreen();
  socket.emit('join_private', {
    username: usernameInput.value,
    roomCode: code
  });
});

// Next Stranger dhoondhein
nextStrangerBtn.addEventListener('click', () => {
  messagesContainer.innerHTML = '';
  typingStatus.textContent = '';
  socket.emit('find_stranger', usernameInput.value);
});

// Room Code copy karein taaki dost ko WhatsApp par bhej sakein
copyRoomBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(currentRoomCode);
  alert(`Room Code "${currentRoomCode}" copy ho gaya! Apne dost ko bhejein.`);
});

// Chat chhodkar lobby mein wapas jayein
leaveChatBtn.addEventListener('click', () => {
  socket.emit('leave_chat');
  chatSection.classList.add('hidden');
  lobbySection.classList.remove('hidden');
  messagesContainer.innerHTML = '';
});

// Message bhejna
messageForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;
  socket.emit('send_message', text);
  socket.emit('typing', false);
  messageInput.value = '';
});

// Typing indicator bhejna
messageInput.addEventListener('input', () => {
  socket.emit('typing', true);
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => socket.emit('typing', false), 1000);
});

// Server Events
socket.on('waiting_stranger', () => {
  chatTitle.textContent = 'Kisi online vyakti ko dhoondha ja raha hai...';
  nextStrangerBtn.classList.add('hidden');
  copyRoomBtn.classList.add('hidden');
  addSystemMessage('Intezar karein, jaise hi koi aur online aayega aap connect ho jayenge.');
});

socket.on('chat_started', (data) => {
  messagesContainer.innerHTML = '';
  if (data.mode === 'stranger') {
    chatTitle.textContent = `Connected: ${data.partnerName}`;
    nextStrangerBtn.classList.remove('hidden');
    copyRoomBtn.classList.add('hidden');
    addSystemMessage(`Aap ${data.partnerName} se jud gaye hain. Say Hi!`);
  } else {
    currentRoomCode = data.roomCode;
    chatTitle.textContent = `Private Room: ${data.roomCode}`;
    nextStrangerBtn.classList.add('hidden');
    copyRoomBtn.classList.remove('hidden');
    addSystemMessage(`Room "${data.roomCode}" ready hai. Code share karke doston ko bulayein.`);
  }
});

socket.on('receive_message', (msg) => {
  const isMine = msg.senderId === socket.id;
  const div = document.createElement('div');
  div.className = `msg ${isMine ? 'mine' : 'theirs'}`;

  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = `${isMine ? 'Aap' : msg.senderName} • ${msg.time}`;

  const body = document.createElement('div');
  body.textContent = msg.text; // Safe text rendering (XSS se bachav)

  div.appendChild(meta);
  div.appendChild(body);
  messagesContainer.appendChild(div);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
});

socket.on('partner_typing', ({ username, isTyping }) => {
  typingStatus.textContent = isTyping ? `${username} likh raha hai...` : '';
});

socket.on('system_message', (text) => {
  addSystemMessage(text);
});

socket.on('partner_left', (text) => {
  typingStatus.textContent = '';
  addSystemMessage(text);
});

function openChatScreen() {
  lobbySection.classList.add('hidden');
  chatSection.classList.remove('hidden');
}

function addSystemMessage(text) {
  const div = document.createElement('div');
  div.className = 'sys-msg';
  div.textContent = text;
  messagesContainer.appendChild(div);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}
