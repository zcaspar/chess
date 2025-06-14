-- Chess App Database Schema with User Authentication
-- Run this script to initialize the database

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    firebase_uid VARCHAR(128) UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(100),
    avatar_url TEXT,
    is_guest BOOLEAN DEFAULT FALSE,
    preferences JSONB DEFAULT '{}',
    stats JSONB DEFAULT '{"wins": 0, "losses": 0, "draws": 0, "rating": 1200, "gamesPlayed": 0, "totalPlayTime": 0, "winStreak": 0, "bestWinStreak": 0}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create games table with user references
CREATE TABLE IF NOT EXISTS games (
    id SERIAL PRIMARY KEY,
    room_code VARCHAR(6) UNIQUE,
    white_user_id INTEGER REFERENCES users(id),
    black_user_id INTEGER REFERENCES users(id),
    -- Legacy player references (for backward compatibility)
    white_player_id INTEGER,
    black_player_id INTEGER,
    pgn TEXT,
    fen TEXT,
    result VARCHAR(50), -- 'white', 'black', 'draw', 'ongoing', 'abandoned'
    game_mode VARCHAR(20) DEFAULT 'human-vs-human', -- 'human-vs-human', 'human-vs-ai'
    time_control JSONB, -- {"initial": 300, "increment": 5}
    metadata JSONB DEFAULT '{}', -- Additional game metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP
);

-- Create moves table for detailed move tracking
CREATE TABLE IF NOT EXISTS moves (
    id SERIAL PRIMARY KEY,
    game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
    move_number INTEGER NOT NULL,
    player_color CHAR(1) CHECK (player_color IN ('w', 'b')),
    move_notation VARCHAR(10) NOT NULL,
    move_data JSONB, -- Store full move object from chess.js
    time_remaining INTEGER, -- Time remaining after move (in seconds)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create user sessions for tracking active connections
CREATE TABLE IF NOT EXISTS user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    socket_id VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
);

-- Create friendships table for future social features
CREATE TABLE IF NOT EXISTS friendships (
    id SERIAL PRIMARY KEY,
    requester_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    addressee_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked', 'rejected')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(requester_id, addressee_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_games_room_code ON games(room_code);
CREATE INDEX IF NOT EXISTS idx_games_white_user ON games(white_user_id);
CREATE INDEX IF NOT EXISTS idx_games_black_user ON games(black_user_id);
CREATE INDEX IF NOT EXISTS idx_games_created_at ON games(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moves_game_id ON moves(game_id);
CREATE INDEX IF NOT EXISTS idx_moves_move_number ON moves(game_id, move_number);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_session_id ON user_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id);

-- Create functions for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_games_updated_at BEFORE UPDATE ON games
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_friendships_updated_at BEFORE UPDATE ON friendships
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert sample data for development (optional)
-- INSERT INTO users (firebase_uid, username, email, display_name, is_guest) VALUES
-- ('dev_user_1', 'testuser1', 'test1@example.com', 'Test User 1', false),
-- ('dev_user_2', 'testuser2', 'test2@example.com', 'Test User 2', false),
-- ('guest_123', 'Guest_123', '', 'Guest User', true);

-- Grant necessary permissions (adjust based on your database user)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_app_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO your_app_user;