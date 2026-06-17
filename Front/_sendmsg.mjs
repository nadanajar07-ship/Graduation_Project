import { io } from 'socket.io-client';

const TOKEN_B = process.env.TOKEN_B;
const ROOM = process.env.ROOM_ID;
const CONTENT = process.env.CONTENT || 'Hello from automated test (user B)';

const socket = io('http://localhost:3001/chat', {
  auth: { authorization: `Bearer ${TOKEN_B}` },
  transports: ['websocket'],
});

socket.on('connect', () => {
  console.log('B connected:', socket.id);
  socket.emit('join_room', { roomId: ROOM });
  setTimeout(() => {
    socket.emit('send_message', { roomId: ROOM, content: CONTENT });
    console.log('B sent message to', ROOM);
  }, 500);
});
socket.on('message_sent', (d) => { console.log('B message_sent ack:', d?.message?._id); setTimeout(()=>{socket.close();process.exit(0);}, 500); });
socket.on('socket_Error', (e) => console.log('B socket_Error:', e));
socket.on('connect_error', (e) => { console.log('B connect_error:', e.message); process.exit(1); });
setTimeout(() => { console.log('timeout'); process.exit(1); }, 8000);
