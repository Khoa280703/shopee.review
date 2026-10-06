import { io, type Socket } from 'socket.io-client';

// One Socket.io connection per browser tab (singleton). Reused across routes
// and components so we never open multiple sockets per user.
let socket: Socket | null = null;
let activeConsumers = 0;

function createSocket(): Socket {
  // Same-origin connection: nginx (prod) and the Next dev rewrite proxy /socket.io
  // to the backend, so no absolute host is baked into the bundle. `io()` with no
  // URL connects to the page's own origin.
  return io({
    // Cookie-based auth isn't readable in JS; connect anonymously for read-only
    // live updates. Server still broadcasts to anonymous room members.
    // Include 'polling' so realtime survives environments without a WS upgrade
    // (the Next dev rewrite, restrictive proxies) — Socket.io upgrades to WS
    // when available.
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    // Opened on demand via acquireSocket(), not on page load — only a post
    // detail page's live comment thread currently needs this connection, so
    // every anonymous visitor on every other page used to pay for an open WS
    // (or long-polling) connection for nothing (FE audit P1).
    autoConnect: false,
  });
}

/** Returns the shared socket instance, creating it (but NOT connecting it) if
 * needed. Safe to call from anywhere just to get a handle to wire `.on`/`.off`
 * listeners onto — only `acquireSocket`/`releaseSocket` below actually open
 * or close the network connection. */
export function getSocket(): Socket {
  if (!socket) socket = createSocket();
  return socket;
}

/**
 * Reference-counted connect: the Nth consumer to call this while the socket
 * is already open just bumps the count; the last one to call `releaseSocket`
 * actually closes the connection. Lets multiple components on the same page
 * (or re-renders) share one connection without fighting over its lifecycle.
 */
export function acquireSocket(): Socket {
  const s = getSocket();
  activeConsumers += 1;
  if (!s.connected) s.connect();
  return s;
}

export function releaseSocket(): void {
  activeConsumers = Math.max(0, activeConsumers - 1);
  if (activeConsumers === 0) socket?.disconnect();
}

/** Full teardown (app unmount) regardless of outstanding consumers. */
export function disconnectSocket(): void {
  activeConsumers = 0;
  socket?.disconnect();
  socket = null;
}
