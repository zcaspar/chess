import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GameModeSelector from './GameModeSelector';
import { GameProvider } from '../../contexts/GameContext';
import { AuthProvider } from '../../contexts/AuthContext';
import { SocketProvider } from '../../contexts/SocketContext';

// Mock the contexts and hooks
const mockGameContext = {
  gameState: {
    gameMode: 'human-vs-human' as const,
    aiColor: 'b' as const,
    aiDifficulty: 'medium' as const,
    chess: null,
    board: [],
    turn: 'w' as const,
    isCheck: false,
    isCheckmate: false,
    isStalemate: false,
    isDraw: false,
    isGameOver: false,
    winner: null,
    history: [],
    currentMoveIndex: -1,
    capturedPieces: { w: [], b: [] },
    gameStartTime: Date.now(),
    lastMoveTime: Date.now(),
    timeControl: { white: 600000, black: 600000 },
    timeRemaining: { white: 600000, black: 600000 },
    connectionStatus: 'connected' as const,
    difficulty: 'medium' as const,
    isThinking: false,
    roomCode: null,
    playerColor: null,
    isPlayerTurn: true,
    moveNumber: 1,
    pgn: ''
  },
  setGameMode: jest.fn(),
  setAIDifficulty: jest.fn(),
  makeMove: jest.fn(),
  resetGame: jest.fn(),
  setDifficulty: jest.fn(),
  resign: jest.fn(),
  offerDraw: jest.fn(),
  acceptDraw: jest.fn(),
  rejectDraw: jest.fn(),
  jumpToMove: jest.fn(),
  saveGameToHistory: jest.fn(),
  createRoom: jest.fn(),
  joinRoom: jest.fn(),
  leaveRoom: jest.fn()
};

const mockSocketContext = {
  isConnected: true,
  roomCode: null,
  leaveRoom: jest.fn(),
  createRoom: jest.fn(),
  joinRoom: jest.fn(),
  sendMove: jest.fn(),
  sendResign: jest.fn(),
  sendDrawOffer: jest.fn(),
  respondToDrawOffer: jest.fn()
};

jest.mock('../../contexts/GameContext', () => ({
  ...jest.requireActual('../../contexts/GameContext'),
  useGame: () => mockGameContext
}));

jest.mock('../../contexts/SocketContext', () => ({
  ...jest.requireActual('../../contexts/SocketContext'),
  useSocket: () => mockSocketContext
}));

// Mock OnlineGameModal to avoid complexity
jest.mock('../OnlineGameModal', () => ({
  OnlineGameModal: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => 
    isOpen ? (
      <div data-testid="online-game-modal">
        <button onClick={onClose}>Close Modal</button>
      </div>
    ) : null
}));

const renderGameModeSelector = (customGameState = {}) => {
  mockGameContext.gameState = { ...mockGameContext.gameState, ...customGameState };
  
  return render(
    <AuthProvider>
      <SocketProvider>
        <GameProvider>
          <GameModeSelector />
        </GameProvider>
      </SocketProvider>
    </AuthProvider>
  );
};

describe('GameModeSelector Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSocketContext.roomCode = null;
  });

  it('should render with all game mode options', () => {
    renderGameModeSelector();
    
    expect(screen.getByText('Game Mode')).toBeInTheDocument();
    expect(screen.getByText('Human vs Human')).toBeInTheDocument();
    expect(screen.getByText('Human vs Computer')).toBeInTheDocument();
    expect(screen.getByText('Play Online with Friends')).toBeInTheDocument();
  });

  it('should show current mode correctly', () => {
    renderGameModeSelector();
    
    expect(screen.getByText(/Current:/)).toBeInTheDocument();
    expect(screen.getByText('Human vs Human (Local)')).toBeInTheDocument();
  });

  it('should switch to AI mode and show AI settings', async () => {
    renderGameModeSelector();
    
    // Click on Human vs Computer
    fireEvent.click(screen.getByLabelText('Human vs Computer'));
    
    // Should call setGameMode
    await waitFor(() => {
      expect(mockGameContext.setGameMode).toHaveBeenCalledWith('human-vs-ai', 'b');
    });
    
    // Update the state to reflect AI mode
    mockGameContext.gameState.gameMode = 'human-vs-ai';
    renderGameModeSelector({ gameMode: 'human-vs-ai' });
    
    // Should show AI settings
    expect(screen.getByText('Computer plays:')).toBeInTheDocument();
    expect(screen.getByText('Difficulty Level:')).toBeInTheDocument();
  });

  it('should handle AI color selection', async () => {
    renderGameModeSelector({ gameMode: 'human-vs-ai' });
    
    // Click on White radio button
    fireEvent.click(screen.getByLabelText('White'));
    
    await waitFor(() => {
      expect(mockGameContext.setGameMode).toHaveBeenCalledWith('human-vs-ai', 'w');
    });
  });

  it('should handle difficulty level selection', async () => {
    renderGameModeSelector({ gameMode: 'human-vs-ai' });
    
    // Click on Expert difficulty
    fireEvent.click(screen.getByLabelText('Expert'));
    
    await waitFor(() => {
      expect(mockGameContext.setAIDifficulty).toHaveBeenCalledWith('expert');
    });
  });

  it('should display all difficulty levels with descriptions', () => {
    renderGameModeSelector({ gameMode: 'human-vs-ai' });
    
    // Check all difficulty levels
    expect(screen.getByText('Beginner')).toBeInTheDocument();
    expect(screen.getByText('Very easy, makes many mistakes')).toBeInTheDocument();
    
    expect(screen.getByText('Easy')).toBeInTheDocument();
    expect(screen.getByText('Casual play, some mistakes')).toBeInTheDocument();
    
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.getByText('Balanced challenge')).toBeInTheDocument();
    
    expect(screen.getByText('Hard')).toBeInTheDocument();
    expect(screen.getByText('Strong play, few mistakes')).toBeInTheDocument();
    
    expect(screen.getByText('Expert')).toBeInTheDocument();
    expect(screen.getByText('Very strong, minimal mistakes')).toBeInTheDocument();
  });

  it('should leave room when switching away from online play', async () => {
    mockSocketContext.roomCode = 'ABC123';
    renderGameModeSelector();
    
    // Switch to AI mode
    fireEvent.click(screen.getByLabelText('Human vs Computer'));
    
    await waitFor(() => {
      expect(mockSocketContext.leaveRoom).toHaveBeenCalled();
    });
  });

  it('should open online game modal when clicking play online', () => {
    renderGameModeSelector();
    
    // Click play online button
    fireEvent.click(screen.getByText('Play Online with Friends'));
    
    // Modal should be visible
    expect(screen.getByTestId('online-game-modal')).toBeInTheDocument();
  });

  it('should close online game modal', () => {
    renderGameModeSelector();
    
    // Open modal
    fireEvent.click(screen.getByText('Play Online with Friends'));
    
    // Close modal
    fireEvent.click(screen.getByText('Close Modal'));
    
    // Modal should not be visible
    expect(screen.queryByTestId('online-game-modal')).not.toBeInTheDocument();
  });

  it('should show correct current mode for AI game', () => {
    renderGameModeSelector({ 
      gameMode: 'human-vs-ai',
      aiDifficulty: 'expert',
      aiColor: 'w'
    });
    
    expect(screen.getByText(/Human vs AI \(Expert, AI plays White\)/)).toBeInTheDocument();
  });

  it('should maintain checked state for selected options', () => {
    renderGameModeSelector({ 
      gameMode: 'human-vs-ai',
      aiDifficulty: 'hard',
      aiColor: 'b'
    });
    
    // Check game mode
    expect(screen.getByLabelText('Human vs Computer')).toBeChecked();
    expect(screen.getByLabelText('Human vs Human')).not.toBeChecked();
    
    // Check AI color
    expect(screen.getByLabelText('Black')).toBeChecked();
    expect(screen.getByLabelText('White')).not.toBeChecked();
    
    // Check difficulty
    expect(screen.getByLabelText('Hard')).toBeChecked();
    expect(screen.getByLabelText('Medium')).not.toBeChecked();
  });

  it('should not show AI settings when in human vs human mode', () => {
    renderGameModeSelector({ gameMode: 'human-vs-human' });
    
    expect(screen.queryByText('Computer plays:')).not.toBeInTheDocument();
    expect(screen.queryByText('Difficulty Level:')).not.toBeInTheDocument();
  });

  it('should handle switching between modes correctly', async () => {
    const { rerender } = renderGameModeSelector();
    
    // Start in human vs human
    expect(screen.getByLabelText('Human vs Human')).toBeChecked();
    
    // Switch to AI mode
    fireEvent.click(screen.getByLabelText('Human vs Computer'));
    
    // Update state and rerender
    mockGameContext.gameState.gameMode = 'human-vs-ai';
    rerender(
      <AuthProvider>
        <SocketProvider>
          <GameProvider>
            <GameModeSelector />
          </GameProvider>
        </SocketProvider>
      </AuthProvider>
    );
    
    // Should show AI settings
    expect(screen.getByText('Computer plays:')).toBeInTheDocument();
    
    // Switch back to human vs human
    fireEvent.click(screen.getByLabelText('Human vs Human'));
    
    await waitFor(() => {
      expect(mockGameContext.setGameMode).toHaveBeenCalledWith('human-vs-human');
    });
  });
});