const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Store connected users and their socket IDs
const users = new Map();
const rooms = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // User registration
  socket.on('register', (userData) => {
    users.set(socket.id, {
      id: socket.id,
      username: userData.username,
      status: 'online'
    });
    
    // Broadcast updated user list to all clients
    io.emit('users-update', Array.from(users.values()));
    console.log(`User registered: ${userData.username}`);
  });

  // Handle call initiation
  socket.on('call-user', (data) => {
    console.log('📞 SERVER: Received call-user event:', JSON.stringify(data, null, 2));
    const { targetUserId, offer, callerInfo, callType } = data;
    console.log(`📞 SERVER: Call initiated: ${callerInfo.username} -> ${targetUserId}, type: ${callType}`);
    
    const targetSocket = Array.from(users.keys()).find(socketId => 
      users.get(socketId).id === targetUserId
    );

    if (targetSocket) {
      const incomingCallData = {
        offer,
        callerInfo,
        callerId: socket.id,
        callType: callType || 'video' // Make sure to forward the call type
      };
      
      console.log('📞 SERVER: Sending incoming-call event:', JSON.stringify(incomingCallData, null, 2));
      io.to(targetSocket).emit('incoming-call', incomingCallData);
    } else {
      console.log('📞 SERVER: Target user not found:', targetUserId);
    }
  });

  // Handle call answer
  socket.on('answer-call', (data) => {
    const { answer, callerId } = data;
    console.log('📞 SERVER: Call answered, forwarding to:', callerId);
    io.to(callerId).emit('call-answered', { answer });
  });

  // Handle call rejection
  socket.on('reject-call', (data) => {
    const { callerId } = data;
    console.log('📞 SERVER: Call rejected, notifying:', callerId);
    io.to(callerId).emit('call-rejected');
  });

  // Handle ICE candidates
  socket.on('ice-candidate', (data) => {
    const { candidate, targetUserId } = data;
    const targetSocket = Array.from(users.keys()).find(socketId => 
      users.get(socketId).id === targetUserId
    );

    if (targetSocket) {
      io.to(targetSocket).emit('ice-candidate', { candidate, senderId: socket.id });
    }
  });

  // Handle call end
  socket.on('end-call', (data) => {
    const { targetUserId } = data;
    const targetSocket = Array.from(users.keys()).find(socketId => 
      users.get(socketId).id === targetUserId
    );

    if (targetSocket) {
      io.to(targetSocket).emit('call-ended');
    }
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    users.delete(socket.id);
    io.emit('users-update', Array.from(users.values()));
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 