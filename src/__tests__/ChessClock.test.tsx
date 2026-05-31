import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ChessClock from '../components/ChessClock/ChessClock';
import { createMockGameContext, createMockGameState } from '../test-utils/mockGameState';

// Mock the useGame hook
const mockSetTimeControl = jest.fn();
const mockPauseClock = jest.fn();
const mockGetPlayerByColor = jest.fn();

// Mock the entire GameContext module (factory only references jest.fn — see beforeEach)
jest.mock('../contexts/GameContext', () => ({
  useGame: jest.fn(),
}));

// ChessClock also calls useSocket(); without a provider it throws. Mock it with
// safe non-online defaults so the local-game render path is exercised.
jest.mock('../contexts/SocketContext', () => ({
  useSocket: jest.fn(),
}));

const { useGame } = require('../contexts/GameContext');
const { useSocket } = require('../contexts/SocketContext');

// Helper: build a complete GameContext value with the test's spy fns, overriding
// only the gameState fields a given test cares about.
const mockGame = (gameStateOverrides: Record<string, any>) =>
  useGame.mockReturnValue(
    createMockGameContext({
      gameState: createMockGameState(gameStateOverrides),
      setTimeControl: mockSetTimeControl,
      pauseClock: mockPauseClock,
      getPlayerByColor: mockGetPlayerByColor,
    }),
  );

describe('ChessClock Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPlayerByColor.mockImplementation((color: 'w' | 'b') =>
      color === 'w' ? 'White' : 'Black'
    );
    // Non-online socket defaults so the local-game render path is used.
    useSocket.mockReturnValue({ roomCode: null, gameState: null });

    // Reset to default mock state: 5+0, white to move
    mockGame({
      whiteTime: 300,
      blackTime: 300,
      activeColor: 'w',
      timeControl: { initial: 300, increment: 0 },
    });
  });

  describe('Time Control Selection', () => {
    it('renders time control selector when no time control is set', () => {
      // Override the mock for this test
      mockGame({
        whiteTime: 0,
        blackTime: 0,
        activeColor: null,
        timeControl: null,
      });

      render(<ChessClock />);

      expect(screen.getByText('Time Control')).toBeInTheDocument();
      expect(screen.getByText('Select a time control to start playing with a clock:')).toBeInTheDocument();
      expect(screen.getByText('1 min')).toBeInTheDocument();
      expect(screen.getByText('5 min')).toBeInTheDocument();
      expect(screen.getByText('10 min')).toBeInTheDocument();
    });

    it('sets time control when preset button is clicked', () => {
      mockGame({
        whiteTime: 0,
        blackTime: 0,
        activeColor: null,
        timeControl: null,
      });

      render(<ChessClock />);

      fireEvent.click(screen.getByText('5 min'));
      expect(mockSetTimeControl).toHaveBeenCalledWith(5, 0);
    });

    it('handles custom time input correctly', () => {
      mockGame({
        whiteTime: 0,
        blackTime: 0,
        activeColor: null,
        timeControl: null,
      });

      render(<ChessClock />);

      const customInput = screen.getByPlaceholderText('Minutes (1-180)');
      const setButton = screen.getByText('Set');

      // Test valid input
      fireEvent.change(customInput, { target: { value: '15' } });
      fireEvent.click(setButton);
      expect(mockSetTimeControl).toHaveBeenCalledWith(15, 0);
    });

    it('validates custom time input bounds', () => {
      mockGame({
        whiteTime: 0,
        blackTime: 0,
        activeColor: null,
        timeControl: null,
      });

      render(<ChessClock />);

      const customInput = screen.getByPlaceholderText('Minutes (1-180)');
      const setButton = screen.getByText('Set');

      // Test invalid input (too high)
      fireEvent.change(customInput, { target: { value: '200' } });
      expect(setButton).toBeDisabled();

      // Test invalid input (zero)
      fireEvent.change(customInput, { target: { value: '0' } });
      expect(setButton).toBeDisabled();
    });

    it('only allows numeric input in custom time field', () => {
      mockGame({
        whiteTime: 0,
        blackTime: 0,
        activeColor: null,
        timeControl: null,
      });

      render(<ChessClock />);

      const customInput = screen.getByPlaceholderText('Minutes (1-180)') as HTMLInputElement;

      // Test that numeric input is accepted
      fireEvent.change(customInput, { target: { value: '15' } });
      expect(customInput.value).toBe('15');

      // Test that non-numeric input is handled by HTML input validation
      fireEvent.change(customInput, { target: { value: 'abc' } });
      // The component uses pattern="[0-9]*" which prevents non-numeric input
      expect(customInput.value).toBe('15'); // Should remain at last valid value
    });
  });

  describe('Clock Display', () => {
    it('renders chess clock when time control is set', () => {
      render(<ChessClock />);

      expect(screen.getByText('Chess Clock')).toBeInTheDocument();
      expect(screen.getByText('White')).toBeInTheDocument();
      expect(screen.getByText('Black')).toBeInTheDocument();
      expect(screen.getByText('Change Time')).toBeInTheDocument();
      expect(screen.getByText('Pause')).toBeInTheDocument();
    });

    it('highlights active player clock', () => {
      render(<ChessClock />);

      // Find the actual clock sections by their container class
      const { container } = render(<ChessClock />);
      const clockSections = container.querySelectorAll('.p-3.rounded-lg');
      
      // The component renders Black first, then White (based on the component structure)
      const blackSection = clockSections[0];
      const whiteSection = clockSections[1];

      // White should be highlighted (active, since activeColor is 'w' in our mock)
      expect(whiteSection).toHaveClass('bg-gray-800', 'text-white', 'transform', 'scale-105');
      // Black should not be highlighted
      expect(blackSection).toHaveClass('bg-gray-200', 'text-gray-800');
    });

    it('shows correct time control description', () => {
      render(<ChessClock />);

      expect(screen.getByText('5 minutes per side')).toBeInTheDocument();
    });

    it('calls pauseClock when pause button is clicked', () => {
      render(<ChessClock />);

      fireEvent.click(screen.getByText('Pause'));
      expect(mockPauseClock).toHaveBeenCalled();
    });

    it('shows time selector when Change Time is clicked', () => {
      render(<ChessClock />);

      fireEvent.click(screen.getByText('Change Time'));
      expect(mockSetTimeControl).toHaveBeenCalledWith(null, 0);
    });
  });

  describe('Time Formatting', () => {
    it('formats time correctly for different scenarios', () => {
      // Test with different time values
      const testCases = [
        { time: 3661, expected: '1:01:01' }, // 1 hour, 1 minute, 1 second
        { time: 300, expected: '5:00' }, // 5 minutes
        { time: 65, expected: '1:05' }, // 1 minute, 5 seconds
        { time: 9.5, expected: '0:09.5' }, // 9.5 seconds (shows tenths)
        { time: 1.3, expected: '0:01.3' }, // 1.3 seconds
      ];

      testCases.forEach(({ time, expected }) => {
        mockGame({
          whiteTime: time,
          blackTime: time,
          activeColor: 'w',
          timeControl: { initial: 300, increment: 0 },
        });

        const { container, unmount } = render(<ChessClock />);
        
        // Look for the formatted time in font-mono elements
        const timeElements = container.querySelectorAll('.font-mono');
        expect(Array.from(timeElements).some(el => el.textContent === expected)).toBe(true);
        
        unmount(); // Clean up for next iteration
      });
    });
  });

  describe('Time Warnings', () => {
    it('shows yellow warning for low time (< 60 seconds)', () => {
      mockGame({
        whiteTime: 30, // 30 seconds - low time
        blackTime: 300,
        activeColor: 'w',
        timeControl: { initial: 300, increment: 0 },
      });

      render(<ChessClock />);

      const timeElements = screen.getAllByText(/0:30/);
      expect(timeElements[0]).toHaveClass('text-yellow-500');
    });

    it('shows red critical warning for very low time (< 10 seconds)', () => {
      mockGame({
        whiteTime: 5, // 5 seconds - critical time
        blackTime: 300,
        activeColor: 'w',
        timeControl: { initial: 300, increment: 0 },
      });

      render(<ChessClock />);

      const timeElements = screen.getAllByText(/0:05/);
      expect(timeElements[0]).toHaveClass('text-red-500', 'animate-pulse');
    });
  });

  describe('Pause Button Visibility', () => {
    it('shows pause button only when clock is active', () => {
      render(<ChessClock />);
      expect(screen.getByText('Pause')).toBeInTheDocument();
    });

    it('hides pause button when no active color', () => {
      mockGame({
        whiteTime: 300,
        blackTime: 300,
        activeColor: null, // No active color
        timeControl: { initial: 300, increment: 0 },
      });

      render(<ChessClock />);

      expect(screen.queryByText('Pause')).not.toBeInTheDocument();
    });
  });

  describe('Increment Display', () => {
    it('shows increment information when increment > 0', () => {
      mockGame({
        whiteTime: 300,
        blackTime: 300,
        activeColor: 'w',
        timeControl: { initial: 300, increment: 3 }, // 3 second increment
      });

      render(<ChessClock />);

      expect(screen.getByText('5 minutes per side + 3s increment')).toBeInTheDocument();
    });

    it('does not show increment when increment is 0', () => {
      render(<ChessClock />);
      
      expect(screen.getByText('5 minutes per side')).toBeInTheDocument();
      expect(screen.queryByText(/increment/)).not.toBeInTheDocument();
    });
  });

  describe('Input Validation Edge Cases', () => {
    it('corrects invalid values on blur', () => {
      mockGame({
        whiteTime: 0,
        blackTime: 0,
        activeColor: null,
        timeControl: null,
      });

      render(<ChessClock />);

      const customInput = screen.getByPlaceholderText('Minutes (1-180)') as HTMLInputElement;

      // Test correction of value too high
      fireEvent.change(customInput, { target: { value: '200' } });
      fireEvent.blur(customInput);
      expect(customInput.value).toBe('180');

      // Test correction of empty value
      fireEvent.change(customInput, { target: { value: '' } });
      fireEvent.blur(customInput);
      expect(customInput.value).toBe('1');
    });
  });
});