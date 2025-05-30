# Chess App - Phase 1 MVP

A basic chess application built with React, TypeScript, and Tailwind CSS. This MVP allows two players to play chess on the same device (hot-seat mode).

## Features Implemented

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

1. The game starts with White to move
2. Click and drag pieces to make moves
3. Invalid moves will be rejected automatically
4. The turn indicator shows whose move it is
5. Check warnings appear when a king is in check
6. Game ends on checkmate, stalemate, or draw
7. Click "New Game" to start over

## Project Structure

```
chess-app/
├── src/
│   ├── components/
│   │   └── ChessBoard/
│   │       ├── ChessBoard.tsx    # Main chess board component
│   │       └── index.ts          # Export file
│   ├── App.tsx                   # Main app component
│   ├── App.css                   # Custom CSS (minimal)
│   ├── index.tsx                 # React entry point
│   └── index.css                 # Global styles with Tailwind
├── public/
├── tailwind.config.js            # Tailwind configuration
├── postcss.config.js             # PostCSS configuration
├── tsconfig.json                 # TypeScript configuration
└── package.json
```

## Next Steps (Phase 2)

- Add simple AI opponent
- Implement game mode selection (Human vs Human, Human vs Computer)
- Add more sophisticated UI elements
- Implement move sound effects

## Available Scripts

- `npm start` - Runs the app in development mode
- `npm test` - Launches the test runner
- `npm run build` - Builds the app for production
- `npm run eject` - Ejects from Create React App (one-way operation)

## License

This project is open source and available under the MIT License.