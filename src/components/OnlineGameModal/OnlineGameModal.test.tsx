import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OnlineGameModal } from './OnlineGameModal';
import { SocketProvider } from '../../contexts/SocketContext';
import { AuthProvider } from '../../contexts/AuthContext';

// Mock the hooks
const mockSocketContext = {
  isConnected: true,
  createRoom: jest.fn(),
  joinRoom: jest.fn(),
  roomCode: null as string | null,
  leaveRoom: jest.fn(),
  sendMove: jest.fn(),
  sendResign: jest.fn(),
  sendDrawOffer: jest.fn(),
  respondToDrawOffer: jest.fn()
};

const mockAuthContext = {
  user: {
    uid: 'test-user-123',
    email: 'test@example.com',
    displayName: 'Test User',
    photoURL: null
  } as { uid: string; email: string; displayName: string; photoURL: string | null } | null,
  loading: false,
  error: null,
  signInWithGoogle: jest.fn(),
  signOut: jest.fn()
};

jest.mock('../../contexts/SocketContext', () => ({
  ...jest.requireActual('../../contexts/SocketContext'),
  useSocket: () => mockSocketContext
}));

jest.mock('../../hooks/useAuth', () => ({
  useAuth: () => mockAuthContext
}));

const renderModal = (props = {}) => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn()
  };

  return render(
    <AuthProvider>
      <SocketProvider>
        <OnlineGameModal {...defaultProps} {...props} />
      </SocketProvider>
    </AuthProvider>
  );
};

describe('OnlineGameModal Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSocketContext.roomCode = null;
    mockSocketContext.isConnected = true;
    mockAuthContext.user = {
      uid: 'test-user-123',
      email: 'test@example.com',
      displayName: 'Test User',
      photoURL: null
    };
  });

  it('should not render when isOpen is false', () => {
    renderModal({ isOpen: false });
    expect(screen.queryByText('Online Game')).not.toBeInTheDocument();
  });

  it('should render sign in required message when user is not authenticated', () => {
    mockAuthContext.user = null;
    renderModal();

    expect(screen.getByText('Sign In Required')).toBeInTheDocument();
    expect(screen.getByText(/You need to sign in to play online/)).toBeInTheDocument();
  });

  it('should render modal with create and join options when authenticated', () => {
    renderModal();

    expect(screen.getByText('Online Game')).toBeInTheDocument();
    expect(screen.getByText('Create Game')).toBeInTheDocument();
    expect(screen.getByText('Join Game')).toBeInTheDocument();
  });

  it('should switch between create and join modes', () => {
    renderModal();

    // Default should be create mode
    expect(screen.getByText('Time Control')).toBeInTheDocument();

    // Click join button
    fireEvent.click(screen.getByText('Join Game'));

    // Should show join mode
    expect(screen.getByText('Enter Room Code')).toBeInTheDocument();
    expect(screen.queryByText('Time Control')).not.toBeInTheDocument();

    // Click create button
    fireEvent.click(screen.getByText('Create Game'));

    // Should show create mode again
    expect(screen.getByText('Time Control')).toBeInTheDocument();
  });

  it('should handle creating a room', async () => {
    const onClose = jest.fn();
    renderModal({ onClose });

    // The two time-control inputs are number spinbuttons. The component's
    // <label> elements are not associated to the inputs (no htmlFor/id), so we
    // select them by role and order: [0] = Minutes per side, [1] = Increment.
    const [minutesInput, incrementInput] = screen.getAllByRole('spinbutton') as HTMLInputElement[];

    userEvent.clear(minutesInput);
    userEvent.type(minutesInput, '5');

    userEvent.clear(incrementInput);
    userEvent.type(incrementInput, '3');

    // Click create room. handleCreateRoom schedules a setTimeout that updates
    // state, so wrap the interaction in act() to flush those updates.
    await act(async () => {
      fireEvent.click(screen.getByText('Create Room'));
    });

    // Should call createRoom with correct time control
    expect(mockSocketContext.createRoom).toHaveBeenCalledWith({
      initial: 300, // 5 minutes in seconds
      increment: 3
    });

    // Should close modal after the internal delay
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    }, { timeout: 1000 });
  });

  it('should show connection status when not connected', () => {
    mockSocketContext.isConnected = false;
    renderModal();

    expect(screen.getByText('Connecting to server...')).toBeInTheDocument();
  });

  it('should disable create room and not call createRoom while disconnected', () => {
    mockSocketContext.isConnected = false;
    renderModal();

    // While disconnected the connecting banner is shown and the Create Room
    // button is disabled, so clicking it never triggers room creation.
    expect(screen.getByText('Connecting to server...')).toBeInTheDocument();

    const createButton = screen.getByText('Create Room');
    expect(createButton).toBeDisabled();

    fireEvent.click(createButton);

    expect(mockSocketContext.createRoom).not.toHaveBeenCalled();
  });

  it('should handle joining a room with valid code', async () => {
    const onClose = jest.fn();
    mockSocketContext.roomCode = 'ABC123'; // Simulate successful join
    renderModal({ onClose });

    // Switch to join mode
    fireEvent.click(screen.getByText('Join Game'));

    // Enter room code
    const input = screen.getByPlaceholderText('XXXXXX');
    userEvent.type(input, 'ABC123');

    // Click join
    fireEvent.click(screen.getByText('Join Room'));

    expect(mockSocketContext.joinRoom).toHaveBeenCalledWith('ABC123');

    // currentRoomCode is set, so the auto-close effect fires onClose
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    }, { timeout: 1500 });
  });

  it('should validate room code length', () => {
    renderModal();

    // Switch to join mode
    fireEvent.click(screen.getByText('Join Game'));

    const input = screen.getByPlaceholderText('XXXXXX');
    const joinButton = screen.getByText('Join Room');

    // Button should be disabled with short code
    userEvent.type(input, 'ABC');
    expect(joinButton).toBeDisabled();

    // Button should be enabled with 6 character code
    userEvent.type(input, '123');
    expect(joinButton).not.toBeDisabled();
  });

  it('should show error broadcast from the socket when a join fails', async () => {
    renderModal();

    // Switch to join mode
    fireEvent.click(screen.getByText('Join Game'));

    // Enter room code
    const input = screen.getByPlaceholderText('XXXXXX');
    userEvent.type(input, 'WRONG1');

    // Click join (delegates to the socket layer)
    fireEvent.click(screen.getByText('Join Room'));
    expect(mockSocketContext.joinRoom).toHaveBeenCalledWith('WRONG1');

    // The component surfaces join failures via the global 'socketError' event
    // (dispatched by SocketContext on the server 'error' response).
    act(() => {
      window.dispatchEvent(
        new CustomEvent('socketError', {
          detail: { code: 'ROOM_NOT_FOUND', message: 'Failed to join room: room not found' }
        })
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/Failed to join room/)).toBeInTheDocument();
    }, { timeout: 1500 });
  });

  it('should display current room code when already in a room', () => {
    mockSocketContext.roomCode = 'XYZ789';
    renderModal();

    expect(screen.getByText('Room Code:')).toBeInTheDocument();
    expect(screen.getByText('XYZ789')).toBeInTheDocument();
    expect(screen.getByText('Share this code with your friend')).toBeInTheDocument();
  });

  it('should close modal when close button is clicked', () => {
    const onClose = jest.fn();
    renderModal({ onClose });

    fireEvent.click(screen.getByText('✕'));

    expect(onClose).toHaveBeenCalled();
  });

  it('should convert room code input to uppercase', () => {
    renderModal();

    // Switch to join mode
    fireEvent.click(screen.getByText('Join Game'));

    const input = screen.getByPlaceholderText('XXXXXX') as HTMLInputElement;
    userEvent.type(input, 'abc123');

    expect(input.value).toBe('ABC123');
  });

  it('should limit room code to 6 characters', () => {
    renderModal();

    // Switch to join mode
    fireEvent.click(screen.getByText('Join Game'));

    const input = screen.getByPlaceholderText('XXXXXX') as HTMLInputElement;
    userEvent.type(input, 'ABCDEFGHIJ');

    expect(input.value).toBe('ABCDEF');
  });

  it('should validate time control inputs', () => {
    renderModal();

    // Labels are not associated to inputs, so select the number spinbuttons by
    // role and order: [0] = Minutes per side, [1] = Increment (seconds).
    const [minutesInput, incrementInput] = screen.getAllByRole('spinbutton') as HTMLInputElement[];

    // Test min/max constraints
    expect(minutesInput.min).toBe('1');
    expect(minutesInput.max).toBe('60');
    expect(incrementInput.min).toBe('0');
    expect(incrementInput.max).toBe('30');
  });

  it('should disable create button while creating room', async () => {
    renderModal();

    const createButton = screen.getByText('Create Room');

    await act(async () => {
      fireEvent.click(createButton);
    });

    // Button text should change and be disabled while the create request is in
    // flight (before the internal timeout resolves and closes the modal).
    const creatingButton = screen.getByText('Creating Room...');
    expect(creatingButton).toBeInTheDocument();
    expect(creatingButton).toBeDisabled();
  });
});
