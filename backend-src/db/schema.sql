-- Chess App Database Schema
-- Game History Storage

-- Create the game_history table
CREATE TABLE IF NOT EXISTS game_history (
    id SERIAL PRIMARY KEY,
    player_id VARCHAR(255) NOT NULL, -- Firebase UID of the player
    game_id VARCHAR(255) NOT NULL, -- Game session ID from frontend
    opponent_id VARCHAR(255), -- Firebase UID of opponent (NULL for AI games)
    opponent_name VARCHAR(255) NOT NULL, -- Display name of opponent or "Computer"
    player_color VARCHAR(1) NOT NULL CHECK (player_color IN ('w', 'b')), -- Player's color
    game_result VARCHAR(50) NOT NULL, -- Result description
    game_outcome VARCHAR(10) CHECK (game_outcome IN ('win', 'loss', 'draw')), -- Outcome for this player
    final_fen TEXT NOT NULL, -- Final board position
    pgn TEXT NOT NULL, -- Complete game in PGN format
    move_count INTEGER NOT NULL DEFAULT 0, -- Total number of moves
    game_duration INTEGER, -- Game duration in seconds
    time_control JSONB, -- Time control settings {initial: 300, increment: 0}
    game_mode VARCHAR(20) NOT NULL CHECK (game_mode IN ('human-vs-human', 'human-vs-ai')),
    ai_difficulty VARCHAR(20), -- AI difficulty level if applicable
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_game_history_player_id ON game_history(player_id);
CREATE INDEX IF NOT EXISTS idx_game_history_created_at ON game_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_history_player_outcome ON game_history(player_id, game_outcome);
CREATE INDEX IF NOT EXISTS idx_game_history_game_mode ON game_history(game_mode);

-- Create trigger to automatically update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_game_history_updated_at 
    BEFORE UPDATE ON game_history 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create users table if it doesn't exist (for reference)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    firebase_uid VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    display_name VARCHAR(100),
    avatar_url TEXT,
    is_guest BOOLEAN DEFAULT FALSE,
    preferences JSONB DEFAULT '{}',
    stats JSONB DEFAULT '{"wins": 0, "losses": 0, "draws": 0, "rating": 1200, "gamesPlayed": 0, "totalPlayTime": 0, "winStreak": 0, "bestWinStreak": 0}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on firebase_uid for users table
CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);

-- Add foreign key constraint (optional, but recommended)
-- ALTER TABLE game_history ADD CONSTRAINT fk_game_history_player 
--     FOREIGN KEY (player_id) REFERENCES users(firebase_uid);