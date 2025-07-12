# Chess App - Professional Multiplayer Chess Platform

A feature-rich chess application with AI opponents, real-time multiplayer, game history, comprehensive analytics, and **LC0 neural network position analysis**. Built with React, TypeScript, and Node.js.

## 🎮 Live Demo

**Play now at: [https://chess-pu71.vercel.app](https://chess-pu71.vercel.app)**

## ✨ Key Features

### 🤖 AI Opponents with Multiple Difficulty Levels

Our AI uses the **LC0 (Leela Chess Zero) neural network** engine, providing world-class chess AI with realistic play at all levels:

#### Difficulty Levels:

1. **Beginner** (~800 ELO)
   - Perfect for new players learning chess
   - Makes deliberate mistakes and overlooks tactics
   - Response time: ~500ms per move
   - High move randomness to simulate beginner play

2. **Easy** (~1200 ELO)
   - Suitable for casual players
   - Occasionally misses tactics but plays solid moves
   - Response time: ~1 second per move
   - Moderate move randomness

3. **Medium** (~1600 ELO)
   - Challenging for intermediate players
   - Plays tactically sound chess with good positional understanding
   - Response time: ~2 seconds per move
   - Low move randomness

4. **Hard** (~2000 ELO)
   - Strong club player level
   - Excellent tactical and positional play
   - Response time: ~5 seconds per move
   - Minimal randomness, occasional suboptimal moves

5. **Expert** (~3400+ ELO)
   - Superhuman play using full LC0 neural network strength
   - World-class tactical and strategic understanding (stronger than any human)
   - Response time: ~10 seconds per move
   - No randomness - plays the best moves

*Note: ELO ratings are approximate and based on typical human ratings. The AI adjusts its strength through a combination of search depth limitation, move randomness, and thinking time.*

### 🌐 Online Multiplayer
- **Real-time gameplay** with Socket.io
- **Room system** - Create/join games with room codes
- **Timer synchronization** - Chess clocks sync across all players
- **Automatic reconnection** - Resume games after disconnection
- **Spectator mode** - Watch ongoing games

### 🔐 User Authentication
- **Google Sign-In** integration
- **Guest mode** for quick play
- **Persistent user profiles**
- **Game history** tied to user accounts

### 📊 Statistical Dashboard (NEW!)
- **Performance analytics** - Win rate, game trends, average game duration
- **Interactive charts** - Visualize your progress over time
- **AI difficulty breakdown** - See performance against each difficulty level
- **Time control statistics** - Analyze performance in different time formats
- **Game outcome distribution** - Wins, losses, draws visualization

### ⏱️ Time Controls
- **Preset options**: 1 min (Bullet), 5 min (Blitz), 10 min (Rapid)
- **Custom time controls**: 1-180 minutes
- **Real-time clock synchronization** in multiplayer
- **Time expiration** detection with automatic game end

### 🎯 Game Features
- **Move highlighting** - Shows legal moves for selected pieces
- **Drag and drop** or click-to-move interface
- **Move history** with algebraic notation
- **Game replay** - Review completed games move by move
- **LC0 Position Analysis** - Get expert-level analysis of any position during replay
- **Position evaluation** - See who's winning
- **Draw offers** and resignation
- **Automatic game saving** to history

### 📱 Responsive Design
- Works on desktop, tablet, and mobile devices
- Touch-friendly interface
- Adaptive layout for different screen sizes

## 🛠️ Tech Stack

### Frontend
- **React** with TypeScript
- **chess.js** - Chess game logic and validation
- **react-chessboard** - Chess board UI component
- **Tailwind CSS** - Styling and responsive design
- **Socket.io-client** - Real-time multiplayer
- **Firebase** - Authentication
- **Chart.js** - Analytics visualization

### Backend
- **Node.js** with Express
- **Socket.io** - WebSocket connections
- **PostgreSQL** - Game data persistence
- **Firebase Admin** - User authentication
- **LC0** - Chess AI engine

### Deployment
- **Frontend**: Vercel
- **Backend**: Railway
- **Database**: Railway PostgreSQL
- **AI Server**: Railway (separate service)

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn
- PostgreSQL (for local development)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/your-username/chess-app.git
cd chess-app
```

2. Install frontend dependencies:
```bash
npm install
```

3. Install backend dependencies:
```bash
cd backend-src
npm install
cd ..
```

4. Set up environment variables:

Create a `.env` file in the root directory:
```env
REACT_APP_BACKEND_URL=http://localhost:3005
REACT_APP_FIREBASE_API_KEY=your-firebase-api-key
REACT_APP_FIREBASE_AUTH_DOMAIN=your-auth-domain
REACT_APP_FIREBASE_PROJECT_ID=your-project-id
```

Create a `.env` file in the backend-src directory:
```env
PORT=3005
DATABASE_URL=postgresql://user:password@localhost:5432/chess
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY=your-private-key
FIREBASE_CLIENT_EMAIL=your-client-email
```

5. Start the development servers:

Frontend:
```bash
npm start
```

Backend (in a new terminal):
```bash
cd backend-src
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000) to play!

## 🎮 How to Play

### Game Modes

1. **Human vs Human (Local)** - Play against someone on the same device
2. **Human vs AI** - Play against the computer at various difficulty levels
3. **Online Multiplayer** - Play against friends or other players online

### Basic Gameplay
1. White always moves first
2. Click and drag pieces OR click a piece then click destination
3. Legal moves are highlighted when you select a piece
4. The game detects check, checkmate, and stalemate automatically
5. Use the timer for timed games

### Online Multiplayer
1. Sign in with Google or continue as guest
2. Click "Play Online"
3. Either:
   - Create a new room and share the code
   - Join an existing room with a code
4. The game starts when both players join
5. Moves and timers sync in real-time

### Viewing Statistics
1. Sign in with your Google account
2. Click "📊 Analytics" in the header
3. View your performance trends, win rates, and game statistics
4. Analyze your performance against different AI difficulties

### Using Position Analysis
1. Sign in with your Google account
2. Go to "Game History" and select any completed game
3. Use the replay controls to navigate to any position
4. Click "🧠 Analyze Position" to get LC0's expert analysis
5. The best move will be highlighted in purple on the board
6. View detailed analysis including engine evaluation and recommended moves

## 📁 Project Structure

```
chess-app/
├── src/                      # React frontend
│   ├── components/           # UI components
│   ├── contexts/            # React contexts (Game, Auth, Socket)
│   ├── hooks/               # Custom React hooks
│   └── utils/               # Utility functions
├── backend-src/             # Node.js backend
│   ├── models/              # Database models
│   ├── routes/              # API routes
│   ├── sockets/             # Socket.io handlers
│   └── config/              # Configuration files
├── lc0-server/              # LC0 AI server
│   ├── Dockerfile           # LC0 container setup
│   └── server.js            # AI API endpoints
└── public/                  # Static assets
```

## 🔄 Recent Updates

- ✅ **LC0 Position Analysis** - NEW! Get expert-level analysis of any position during game replay
- ✅ **Analytics Dashboard** - Comprehensive game statistics and performance tracking
- ✅ **Timer Synchronization** - Fixed real-time timer updates in multiplayer
- ✅ **Game Outcome Sync** - Both players now see game results immediately
- ✅ **LC0 AI Integration** - World-class neural network chess engine
- ✅ **Game History** - Save and replay all your games

## 🐛 Known Issues

- Analytics features require game history data to display
- AI response time may vary on first move while engine initializes
- Mobile keyboard may appear on custom time control input

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is open source and available under the MIT License.

## 👥 Credits

- Chess logic powered by [chess.js](https://github.com/jhlywa/chess.js)
- Board UI by [react-chessboard](https://github.com/Clariity/react-chessboard)
- AI powered by [Leela Chess Zero](https://lczero.org/)
- Icons and styling with [Tailwind CSS](https://tailwindcss.com/)