-- Chess App Analytics Database Schema
-- Phase 8: Statistical Dashboard & Game Review Extensions

-- Game Statistics Table
-- Stores aggregated statistics for each game for efficient querying
CREATE TABLE IF NOT EXISTS game_statistics (
    id SERIAL PRIMARY KEY,
    game_history_id INTEGER REFERENCES game_history(id) ON DELETE CASCADE,
    player_id VARCHAR(255) NOT NULL,
    
    -- Game metrics
    avg_move_time DECIMAL(10,2), -- Average time per move in seconds
    longest_think_time DECIMAL(10,2), -- Longest single move time
    time_pressure_moves INTEGER DEFAULT 0, -- Moves made under time pressure (<10s)
    
    -- Opening analysis
    opening_moves TEXT[], -- First 5 moves for opening classification
    opening_name VARCHAR(100), -- ECO code or opening name
    
    -- Game quality metrics
    game_quality_score DECIMAL(5,2), -- Overall game quality (0-100)
    decisive_moments INTEGER DEFAULT 0, -- Number of critical positions
    
    -- Performance indicators
    position_complexity_avg DECIMAL(5,2), -- Average position complexity
    material_advantage_peak DECIMAL(5,2), -- Peak material advantage
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Player Performance Table
-- Tracks historical performance metrics and trends
CREATE TABLE IF NOT EXISTS player_performance (
    id SERIAL PRIMARY KEY,
    player_id VARCHAR(255) NOT NULL,
    
    -- Time period for this performance snapshot
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    period_type VARCHAR(20) NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly')),
    
    -- Game statistics
    games_played INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    draws INTEGER DEFAULT 0,
    win_rate DECIMAL(5,2) DEFAULT 0,
    
    -- Performance by game mode
    ai_wins INTEGER DEFAULT 0,
    ai_losses INTEGER DEFAULT 0,
    ai_draws INTEGER DEFAULT 0,
    human_wins INTEGER DEFAULT 0,
    human_losses INTEGER DEFAULT 0,
    human_draws INTEGER DEFAULT 0,
    
    -- Performance by difficulty (AI games)
    beginner_wins INTEGER DEFAULT 0,
    beginner_losses INTEGER DEFAULT 0,
    easy_wins INTEGER DEFAULT 0,
    easy_losses INTEGER DEFAULT 0,
    medium_wins INTEGER DEFAULT 0,
    medium_losses INTEGER DEFAULT 0,
    hard_wins INTEGER DEFAULT 0,
    hard_losses INTEGER DEFAULT 0,
    expert_wins INTEGER DEFAULT 0,
    expert_losses INTEGER DEFAULT 0,
    
    -- Time control performance
    blitz_wins INTEGER DEFAULT 0,
    blitz_losses INTEGER DEFAULT 0,
    rapid_wins INTEGER DEFAULT 0,
    rapid_losses INTEGER DEFAULT 0,
    classical_wins INTEGER DEFAULT 0,
    classical_losses INTEGER DEFAULT 0,
    
    -- Average game metrics
    avg_game_length DECIMAL(10,2), -- Average moves per game
    avg_game_duration DECIMAL(10,2), -- Average game duration in seconds
    avg_move_time DECIMAL(10,2), -- Average time per move
    
    -- Streaks and trends
    current_win_streak INTEGER DEFAULT 0,
    current_loss_streak INTEGER DEFAULT 0,
    best_win_streak INTEGER DEFAULT 0,
    worst_loss_streak INTEGER DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Opening Statistics Table
-- Tracks performance with different openings
CREATE TABLE IF NOT EXISTS opening_statistics (
    id SERIAL PRIMARY KEY,
    player_id VARCHAR(255) NOT NULL,
    
    -- Opening identification
    opening_moves TEXT[] NOT NULL, -- First 5 moves sequence
    opening_name VARCHAR(100), -- ECO code or opening name
    color VARCHAR(1) NOT NULL CHECK (color IN ('w', 'b')), -- Color played
    
    -- Performance with this opening
    games_played INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    draws INTEGER DEFAULT 0,
    win_rate DECIMAL(5,2) DEFAULT 0,
    
    -- Average performance metrics
    avg_game_length DECIMAL(10,2),
    avg_game_duration DECIMAL(10,2),
    avg_quality_score DECIMAL(5,2),
    
    -- Last played
    last_played TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insights Cache Table
-- Stores computed insights and recommendations to avoid recalculation
CREATE TABLE IF NOT EXISTS insights_cache (
    id SERIAL PRIMARY KEY,
    player_id VARCHAR(255) NOT NULL,
    
    -- Cache key and type
    cache_key VARCHAR(255) NOT NULL,
    insight_type VARCHAR(50) NOT NULL, -- 'weakness', 'strength', 'recommendation', 'pattern'
    
    -- Cached data
    insight_data JSONB NOT NULL,
    
    -- Metadata
    game_count INTEGER, -- Number of games this insight is based on
    confidence_score DECIMAL(5,2), -- Confidence in this insight (0-100)
    
    -- Cache management
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_game_statistics_player_id ON game_statistics(player_id);
CREATE INDEX IF NOT EXISTS idx_game_statistics_game_history_id ON game_statistics(game_history_id);
CREATE INDEX IF NOT EXISTS idx_game_statistics_opening_name ON game_statistics(opening_name);

CREATE INDEX IF NOT EXISTS idx_player_performance_player_id ON player_performance(player_id);
CREATE INDEX IF NOT EXISTS idx_player_performance_period ON player_performance(player_id, period_type, period_start);

CREATE INDEX IF NOT EXISTS idx_opening_statistics_player_id ON opening_statistics(player_id);
CREATE INDEX IF NOT EXISTS idx_opening_statistics_opening ON opening_statistics(player_id, opening_name, color);
CREATE INDEX IF NOT EXISTS idx_opening_statistics_moves ON opening_statistics USING GIN(opening_moves);

CREATE INDEX IF NOT EXISTS idx_insights_cache_player_id ON insights_cache(player_id);
CREATE INDEX IF NOT EXISTS idx_insights_cache_key ON insights_cache(player_id, cache_key);
CREATE INDEX IF NOT EXISTS idx_insights_cache_expires ON insights_cache(expires_at);

-- Create triggers for updated_at columns
CREATE TRIGGER update_game_statistics_updated_at 
    BEFORE UPDATE ON game_statistics 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_player_performance_updated_at 
    BEFORE UPDATE ON player_performance 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_opening_statistics_updated_at 
    BEFORE UPDATE ON opening_statistics 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_insights_cache_updated_at 
    BEFORE UPDATE ON insights_cache 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create a view for easy dashboard queries
CREATE OR REPLACE VIEW player_dashboard_summary AS
SELECT 
    gh.player_id,
    COUNT(*) as total_games,
    SUM(CASE WHEN gh.game_outcome = 'win' THEN 1 ELSE 0 END) as wins,
    SUM(CASE WHEN gh.game_outcome = 'loss' THEN 1 ELSE 0 END) as losses,
    SUM(CASE WHEN gh.game_outcome = 'draw' THEN 1 ELSE 0 END) as draws,
    ROUND(
        (SUM(CASE WHEN gh.game_outcome = 'win' THEN 1 ELSE 0 END) * 100.0 / COUNT(*)), 2
    ) as win_rate,
    AVG(gh.move_count) as avg_moves_per_game,
    AVG(gh.game_duration) as avg_game_duration,
    AVG(gs.avg_move_time) as avg_move_time,
    MAX(gh.created_at) as last_game_date,
    COUNT(CASE WHEN gh.game_mode = 'human-vs-ai' THEN 1 END) as ai_games,
    COUNT(CASE WHEN gh.game_mode = 'human-vs-human' THEN 1 END) as human_games
FROM game_history gh
LEFT JOIN game_statistics gs ON gh.id = gs.game_history_id
GROUP BY gh.player_id;

-- Create a view for recent performance trends
CREATE OR REPLACE VIEW player_recent_performance AS
SELECT 
    player_id,
    DATE_TRUNC('day', created_at) as game_date,
    COUNT(*) as games_played,
    SUM(CASE WHEN game_outcome = 'win' THEN 1 ELSE 0 END) as wins,
    SUM(CASE WHEN game_outcome = 'loss' THEN 1 ELSE 0 END) as losses,
    SUM(CASE WHEN game_outcome = 'draw' THEN 1 ELSE 0 END) as draws,
    ROUND(
        (SUM(CASE WHEN game_outcome = 'win' THEN 1 ELSE 0 END) * 100.0 / COUNT(*)), 2
    ) as daily_win_rate
FROM game_history
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY player_id, DATE_TRUNC('day', created_at)
ORDER BY player_id, game_date DESC;