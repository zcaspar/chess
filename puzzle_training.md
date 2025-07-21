# Chess Puzzle Training Feature - Implementation Plan

## 📋 Overview
This document outlines the implementation plan for adding a comprehensive puzzle training feature to the chess application. The feature will help users improve their chess skills through tactical puzzles, pattern recognition, and structured learning.

## 🎯 Goals
1. Provide an engaging way for users to improve their chess tactics
2. Track user progress and adapt difficulty accordingly
3. Integrate seamlessly with existing chess platform
4. Support various puzzle types and themes
5. Leverage LC0 for puzzle evaluation and hints

## 🗄️ Database Schema

### 1. **puzzles** table
```sql
CREATE TABLE puzzles (
    id SERIAL PRIMARY KEY,
    fen TEXT NOT NULL,                    -- Starting position in FEN format
    moves TEXT NOT NULL,                  -- Solution moves in UCI format (space-separated)
    pgn TEXT,                             -- Full PGN including setup position
    rating INTEGER DEFAULT 1200,          -- Puzzle difficulty rating
    themes TEXT[],                        -- Array of themes (e.g., ['fork', 'pin', 'mate_in_2'])
    popularity DECIMAL DEFAULT 0,         -- Popularity score based on attempts
    attempts INTEGER DEFAULT 0,           -- Total attempts across all users
    successes INTEGER DEFAULT 0,          -- Total successful completions
    source TEXT,                          -- Source of puzzle (e.g., 'lichess', 'generated')
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_puzzles_rating ON puzzles(rating);
CREATE INDEX idx_puzzles_themes ON puzzles USING GIN(themes);
CREATE INDEX idx_puzzles_popularity ON puzzles(popularity DESC);
```

### 2. **user_puzzle_progress** table
```sql
CREATE TABLE user_puzzle_progress (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    puzzle_id INTEGER REFERENCES puzzles(id) ON DELETE CASCADE,
    completed BOOLEAN DEFAULT false,
    attempts INTEGER DEFAULT 0,
    time_spent INTEGER,                   -- Time in seconds
    hints_used INTEGER DEFAULT 0,
    rating_before INTEGER,                -- User's puzzle rating before attempt
    rating_after INTEGER,                 -- User's puzzle rating after attempt
    attempted_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    UNIQUE(user_id, puzzle_id)
);

-- Indexes
CREATE INDEX idx_user_puzzle_progress_user ON user_puzzle_progress(user_id);
CREATE INDEX idx_user_puzzle_progress_completed ON user_puzzle_progress(user_id, completed);
```

### 3. **user_puzzle_stats** table
```sql
CREATE TABLE user_puzzle_stats (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    puzzle_rating INTEGER DEFAULT 1200,
    puzzles_attempted INTEGER DEFAULT 0,
    puzzles_solved INTEGER DEFAULT 0,
    total_time_spent INTEGER DEFAULT 0,    -- Total time in seconds
    streak_current INTEGER DEFAULT 0,      -- Current solving streak
    streak_best INTEGER DEFAULT 0,         -- Best solving streak
    last_puzzle_date DATE,
    themes_mastery JSONB DEFAULT '{}',     -- JSON tracking proficiency in each theme
    updated_at TIMESTAMP DEFAULT NOW()
);
```

## 🔌 Backend API Endpoints

### Puzzle Routes (`/backend-src/routes/puzzles.ts`)

#### 1. **GET /api/puzzles/daily**
Get the daily puzzle (same for all users each day)
```typescript
Response: {
  puzzle: {
    id: number,
    fen: string,
    rating: number,
    themes: string[],
    attempts: number,
    success_rate: number
  },
  user_attempted: boolean,
  user_completed: boolean
}
```

#### 2. **GET /api/puzzles/random**
Get a random puzzle based on user's rating and preferences
```typescript
Query params: {
  themes?: string[],     // Filter by themes
  difficulty?: 'easy' | 'medium' | 'hard' | 'adaptive',
  exclude_solved?: boolean
}

Response: {
  puzzle: PuzzleData,
  recommended: boolean   // If this matches user's level
}
```

#### 3. **POST /api/puzzles/:id/attempt**
Submit a puzzle attempt
```typescript
Body: {
  move: string,         // Move in UCI format
  time_elapsed: number, // Seconds since puzzle started
  position_index: number // Which move in the solution
}

Response: {
  correct: boolean,
  complete: boolean,    // If puzzle is fully solved
  next_move: string,    // Next move to play (for multi-move puzzles)
  rating_change?: number,
  hint?: string        // If move is wrong, optional hint
}
```

#### 4. **GET /api/puzzles/:id/solution**
Get the full solution (with optional step-by-step explanation)
```typescript
Response: {
  moves: string[],      // Array of moves in UCI format
  annotations: string[], // Explanations for each move
  key_squares: string[][] // Important squares for each position
}
```

#### 5. **GET /api/puzzles/history**
Get user's puzzle solving history
```typescript
Query params: {
  limit?: number,
  offset?: number,
  filter?: 'solved' | 'failed' | 'all'
}

Response: {
  puzzles: Array<{
    puzzle: PuzzleData,
    attempts: number,
    completed: boolean,
    time_spent: number,
    attempted_at: string
  }>,
  total: number
}
```

#### 6. **GET /api/puzzles/stats**
Get user's puzzle statistics
```typescript
Response: {
  rating: number,
  total_attempted: number,
  total_solved: number,
  success_rate: number,
  average_time: number,
  current_streak: number,
  best_streak: number,
  themes_performance: {
    [theme: string]: {
      attempted: number,
      solved: number,
      average_rating: number
    }
  },
  rating_history: Array<{
    date: string,
    rating: number
  }>
}
```

## 🎨 Frontend Components

### Component Structure
```
src/components/PuzzleTraining/
├── PuzzleTrainer.tsx          # Main container component
├── PuzzleBoard.tsx            # Interactive chess board for puzzles
├── PuzzleInfo.tsx             # Display puzzle metadata
├── PuzzleControls.tsx         # Control buttons (hint, reset, solution)
├── PuzzleStats.tsx            # User statistics display
├── PuzzleHistory.tsx          # Past puzzles browser
├── PuzzleSelector.tsx         # Theme/difficulty selector
├── PuzzleRatingGraph.tsx      # Rating progression chart
└── styles/
    └── PuzzleTraining.module.css
```

### Key Component Features

#### **PuzzleTrainer.tsx**
Main container that manages puzzle state and user interactions
```typescript
interface PuzzleTrainerState {
  currentPuzzle: Puzzle | null;
  position: Position;
  moveIndex: number;
  playerTurn: boolean;
  hints: string[];
  showingSolution: boolean;
  timeElapsed: number;
  attempts: number;
}
```

#### **PuzzleBoard.tsx**
- Extends existing chess board component
- Highlights target squares for puzzle objectives
- Shows arrows for hints
- Validates moves against solution
- Provides visual feedback for correct/incorrect moves

#### **PuzzleControls.tsx**
- **Hint Button**: Shows next move highlighting
- **Reset Button**: Reset to starting position
- **Solution Button**: Play through solution automatically
- **Skip Button**: Skip current puzzle (with rating penalty)
- **Analysis Button**: Open position in LC0 analysis

#### **PuzzleStats.tsx**
- Current puzzle rating with trend indicator
- Success rate percentage
- Average solving time
- Streak counter
- Theme-based performance breakdown

## 🎮 User Experience Flow

### 1. **Puzzle Selection**
```
Main Menu → Puzzles → Choose Mode:
├── Daily Puzzle (one per day)
├── Rated Puzzles (affects rating)
├── Practice Mode (no rating change)
├── Themed Training (specific tactics)
└── Puzzle Rush (time pressure)
```

### 2. **Solving Process**
1. Puzzle loads with starting position
2. User identifies the goal (e.g., "White to play and win")
3. User makes moves by clicking/dragging pieces
4. Each move is validated immediately
5. Correct moves advance the puzzle
6. Incorrect moves show feedback
7. Completion triggers rating update and stats

### 3. **Feedback System**
- ✅ **Correct move**: Green highlight, proceed to next move
- ❌ **Incorrect move**: Red highlight, piece returns
- 💡 **Hint used**: Yellow highlight on target square
- 🏆 **Puzzle complete**: Celebration animation, rating change

## 🧩 Puzzle Types & Themes

### Tactical Themes
- **Basic**: Forks, Pins, Skewers, Discovered attacks
- **Intermediate**: Double attacks, Deflection, Decoy, Interference
- **Advanced**: Zwischenzug, Clearance, X-ray, Desperado
- **Checkmate**: Back rank, Smothered, Arabian, Greek gift

### Positional Themes
- Weak squares exploitation
- Pawn structure advantages
- Piece activity improvement
- Space advantage utilization

### Endgame Themes
- King and pawn endings
- Rook endings
- Minor piece endings
- Theoretical positions

## 🚀 Implementation Phases

### Phase 1: Core Infrastructure (Week 1-2)
- [ ] Create database tables and migrations
- [ ] Implement basic puzzle API endpoints
- [ ] Create PuzzleBoard component
- [ ] Basic puzzle solving functionality

### Phase 2: User Experience (Week 3-4)
- [ ] Add puzzle rating system
- [ ] Implement hint system
- [ ] Create puzzle statistics tracking
- [ ] Add puzzle history view

### Phase 3: Advanced Features (Week 5-6)
- [ ] Integrate LC0 for position evaluation
- [ ] Add themed puzzle collections
- [ ] Implement puzzle rush mode
- [ ] Create puzzle achievement system

### Phase 4: Content & Polish (Week 7-8)
- [ ] Import initial puzzle database
- [ ] Add puzzle explanations
- [ ] Create onboarding tutorial
- [ ] Performance optimization

## 🔧 Technical Considerations

### Performance
- Cache popular puzzles in Redis
- Lazy load puzzle collections
- Optimize database queries with proper indexing
- Preload next puzzle while solving current

### Puzzle Sources
1. **Lichess Database**: Open-source puzzle database (2M+ puzzles)
2. **Generated**: Create from master games
3. **User Submissions**: Allow puzzle creation (with moderation)

### Rating Algorithm
Use Glicko-2 rating system for puzzles:
- Initial rating: 1200
- Rating deviation: Accounts for uncertainty
- Volatility: Measures consistency
- K-factor adjustment based on puzzle difficulty

### Integration Points
- **Authentication**: Use existing user system
- **Chess Engine**: Leverage chess.js for move validation
- **LC0 Integration**: Use for hints and position evaluation
- **Analytics**: Extend existing dashboard with puzzle stats
- **Notifications**: Daily puzzle reminders

## 📊 Success Metrics
- Daily active puzzle solvers
- Average puzzles solved per user
- User rating improvement over time
- Puzzle completion rate
- Time spent in puzzle training
- User retention in puzzle mode

## 🔒 Security Considerations
- Validate all moves server-side
- Rate limit puzzle attempts
- Prevent puzzle solution scraping
- Secure rating calculations server-side
- Anti-cheat detection for suspicious patterns

## 🎯 Future Enhancements
1. **Puzzle Battles**: Real-time puzzle solving competitions
2. **Custom Puzzles**: User-created puzzle sharing
3. **Puzzle Tournaments**: Scheduled puzzle competitions
4. **Study Plans**: Structured learning paths
5. **Coach Integration**: Puzzle recommendations based on game analysis
6. **Mobile App**: Dedicated puzzle training app