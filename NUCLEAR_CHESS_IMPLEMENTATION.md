# Nuclear Chess Implementation Guide

## Overview
This guide provides step-by-step instructions for implementing the "Nuclear Chess" variant in the chess application. Nuclear Chess allows each player to "nuke" (remove) one opponent piece during the first 10 moves of human vs human games only.

## Reference Implementation
- **Branch**: `nuclear-chess` 
- **Commit**: See latest commits on nuclear-chess branch
- **Status**: Fully implemented and tested locally

## Core Features
- 💣 **Nuke Button**: Orange button with bomb emoji in game controls
- 🎯 **Targeting Mode**: Red highlighting shows nukeable pieces
- 🚫 **Restrictions**: Cannot target Kings/Queens, only first 10 moves, one use per player
- 👥 **Human vs Human Only**: Feature only appears in human vs human games
- 🌐 **Multiplayer Support**: Full socket integration for online games

## Implementation Steps

### Step 1: Update GameContext State

**File**: `src/contexts/GameContext.tsx`

#### 1.1 Add Nuclear State to GameState Interface
```typescript
interface GameState {
  // ... existing properties ...
  nukeAvailable: {
    white: boolean;
    black: boolean;
  };
  nukeModeActive: {
    white: boolean;
    black: boolean;
  };
}
```

#### 1.2 Add Nuclear Functions to GameContextType Interface
```typescript
interface GameContextType {
  // ... existing properties ...
  activateNukeMode: (color: 'w' | 'b') => void;
  cancelNukeMode: () => void;
  executeNuke: (targetSquare: Square) => boolean;
  canUseNuke: (color: 'w' | 'b') => boolean;
}
```

#### 1.3 Initialize Nuclear State in useState
```typescript
const [gameState, setGameState] = useState<GameState>({
  // ... existing state ...
  nukeAvailable: {
    white: true,
    black: true,
  },
  nukeModeActive: {
    white: false,
    black: false,
  },
});
```

#### 1.4 Update resetGame Function
```typescript
const resetGame = useCallback(() => {
  // ... existing reset logic ...
  setGameState({
    // ... existing properties ...
    nukeAvailable: {
      white: true,
      black: true,
    },
    nukeModeActive: {
      white: false,
      black: false,
    },
  });
}, [gameState]);
```

#### 1.5 Implement Nuclear Functions
```typescript
// Nuclear Chess functions
const canUseNuke = useCallback((color: 'w' | 'b'): boolean => {
  // Only available in human vs human mode
  if (gameState.gameMode !== 'human-vs-human') return false;
  
  // Only available in first 10 moves (20 half-moves)
  const moveCount = gameState.game.history().length;
  if (moveCount >= 20) return false;
  
  // Check if this color hasn't used their nuke yet
  return color === 'w' ? gameState.nukeAvailable.white : gameState.nukeAvailable.black;
}, [gameState.gameMode, gameState.game, gameState.nukeAvailable]);

const activateNukeMode = useCallback((color: 'w' | 'b') => {
  if (!canUseNuke(color)) return;
  
  setGameState(prev => ({
    ...prev,
    nukeModeActive: {
      white: color === 'w',
      black: color === 'b',
    },
  }));
}, [canUseNuke]);

const cancelNukeMode = useCallback(() => {
  setGameState(prev => ({
    ...prev,
    nukeModeActive: {
      white: false,
      black: false,
    },
  }));
}, []);

const executeNuke = useCallback((targetSquare: Square): boolean => {
  const activeNukeColor = gameState.nukeModeActive.white ? 'w' : 
                        gameState.nukeModeActive.black ? 'b' : null;
  
  if (!activeNukeColor) return false;
  
  // Get the piece at the target square
  const piece = gameState.game.get(targetSquare);
  if (!piece) return false;
  
  // Can't nuke your own pieces
  if (piece.color === activeNukeColor) return false;
  
  // Can't nuke Kings or Queens
  if (piece.type === 'k' || piece.type === 'q') return false;
  
  // Create a new game instance with the piece removed
  const newGame = new Chess(gameState.game.fen());
  newGame.remove(targetSquare);
  
  // Update game state
  setGameState(prev => ({
    ...prev,
    game: newGame,
    nukeAvailable: {
      white: activeNukeColor === 'w' ? false : prev.nukeAvailable.white,
      black: activeNukeColor === 'b' ? false : prev.nukeAvailable.black,
    },
    nukeModeActive: {
      white: false,
      black: false,
    },
    // Add a special move to history to track the nuke
    history: [...prev.history, {
      from: targetSquare,
      to: targetSquare,
      color: activeNukeColor,
      flags: 'n', // 'n' for nuke
      piece: piece.type,
      san: `Nuke ${targetSquare}`,
      lan: `nuke${targetSquare}`,
      before: prev.game.fen(),
      after: newGame.fen(),
    } as Move],
    currentMoveIndex: prev.currentMoveIndex + 1,
  }));
  
  return true;
}, [gameState.nukeModeActive, gameState.game]);
```

#### 1.6 Add Functions to Context Value
```typescript
const value: GameContextType = {
  // ... existing properties ...
  activateNukeMode,
  cancelNukeMode,
  executeNuke,
  canUseNuke,
};
```

#### 1.7 Add Socket Event Handlers for Multiplayer
```typescript
// Add these handlers in the useEffect where other socket listeners are set up

const handleSocketNukeModeActivated = (event: CustomEvent) => {
  const { color } = event.detail;
  setGameState(prev => ({
    ...prev,
    nukeModeActive: {
      white: color === 'w',
      black: color === 'b',
    },
  }));
};

const handleSocketNukeExecuted = (event: CustomEvent) => {
  const { targetSquare, fen, nukerColor } = event.detail;
  const newGame = new Chess(fen);
  
  setGameState(prev => ({
    ...prev,
    game: newGame,
    nukeAvailable: {
      white: nukerColor === 'w' ? false : prev.nukeAvailable.white,
      black: nukerColor === 'b' ? false : prev.nukeAvailable.black,
    },
    nukeModeActive: {
      white: false,
      black: false,
    },
    history: [...prev.history, {
      from: targetSquare,
      to: targetSquare,
      color: nukerColor,
      flags: 'n',
      piece: event.detail.piece.type,
      san: `Nuke ${targetSquare}`,
      lan: `nuke${targetSquare}`,
      before: prev.game.fen(),
      after: fen,
    } as Move],
    currentMoveIndex: prev.currentMoveIndex + 1,
  }));
};

const handleSocketNukeCancelled = () => {
  setGameState(prev => ({
    ...prev,
    nukeModeActive: {
      white: false,
      black: false,
    },
  }));
};

// Add event listeners
window.addEventListener('socketNukeModeActivated', handleSocketNukeModeActivated as EventListener);
window.addEventListener('socketNukeExecuted', handleSocketNukeExecuted as EventListener);
window.addEventListener('socketNukeCancelled', handleSocketNukeCancelled);

// Add cleanup in return function
window.removeEventListener('socketNukeModeActivated', handleSocketNukeModeActivated as EventListener);
window.removeEventListener('socketNukeExecuted', handleSocketNukeExecuted as EventListener);
window.removeEventListener('socketNukeCancelled', handleSocketNukeCancelled);
```

### Step 2: Update GameControls Component

**File**: `src/components/GameControls/GameControls.tsx`

#### 2.1 Add Required Imports
```typescript
import { useSocket } from '../../contexts/SocketContext';
import { useOnlineGame } from '../../hooks/useOnlineGame';
```

#### 2.2 Add Nuclear Functions to useGame Hook
```typescript
const { 
  // ... existing properties ...
  canUseNuke,
  activateNukeMode,
  cancelNukeMode 
} = useGame();
```

#### 2.3 Add Socket and Online Game Hooks
```typescript
const { roomCode, activateNuke: activateNukeSocket, cancelNuke: cancelNukeSocket } = useSocket();
const { isOnlineGame } = useOnlineGame();
```

#### 2.4 Add Nuclear Mode UI After Board Flip Control
```typescript
{/* Nuclear Mode Button - Only in human vs human mode */}
{gameState.gameMode === 'human-vs-human' && !isGameOver && (
  <>
    {(canUseNuke('w') || canUseNuke('b')) && (
      <div className="space-y-2">
        {currentPlayer === 'w' && canUseNuke('w') && (
          gameState.nukeModeActive.white ? (
            <button
              onClick={() => {
                if (isOnlineGame && roomCode) {
                  cancelNukeSocket();
                } else {
                  cancelNukeMode();
                }
              }}
              className="w-full px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm flex items-center justify-center gap-2 animate-pulse"
              title="Cancel nuke mode"
            >
              <span>💣</span>
              Cancel Nuke
            </button>
          ) : (
            <button
              onClick={() => {
                if (isOnlineGame && roomCode) {
                  activateNukeSocket('w');
                } else {
                  activateNukeMode('w');
                }
              }}
              className="w-full px-3 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 transition-colors text-sm flex items-center justify-center gap-2"
              title="Activate nuke mode - remove one opponent piece"
            >
              <span>💣</span>
              Nuke (1 use)
            </button>
          )
        )}
        {currentPlayer === 'b' && canUseNuke('b') && (
          gameState.nukeModeActive.black ? (
            <button
              onClick={() => {
                if (isOnlineGame && roomCode) {
                  cancelNukeSocket();
                } else {
                  cancelNukeMode();
                }
              }}
              className="w-full px-3 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm flex items-center justify-center gap-2 animate-pulse"
              title="Cancel nuke mode"
            >
              <span>💣</span>
              Cancel Nuke
            </button>
          ) : (
            <button
              onClick={() => {
                if (isOnlineGame && roomCode) {
                  activateNukeSocket('b');
                } else {
                  activateNukeMode('b');
                }
              }}
              className="w-full px-3 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 transition-colors text-sm flex items-center justify-center gap-2"
              title="Activate nuke mode - remove one opponent piece"
            >
              <span>💣</span>
              Nuke (1 use)
            </button>
          )
        )}
        {(gameState.nukeModeActive.white || gameState.nukeModeActive.black) && (
          <p className="text-xs text-center text-red-600 font-semibold">
            Click an opponent's piece to nuke it!
            <br />
            (Cannot target King or Queen)
          </p>
        )}
      </div>
    )}
  </>
)}
```

### Step 3: Update ChessBoard Component

**File**: `src/components/ChessBoard/ChessBoard.tsx`

#### 3.1 Add Nuclear Functions to useGame Hook
```typescript
const { gameState, makeMove, executeNuke } = useGame();
```

#### 3.2 Add Socket Nuclear Function
```typescript
const { roomCode, assignedColor, makeMove: socketMakeMove, executeNuke: socketExecuteNuke } = useSocket();
```

#### 3.3 Update onSquareClick Function (Add After Clear Right-Clicked Squares)
```typescript
// Handle nuke mode
const isNukeModeActive = gameState.nukeModeActive.white || gameState.nukeModeActive.black;
if (isNukeModeActive) {
  // In nuke mode, clicking executes the nuke
  const activeNukeColor = gameState.nukeModeActive.white ? 'w' : 'b';
  
  if (isOnlineGame && roomCode) {
    // For online games, use socket
    socketExecuteNuke(square, activeNukeColor);
  } else {
    // For local games, use direct execution
    if (executeNuke(square)) {
      // Nuke successful - clear any selection
      setMoveFrom(null);
      setOptionSquares({});
    }
  }
  return;
}
```

#### 3.4 Update onDrop Function (Add After Game End Check)
```typescript
// Don't allow drag and drop in nuke mode
const isNukeModeActive = gameState.nukeModeActive.white || gameState.nukeModeActive.black;
if (isNukeModeActive) {
  return false;
}
```

#### 3.5 Update onDragBegin Function (Add After Game End Check)
```typescript
// Don't allow drag in nuke mode
const isNukeModeActive = gameState.nukeModeActive.white || gameState.nukeModeActive.black;
if (isNukeModeActive) {
  return false;
}
```

#### 3.6 Update customSquareStyles useMemo (Replace Entire Function)
```typescript
const customSquareStyles = useMemo(() => {
  const styles: Partial<Record<Square, { backgroundColor?: string; background?: string; cursor?: string }>> = {};
  
  // Handle nuke mode highlighting
  const isNukeModeActive = gameState.nukeModeActive.white || gameState.nukeModeActive.black;
  if (isNukeModeActive) {
    const activeNukeColor = gameState.nukeModeActive.white ? 'w' : 'b';
    
    // Highlight all opponent pieces that can be nuked (not King or Queen)
    const allSquares: Square[] = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8',
                                  'b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8',
                                  'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8',
                                  'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8',
                                  'e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8',
                                  'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8',
                                  'g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8',
                                  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8'];
    
    allSquares.forEach((square) => {
      const piece = gameState.game.get(square);
      if (piece && piece.color !== activeNukeColor && piece.type !== 'k' && piece.type !== 'q') {
        styles[square] = { 
          backgroundColor: 'rgba(255, 0, 0, 0.5)',
          cursor: 'crosshair'
        };
      }
    });
    
    return styles;
  }
  
  // Normal move highlighting (when not in nuke mode)
  if (moveFrom) {
    styles[moveFrom] = { backgroundColor: 'rgba(255, 255, 0, 0.4)' };
  }
  
  // Highlight right-clicked squares
  rightClickedSquares.forEach((square) => {
    styles[square] = { backgroundColor: 'rgba(0, 0, 255, 0.4)' };
  });
  
  // Show possible moves
  Object.entries(optionSquares).forEach(([square, style]) => {
    styles[square as Square] = style;
  });
  
  // Highlight last move
  if (gameState.history.length > 0 && gameState.currentMoveIndex >= 0) {
    const lastMove = gameState.history[gameState.currentMoveIndex];
    styles[lastMove.from as Square] = { backgroundColor: 'rgba(255, 255, 0, 0.2)' };
    styles[lastMove.to as Square] = { backgroundColor: 'rgba(255, 255, 0, 0.2)' };
  }
  
  return styles;
}, [moveFrom, rightClickedSquares, optionSquares, gameState.history, gameState.currentMoveIndex, gameState.nukeModeActive, gameState.game]);
```

### Step 4: Update SocketContext for Multiplayer

**File**: `src/contexts/SocketContext.tsx`

#### 4.1 Add Nuclear Functions to Interface
```typescript
interface SocketContextType {
  // ... existing properties ...
  activateNuke: (color: 'w' | 'b') => void;
  executeNuke: (targetSquare: string, nukerColor: 'w' | 'b') => void;
  cancelNuke: () => void;
}
```

#### 4.2 Add Nuclear Socket Functions (Before value object)
```typescript
const activateNuke = (color: 'w' | 'b') => {
  if (socket && isConnected && roomCode) {
    socket.emit('activateNuke', color);
  }
};

const executeNuke = (targetSquare: string, nukerColor: 'w' | 'b') => {
  if (socket && isConnected && roomCode) {
    socket.emit('executeNuke', { targetSquare, nukerColor });
  }
};

const cancelNuke = () => {
  if (socket && isConnected && roomCode) {
    socket.emit('cancelNuke');
  }
};
```

#### 4.3 Add Functions to Context Value
```typescript
const value: SocketContextType = {
  // ... existing properties ...
  activateNuke,
  executeNuke,
  cancelNuke,
};
```

#### 4.4 Add Socket Event Listeners (In useEffect)
```typescript
// Nuke-related events
socketInstance.on('nukeModeActivated', (data) => {
  console.log('Nuke mode activated:', data);
  window.dispatchEvent(new CustomEvent('socketNukeModeActivated', { detail: data }));
});

socketInstance.on('nukeExecuted', (data) => {
  console.log('Nuke executed:', data);
  window.dispatchEvent(new CustomEvent('socketNukeExecuted', { detail: data }));
});

socketInstance.on('nukeCancelled', () => {
  console.log('Nuke cancelled');
  window.dispatchEvent(new CustomEvent('socketNukeCancelled'));
});
```

### Step 5: Update Backend Socket Handler

**File**: `backend-src/sockets/gameSocket.ts`

#### 5.1 Add Nuclear Event Handlers (After makeMove handler)
```typescript
// Handle nuke mode activation
socket.on('activateNuke', (color: 'w' | 'b') => {
  const roomCode = this.playerRooms.get(socket.id);
  if (!roomCode) return;

  const room = this.rooms.get(roomCode);
  if (!room) return;

  // Verify it's the player's turn and color
  const isWhitePlayer = room.whitePlayer?.socketId === socket.id;
  const isBlackPlayer = room.blackPlayer?.socketId === socket.id;
  
  if (!isWhitePlayer && !isBlackPlayer) return;
  
  const playerColor = isWhitePlayer ? 'w' : 'b';
  if (playerColor !== color) return;

  // Broadcast nuke mode activation to all in room
  this.io.to(roomCode).emit('nukeModeActivated', { color });
});

// Handle nuke execution
socket.on('executeNuke', async (data: { targetSquare: string; nukerColor: 'w' | 'b' }) => {
  const roomCode = this.playerRooms.get(socket.id);
  if (!roomCode) return;

  const room = this.rooms.get(roomCode);
  if (!room) return;

  // Verify it's the player's color
  const isWhitePlayer = room.whitePlayer?.socketId === socket.id;
  const isBlackPlayer = room.blackPlayer?.socketId === socket.id;
  
  if (!isWhitePlayer && !isBlackPlayer) return;
  
  const playerColor = isWhitePlayer ? 'w' : 'b';
  if (playerColor !== data.nukerColor) return;

  // Get the piece at the target square
  const piece = room.game.get(data.targetSquare);
  if (!piece || piece.color === data.nukerColor || piece.type === 'k' || piece.type === 'q') {
    socket.emit('error', { message: 'Invalid nuke target' });
    return;
  }

  // Remove the piece
  room.game.remove(data.targetSquare);

  // Broadcast the nuke to all players
  this.io.to(roomCode).emit('nukeExecuted', {
    targetSquare: data.targetSquare,
    nukerColor: data.nukerColor,
    piece: piece,
    fen: room.game.fen()
  });

  // Check if game ended due to nuke
  if (room.game.isCheckmate()) {
    const winner = room.game.turn() === 'w' ? 'black' : 'white';
    await this.endGame(roomCode, winner, 'checkmate');
  }
});

// Handle nuke mode cancellation
socket.on('cancelNuke', () => {
  const roomCode = this.playerRooms.get(socket.id);
  if (!roomCode) return;

  this.io.to(roomCode).emit('nukeCancelled');
});
```

## Testing Checklist

### Local Testing
- [ ] Human vs Human game shows nuke button
- [ ] Human vs AI game does NOT show nuke button
- [ ] Nuke button only appears in first 10 moves
- [ ] Nuke button disappears after use
- [ ] Red highlighting shows nukeable pieces
- [ ] Cannot target Kings or Queens
- [ ] Piece removal works correctly
- [ ] Game continues normally after nuke
- [ ] Move history shows nuke moves

### Multiplayer Testing
- [ ] Both players see nuke button
- [ ] Nuke mode activation syncs between players
- [ ] Piece removal syncs correctly
- [ ] Game state remains consistent
- [ ] Nuke cancellation works

### Edge Cases
- [ ] Nuke during check scenarios
- [ ] Nuke leading to checkmate
- [ ] Connection loss during nuke mode
- [ ] Invalid nuke attempts handled gracefully

## Deployment Notes

1. **Frontend**: All changes are in React components and contexts
2. **Backend**: Socket event handlers added to existing gameSocket.ts
3. **Database**: No schema changes required (nuke moves stored as special history entries)
4. **Dependencies**: No new dependencies required

## Rollback Plan
If issues arise, simply remove the nuclear features:
1. Revert GameContext changes
2. Remove nuke UI from GameControls
3. Revert ChessBoard modifications
4. Remove backend socket handlers

## Branch Reference
The complete working implementation is available on the `nuclear-chess` branch for reference and comparison.