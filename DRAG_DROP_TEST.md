# Drag and Drop Testing Guide

## Testing Instructions

1. **Open the app** at http://localhost:3000

2. **Test basic drag and drop**:
   - Start a new game (Human vs Human or Human vs Computer)
   - Try dragging a white pawn from its starting position
   - Drop it on a valid square (one or two squares forward)
   - The piece should move smoothly

3. **Test visual feedback**:
   - When you start dragging a piece, the valid move squares should be highlighted
   - The cursor should change to a "grab" hand when hovering over a draggable piece
   - The cursor should change to "grabbing" while dragging

4. **Test turn validation**:
   - Try dragging a black piece when it's white's turn - it shouldn't be draggable
   - After white moves, try dragging a white piece - it shouldn't be draggable

5. **Test with different themes**:
   - Go to Settings and try different board themes (Classic, Wood, Neon, Ice)
   - Try different piece styles (Classic, Modern, Fantasy, Minimal, Lego)
   - Drag and drop should work smoothly with all combinations

6. **Test online multiplayer**:
   - Create an online game
   - Join from another browser/device
   - Verify drag and drop works for the correct player's turn only

7. **Test edge cases**:
   - Try dragging a piece to an invalid square - it should return to original position
   - Try dragging when the game is over - pieces shouldn't be draggable
   - Test castling by dragging the king two squares
   - Test en passant captures

## Mobile Testing

For mobile devices:
- Touch and hold a piece to start dragging
- Drag to the desired square
- Release to drop

## Expected Behavior

✅ Pieces can be dragged and dropped to make moves
✅ Visual feedback shows valid moves during drag
✅ Invalid moves are rejected and piece returns to original square
✅ Only the current player's pieces can be dragged
✅ Drag and drop works with all themes and piece styles
✅ Both click-to-move and drag-and-drop work simultaneously