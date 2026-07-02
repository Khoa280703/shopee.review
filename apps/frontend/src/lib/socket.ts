import { io, type Socket } from 'socket.io-client';

// One Socket.io connection per browser tab (singleton). Reused across routes
// and components so we never open multiple sockets per user.
let socket: Socket | null = null;

function wsBaseUrl(): string {
  const api = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3066/api';
  // Strip a trailing /api to reach the Socket.io server root.
  return api.replace(/\/api\/?$/, '');
}

export function getSocket(): Socket {
  if (socket) return socket;
  socket = io(wsBaseUrl(), {
    // Cookie-based auth isn't readable in JS; connect anonymously for read-only
    // live updates. Server still broadcasts to anonymous room members.
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    autoConnect: true,
  });
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
