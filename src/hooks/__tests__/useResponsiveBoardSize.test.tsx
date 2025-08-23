import { renderHook, act } from '@testing-library/react';
import { useResponsiveBoardSize } from '../useResponsiveBoardSize';

describe('useResponsiveBoardSize', () => {
  const originalInnerWidth = window.innerWidth;
  const originalInnerHeight = window.innerHeight;

  afterEach(() => {
    // Restore original window dimensions
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      value: originalInnerWidth,
    });
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      value: originalInnerHeight,
    });
  });

  const setWindowSize = (width: number, height: number) => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      value: width,
    });
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      value: height,
    });
    window.dispatchEvent(new Event('resize'));
  };

  describe('Mobile devices', () => {
    it('should fit on iPhone 16 Pro (393x852)', () => {
      setWindowSize(393, 852);
      const { result } = renderHook(() => useResponsiveBoardSize());
      
      // Board should be 393 - 40 = 353px or less
      expect(result.current).toBeLessThanOrEqual(353);
      expect(result.current).toBeGreaterThanOrEqual(280); // Minimum size
    });

    it('should fit on iPhone 16 Pro Max (430x932)', () => {
      setWindowSize(430, 932);
      const { result } = renderHook(() => useResponsiveBoardSize());
      
      // Board should be 430 - 40 = 390px or less
      expect(result.current).toBeLessThanOrEqual(390);
      expect(result.current).toBeGreaterThanOrEqual(280);
    });

    it('should fit on iPhone SE (375x667)', () => {
      setWindowSize(375, 667);
      const { result } = renderHook(() => useResponsiveBoardSize());
      
      // Board should be 375 - 40 = 335px or less
      expect(result.current).toBeLessThanOrEqual(335);
      expect(result.current).toBeGreaterThanOrEqual(280);
    });

    it('should fit on small Android phone (360x640)', () => {
      setWindowSize(360, 640);
      const { result } = renderHook(() => useResponsiveBoardSize());
      
      // Board should be 360 - 40 = 320px or less
      expect(result.current).toBeLessThanOrEqual(320);
      expect(result.current).toBeGreaterThanOrEqual(280);
    });

    it('should handle landscape orientation on mobile (667x375)', () => {
      setWindowSize(667, 375);
      const { result } = renderHook(() => useResponsiveBoardSize());
      
      // In landscape, height is limited, should use height constraint
      // 375 - 300 = 75px is too small, should use minimum
      expect(result.current).toBeLessThanOrEqual(500); // Mobile max
      expect(result.current).toBeGreaterThanOrEqual(280);
    });

    it('should handle landscape iPhone 16 Pro Max (932x430)', () => {
      setWindowSize(932, 430);
      const { result } = renderHook(() => useResponsiveBoardSize());
      
      // In landscape tablet range
      // Height constraint: 430 - 300 = 130px, should be reasonable
      expect(result.current).toBeLessThanOrEqual(500);
      expect(result.current).toBeGreaterThanOrEqual(280);
    });
  });

  describe('Tablet devices', () => {
    it('should fit on iPad Mini (768x1024)', () => {
      setWindowSize(768, 1024);
      const { result } = renderHook(() => useResponsiveBoardSize());
      
      // Tablet range: 768 - 400 = 368px max, min 400px, so should be 400px
      expect(result.current).toBe(400);
    });

    it('should fit on iPad Pro 11" (834x1194)', () => {
      setWindowSize(834, 1194);
      const { result } = renderHook(() => useResponsiveBoardSize());
      
      // Tablet range: 834 - 400 = 434px, capped at 500px
      expect(result.current).toBeLessThanOrEqual(500);
      expect(result.current).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Desktop devices', () => {
    it('should show standard size on desktop (1920x1080)', () => {
      setWindowSize(1920, 1080);
      const { result } = renderHook(() => useResponsiveBoardSize());
      
      // Large desktop should use 600px
      expect(result.current).toBe(600);
    });

    it('should adjust for medium desktop (1366x768)', () => {
      setWindowSize(1366, 768);
      const { result } = renderHook(() => useResponsiveBoardSize());
      
      // Medium desktop: 1366 - 600 = 766px, capped at 550px
      expect(result.current).toBeLessThanOrEqual(550);
      expect(result.current).toBeGreaterThanOrEqual(450);
    });

    it('should show full size on large desktop (2560x1440)', () => {
      setWindowSize(2560, 1440);
      const { result } = renderHook(() => useResponsiveBoardSize());
      
      // Large desktop should use 600px
      expect(result.current).toBe(600);
    });
  });

  describe('Dynamic resizing', () => {
    it('should update board size when window resizes', async () => {
      setWindowSize(1920, 1080);
      const { result, rerender } = renderHook(() => useResponsiveBoardSize());
      
      expect(result.current).toBe(600);

      // Resize to mobile
      act(() => {
        setWindowSize(393, 852);
      });

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 150));
      rerender();

      expect(result.current).toBeLessThanOrEqual(353);
    });

    it('should debounce resize events', async () => {
      const { result } = renderHook(() => useResponsiveBoardSize());
      const initialSize = result.current;

      // Fire multiple resize events rapidly
      act(() => {
        setWindowSize(400, 800);
        setWindowSize(500, 900);
        setWindowSize(393, 852);
      });

      // Immediately after, size shouldn't have changed due to debouncing
      expect(result.current).toBe(initialSize);

      // Wait for debounce to complete
      await new Promise(resolve => setTimeout(resolve, 150));

      // Now it should reflect the final size
      expect(result.current).toBeLessThanOrEqual(353);
    });
  });

  describe('Edge cases', () => {
    it('should handle very small screens (280x500)', () => {
      setWindowSize(280, 500);
      const { result } = renderHook(() => useResponsiveBoardSize());
      
      // Should return minimum size
      expect(result.current).toBe(280);
    });

    it('should handle very tall narrow screens (320x900)', () => {
      setWindowSize(320, 900);
      const { result } = renderHook(() => useResponsiveBoardSize());
      
      // 320 - 40 = 280px
      expect(result.current).toBe(280);
    });

    it('should handle square screens (800x800)', () => {
      setWindowSize(800, 800);
      const { result } = renderHook(() => useResponsiveBoardSize());
      
      // Tablet range
      expect(result.current).toBeLessThanOrEqual(500);
      expect(result.current).toBeGreaterThanOrEqual(400);
    });
  });
});