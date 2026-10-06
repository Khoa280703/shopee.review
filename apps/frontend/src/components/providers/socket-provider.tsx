'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { getSocket } from '@/lib/socket';

const SocketContext = createContext<Socket | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    // Browser-only: hand out the shared socket instance to consumers via
    // context. This does NOT open the connection — `getSocket()` only
    // constructs it with `autoConnect: false` (FE audit P1). A page like the
    // home feed that never calls `acquireSocket()` (via useCommentSocket)
    // never opens a WS/polling connection at all.
    setSocket(getSocket());
  }, []);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}

export function useSocket(): Socket | null {
  return useContext(SocketContext);
}
