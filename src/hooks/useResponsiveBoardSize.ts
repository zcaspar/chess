import { useState, useEffect } from 'react';

export const useResponsiveBoardSize = () => {
  const [boardSize, setBoardSize] = useState(600);

  useEffect(() => {
    const calculateBoardSize = () => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      // Mobile portrait (width < 768px)
      if (viewportWidth < 768) {
        // Use viewport width minus padding (40px total for 20px each side)
        const maxWidth = viewportWidth - 40;
        // Also consider height to ensure board fits in viewport
        const maxHeight = viewportHeight - 300; // Reserve space for UI elements
        // Use the smaller of the two to ensure it fits
        const size = Math.min(maxWidth, maxHeight, 500); // Cap at 500px for mobile
        setBoardSize(Math.max(size, 280)); // Minimum 280px
      }
      // Tablet (768px - 1024px)
      else if (viewportWidth < 1024) {
        const maxWidth = viewportWidth - 400; // Account for sidebars on tablet
        const size = Math.min(maxWidth, 500);
        setBoardSize(Math.max(size, 400)); // Minimum 400px for tablets
      }
      // Desktop (1024px - 1400px)
      else if (viewportWidth < 1400) {
        const maxWidth = viewportWidth - 600; // Account for sidebars
        const size = Math.min(maxWidth, 550);
        setBoardSize(Math.max(size, 450));
      }
      // Large desktop (1400px+)
      else {
        setBoardSize(600); // Original size for large screens
      }
    };

    // Calculate initial size
    calculateBoardSize();

    // Add resize listener with debouncing
    let resizeTimer: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(calculateBoardSize, 100);
    };

    window.addEventListener('resize', handleResize);
    
    // Also listen for orientation change on mobile
    window.addEventListener('orientationchange', () => {
      setTimeout(calculateBoardSize, 100); // Delay to ensure new dimensions are available
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', calculateBoardSize);
      clearTimeout(resizeTimer);
    };
  }, []);

  return boardSize;
};