# Chess App - Phase 2 Complete

A feature-rich chess application built with React, TypeScript, and Tailwind CSS. The app now includes advanced game controls, move history, and state management.

## Phase 2 Features (Just Added!)

### Enhanced Chess Board
- ✅ **Move highlighting** - Shows possible moves when selecting a piece
- ✅ **Last move indication** - Highlights the previous move
- ✅ **Click-to-move** - Click a piece then click destination
- ✅ **Right-click squares** - Mark squares with right-click
- ✅ **Visual feedback** - Selected pieces and valid moves clearly shown

### Game State Management
- ✅ **React Context** - Centralized game state management
- ✅ **Undo/Redo** - Navigate through move history
- ✅ **Move persistence** - Maintains full game history

### Advanced Controls
- ✅ **Resign button** - Either player can resign
- ✅ **Draw offers** - Propose and accept/decline draws
- ✅ **Game controls panel** - All controls in one place

### Improved UI
- ✅ **Three-column layout** - Status, board, and history
- ✅ **Move history table** - Professional notation display
- ✅ **Game status panel** - Current turn, check warnings, statistics
- ✅ **Responsive design** - Works on all screen sizes

## Phase 1 Features (Original MVP)

- ✅ Fully functional chess board with drag-and-drop pieces
- ✅ Complete chess rules validation using chess.js
- ✅ Turn indicator showing whose move it is
- ✅ Check detection and notification
- ✅ Game over detection (checkmate, stalemate, draws)
- ✅ Move history display in algebraic notation
- ✅ New game button to reset the board
- ✅ Clean, responsive UI with Tailwind CSS

## Tech Stack

- **React** with TypeScript
- **chess.js** - Chess game logic and validation
- **react-chessboard** - Chess board UI component
- **Tailwind CSS** - Styling and responsive design
- **React Context** - State management

## Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Navigate to the chess-app directory:
```bash
cd chess-app
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

4. Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

## How to Play

### Basic Gameplay
1. The game starts with White to move
2. Click and drag pieces OR click a piece then click destination
3. Invalid moves will be rejected automatically
4. The turn indicator shows whose move it is
5. Check warnings appear when a king is in check

### Advanced Features
- **Undo/Redo**: Navigate through your game history
- **Resign**: End the game by resigning
- **Draw Offer**: Propose a draw to your opponent
- **Move Highlighting**: See all legal moves for selected pieces
- **Right-click**: Mark squares for planning

## Project Structure

```
chess-app/
├── src/
│   ├── components/
│   │   ├── ChessBoard/       # Enhanced chess board with highlights
│   │   ├── GameControls/     # Control panel (new game, resign, etc.)
│   │   ├── GameStatus/       # Game status display
│   │   └── MoveHistory/      # Move history table
│   ├── contexts/
│   │   └── GameContext.tsx   # Centralized game state
│   ├── App.tsx               # Main app with new layout
│   ├── App.css               # Custom styles
│   ├── index.tsx             # React entry point
│   └── index.css             # Global styles with Tailwind
├── public/
├── tailwind.config.js        # Tailwind configuration
├── postcss.config.js         # PostCSS configuration
├── tsconfig.json             # TypeScript configuration
└── package.json
```

## Next Steps (Phase 3)

- Add simple computer opponent
- Implement basic AI with difficulty levels
- Add game mode selection (Human vs Human, Human vs Computer)
- Implement move animations

## Available Scripts

- `npm start` - Runs the app in development mode
- `npm test` - Launches the test runner
- `npm run build` - Builds the app for production
- `npm run eject` - Ejects from Create React App (one-way operation)

## License

This project is open source and available under the MIT License.