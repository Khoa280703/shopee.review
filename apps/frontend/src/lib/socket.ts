import { io, type Socket } from 'socket.io-client';

// One Socket.io connection per browser tab (singleton). Reused across routes
// and components so we never open multiple sockets per user.
let socket: Socket | null = null;

// Same-origin connection: nginx (prod) and the Next dev rewrite proxy /socket.io
// to the backend, so no absolute host is baked into the bundle. `io()` with no
// URL connects to the page's own origin.
export function getSocket(): Socket {
  if (socket) return socket;
  socket = io({
    // Cookie-based auth isn't readable in JS; connect anonymously for read-only
    // live updates. Server still broadcasts to anonymous room members.
    // Include 'polling' so realtime survives environments without a WS upgrade
    // (the Next dev rewrite, restrictive proxies) — Socket.io upgrades to WS
    // when available.
    transports: ['websocket', 'polling'],
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
