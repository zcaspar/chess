import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../hooks/useAuth';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  roomCode: string | null;
  assignedColor: 'white' | 'black' | 'spectator' | null;
  players: {
    white: { id: string; username: string } | null;
    black: { id: string; username: string } | null;
  };
  createRoom: (timeControl?: { initial: number; increment: number }) => void;
  joinRoom: (roomCode: string) => void;
  makeMove: (from: string, to: string, promotion?: string) => void;
  resign: () => void;
  offerDraw: () => void;
  acceptDraw: () => void;
  declineDraw: () => void;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

interface SocketProviderProps {
  children: ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [assignedColor, setAssignedColor] = useState<'white' | 'black' | 'spectator' | null>(null);
  const [players, setPlayers] = useState<{
    white: { id: string; username: string } | null;
    black: { id: string; username: string } | null;
  }>({ white: null, black: null });
  
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    // Initialize socket connection
    const socketInstance = io(process.env.REACT_APP_BACKEND_URL || 'http://localhost:3005', {
      autoConnect: false,
      transports: ['polling', 'websocket'], // Use polling first for Railway compatibility
      withCredentials: true,
      upgrade: true,
      forceNew: true,
      timeout: 20000,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    // Connect and authenticate
    const connectSocket = async () => {
      try {
        const token = await user.getIdToken();
        
        socketInstance.connect();
        
        socketInstance.on('connect', () => {
          console.log('Socket connected');
          setIsConnected(true);
          
          // Authenticate with Firebase token
          socketInstance.emit('authenticate', token);
        });

        socketInstance.on('authenticated', (data) => {
          if (data.success) {
            console.log('Socket authenticated successfully');
          } else {
            console.error('Socket authentication failed:', data.error);
            socketInstance.disconnect();
          }
        });

        socketInstance.on('disconnect', () => {
          console.log('Socket disconnected');
          setIsConnected(false);
        });

        // Room events
        socketInstance.on('roomCreated', (data) => {
          console.log('Room created:', data);
          setRoomCode(data.roomCode);
          // Copy share link to clipboard
          if (navigator.clipboard) {
            navigator.clipboard.writeText(data.shareLink);
          }
        });

        socketInstance.on('roomJoined', (data) => {
          console.log('Room joined:', data);
          setRoomCode(data.roomCode);
          setAssignedColor(data.assignedColor);
          setPlayers(data.players);
        });

        socketInstance.on('playerJoined', (data) => {
          console.log('Player joined:', data);
          setPlayers(prev => ({
            ...prev,
            [data.color]: data.player,
          }));
        });

        socketInstance.on('gameStarted', (data) => {
          console.log('Game started:', data);
          setPlayers({
            white: data.white,
            black: data.black,
          });
        });

        socketInstance.on('playerDisconnected', (data) => {
          console.log('Player disconnected:', data);
          // TODO: Show reconnection timer
        });

        socketInstance.on('error', (data) => {
          console.error('Socket error:', data);
          // TODO: Show error to user
        });

        // Handle room creation response
        socketInstance.on('roomCreated', (data) => {
          console.log('Room created successfully:', data);
        });

        socketInstance.on('roomError', (data) => {
          console.error('Room creation failed:', data);
        });

        // Additional error handlers for debugging
        socketInstance.on('connect_error', (error) => {
          console.error('Socket connection error:', error.message);
          console.error('Error type:', error.type);
          console.error('Error details:', error);
        });

        socketInstance.on('connect_timeout', () => {
          console.error('Socket connection timeout');
        });

        socketInstance.on('upgrade', () => {
          console.log('Socket upgraded to WebSocket');
        });

        socketInstance.on('upgradeError', (error) => {
          console.warn('Socket upgrade failed, staying on polling:', error);
        });
      } catch (error) {
        console.error('Failed to connect socket:', error);
      }
    };

    connectSocket();
    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [user]);

  const createRoom = (timeControl?: { initial: number; increment: number }) => {
    if (socket && isConnected) {
      socket.emit('createRoom', { timeControl });
    }
  };

  const joinRoom = (code: string) => {
    if (socket && isConnected) {
      socket.emit('joinRoom', code);
    }
  };

  const makeMove = (from: string, to: string, promotion?: string) => {
    if (socket && isConnected && roomCode) {
      socket.emit('makeMove', { from, to, promotion });
    }
  };

  const resign = () => {
    if (socket && isConnected && roomCode) {
      socket.emit('resign');
    }
  };

  const offerDraw = () => {
    if (socket && isConnected && roomCode) {
      socket.emit('offerDraw');
    }
  };

  const acceptDraw = () => {
    if (socket && isConnected && roomCode) {
      socket.emit('acceptDraw');
    }
  };

  const declineDraw = () => {
    if (socket && isConnected && roomCode) {
      socket.emit('declineDraw');
    }
  };

  const value: SocketContextType = {
    socket,
    isConnected,
    roomCode,
    assignedColor,
    players,
    createRoom,
    joinRoom,
    makeMove,
    resign,
    offerDraw,
    acceptDraw,
    declineDraw,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};