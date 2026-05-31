import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '../hooks/useAuth';
import { logger } from '../utils/logger';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  roomCode: string | null;
  assignedColor: 'white' | 'black' | 'spectator' | null;
  players: {
    white: { id: string; username: string; displayName?: string } | null;
    black: { id: string; username: string; displayName?: string } | null;
  };
  gameState: {
    fen: string;
    pgn: string;
    turn: 'w' | 'b';
    isGameOver: boolean;
    whiteTime: number;
    blackTime: number;
    timeControl: { initial: number; increment: number } | null;
  } | null;
  createRoom: (timeControl?: { initial: number; increment: number }) => void;
  joinRoom: (roomCode: string) => void;
  makeMove: (from: string, to: string, promotion?: string) => void;
  resign: () => void;
  offerDraw: () => void;
  acceptDraw: () => void;
  declineDraw: () => void;
  leaveRoom: () => void;
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
    white: { id: string; username: string; displayName?: string } | null;
    black: { id: string; username: string; displayName?: string } | null;
  }>({ white: null, black: null });
  
  const [gameState, setGameState] = useState<{
    fen: string;
    pgn: string;
    turn: 'w' | 'b';
    isGameOver: boolean;
    whiteTime: number;
    blackTime: number;
    timeControl: { initial: number; increment: number } | null;
  } | null>(null);
  
  const { user, profile } = useAuth();

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
          logger.debug('Socket connected');
          setIsConnected(true);
          
          // Authenticate with Firebase token
          socketInstance.emit('authenticate', token);
        });

        socketInstance.on('authenticated', (data) => {
          if (data.success) {
            logger.debug('Socket authenticated successfully');
          } else {
            logger.error('Socket authentication failed:', data.error);
            socketInstance.disconnect();
          }
        });

        socketInstance.on('disconnect', () => {
          logger.debug('Socket disconnected');
          setIsConnected(false);
        });

        // Room events
        socketInstance.on('roomCreated', (data) => {
          logger.debug('Room created:', data);
          setRoomCode(data.roomCode);
          // Copy share link to clipboard
          if (navigator.clipboard) {
            navigator.clipboard.writeText(data.shareLink);
          }
        });

        socketInstance.on('roomJoined', (data) => {
          logger.debug('Room joined:', data);
          setRoomCode(data.roomCode);
          setAssignedColor(data.assignedColor);
          setPlayers(data.players);
          
          // Initialize game state
          setGameState({
            fen: data.gameState.fen,
            pgn: data.gameState.pgn,
            turn: data.gameState.turn,
            isGameOver: data.gameState.isGameOver,
            whiteTime: data.whiteTime,
            blackTime: data.blackTime,
            timeControl: data.timeControl,
          });
          
          // Broadcast room joined event to GameContext
          window.dispatchEvent(new CustomEvent('socketRoomJoined', { detail: data }));
        });

        socketInstance.on('playerJoined', (data) => {
          logger.debug('Player joined:', data);
          setPlayers(prev => ({
            ...prev,
            [data.color]: data.player,
          }));
        });

        socketInstance.on('gameStarted', (data) => {
          logger.debug('Game started:', data);
          setPlayers({
            white: data.white,
            black: data.black,
          });
          // Broadcast to GameContext to update player names
          window.dispatchEvent(new CustomEvent('socketGameStarted', { detail: data }));
        });

        socketInstance.on('playerDisconnected', (data) => {
          logger.debug('Player disconnected:', data);
          // TODO: Show reconnection timer
        });

        socketInstance.on('error', (data) => {
          logger.error('Socket error:', data);
          
          // Reset room state on room not found error
          if (data.code === 'ROOM_NOT_FOUND') {
            setRoomCode(null);
            setAssignedColor(null);
            setPlayers({ white: null, black: null });
          }
          
          // Broadcast error to components via custom event
          window.dispatchEvent(new CustomEvent('socketError', { detail: data }));
          
          // Notify user of error (you might want to use a toast library here)
          if (data.message) {
            alert(`Error: ${data.message}`);
          }
        });

        // Handle room creation response
        socketInstance.on('roomCreated', (data) => {
          logger.debug('Room created successfully:', data);
        });

        socketInstance.on('roomError', (data) => {
          logger.error('Room creation failed:', data);
        });

        // Additional error handlers for debugging
        socketInstance.on('connect_error', (error) => {
          const errType = (error as Error & { type?: string }).type;
          logger.error('Socket connection error:', error.message);
          logger.error('Error type:', errType);
          logger.error('Error details:', error);
        });

        socketInstance.on('connect_timeout', () => {
          logger.error('Socket connection timeout');
        });

        socketInstance.on('upgrade', () => {
          logger.debug('Socket upgraded to WebSocket');
        });

        socketInstance.on('upgradeError', (error) => {
          logger.warn('Socket upgrade failed, staying on polling:', error);
        });

        // Game events
        socketInstance.on('moveMade', (data) => {
          logger.debug('Move made:', data);
          
          // Update game state with timer information
          setGameState(prev => prev ? {
            ...prev,
            fen: data.fen,
            pgn: data.pgn,
            turn: data.turn,
            whiteTime: data.whiteTime,
            blackTime: data.blackTime,
          } : null);
          
          // Broadcast to GameContext or other components via custom event
          window.dispatchEvent(new CustomEvent('socketMoveMade', { detail: data }));
        });

        socketInstance.on('gameEnded', (data) => {
          logger.debug('Game ended:', data);
          
          // Update game state to mark as over
          setGameState(prev => prev ? {
            ...prev,
            isGameOver: true,
          } : null);
          
          // Broadcast to GameContext or other components via custom event
          window.dispatchEvent(new CustomEvent('socketGameEnded', { detail: data }));
        });

        socketInstance.on('drawOffered', (data: { by: 'w' | 'b' }) => {
          logger.debug('Draw offered by:', data?.by);
          // Broadcast to GameContext or other components via custom event
          window.dispatchEvent(new CustomEvent('socketDrawOffered', { detail: data }));
        });

        socketInstance.on('drawOfferSent', (data: { by: 'w' | 'b' }) => {
          logger.debug('Draw offer sent confirmation:', data?.by);
          // Broadcast to GameContext - confirms your draw offer was sent
          window.dispatchEvent(new CustomEvent('socketDrawOfferSent', { detail: data }));
        });

        socketInstance.on('drawDeclined', () => {
          logger.debug('Draw declined');
          // Broadcast to GameContext - draw offer was declined
          window.dispatchEvent(new CustomEvent('socketDrawDeclined'));
        });

        socketInstance.on('gameRestored', (data) => {
          logger.debug('Game restored:', data);
          // Broadcast to GameContext or other components via custom event
          window.dispatchEvent(new CustomEvent('socketGameRestored', { detail: data }));
        });

        socketInstance.on('timerUpdate', (data) => {
          logger.debug('Timer update:', data);
          
          // Update game state with timer information
          setGameState(prev => prev ? {
            ...prev,
            whiteTime: data.whiteTime,
            blackTime: data.blackTime,
            turn: data.turn,
          } : null);
          
          // Broadcast to GameContext or other components via custom event
          window.dispatchEvent(new CustomEvent('socketTimerUpdate', { detail: data }));
        });
      } catch (error) {
        logger.error('Failed to connect socket:', error);
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
      // Pass display name to server for player identification
      const displayName = profile?.displayName || profile?.username || user?.displayName || 'Player';
      socket.emit('createRoom', { timeControl, displayName });
    }
  };

  const joinRoom = (code: string) => {
    if (socket && isConnected) {
      // Pass display name to server for player identification
      const displayName = profile?.displayName || profile?.username || user?.displayName || 'Player';
      socket.emit('joinRoom', { roomCode: code, displayName });
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
    logger.debug('[SocketContext] offerDraw called', { socket: !!socket, isConnected, roomCode });
    if (socket && isConnected && roomCode) {
      logger.debug('[SocketContext] Emitting offerDraw event');
      socket.emit('offerDraw');
    } else {
      logger.debug('[SocketContext] Cannot emit offerDraw - missing socket, connection, or roomCode');
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

  const leaveRoom = () => {
    if (socket && isConnected && roomCode) {
      socket.emit('leaveRoom', roomCode);
      
      // Reset local state
      setRoomCode(null);
      setAssignedColor(null);
      setPlayers({ white: null, black: null });
      
      logger.debug('Left room:', roomCode);
    }
  };

  const value: SocketContextType = {
    socket,
    isConnected,
    roomCode,
    assignedColor,
    players,
    gameState,
    createRoom,
    joinRoom,
    makeMove,
    resign,
    offerDraw,
    acceptDraw,
    declineDraw,
    leaveRoom,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
};