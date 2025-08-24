-- Head-to-Head Records Schema
-- Tracks wins, losses, and draws between specific player pairs

-- Create head_to_head_records table
CREATE TABLE IF NOT EXISTS head_to_head_records (
    id SERIAL PRIMARY KEY,
    player1_id VARCHAR(255) NOT NULL, -- Firebase UID of first player (alphabetically)
    player2_id VARCHAR(255) NOT NULL, -- Firebase UID of second player (alphabetically)
    player1_wins INTEGER DEFAULT 0,
    player2_wins INTEGER DEFAULT 0,
    draws INTEGER DEFAULT 0,
    total_games INTEGER DEFAULT 0,
    last_game_at TIMESTAMP,
    last_game_id VARCHAR(255),
    last_winner VARCHAR(255), -- Firebase UID of last game winner or 'draw'
    win_streak_player VARCHAR(255), -- Firebase UID of player on win streak
    win_streak_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure player1_id is always alphabetically before player2_id for consistency
    CONSTRAINT check_player_order CHECK (player1_id < player2_id),
    -- Ensure no duplicate pairs
    CONSTRAINT unique_player_pair UNIQUE (player1_id, player2_id)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_h2h_player1 ON head_to_head_records(player1_id);
CREATE INDEX IF NOT EXISTS idx_h2h_player2 ON head_to_head_records(player2_id);
CREATE INDEX IF NOT EXISTS idx_h2h_last_game ON head_to_head_records(last_game_at DESC);

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_h2h_updated_at 
    BEFORE UPDATE ON head_to_head_records 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Function to update head-to-head record after a game
CREATE OR REPLACE FUNCTION update_head_to_head_record(
    p_player1_id VARCHAR(255),
    p_player2_id VARCHAR(255),
    p_winner_id VARCHAR(255), -- NULL for draw
    p_game_id VARCHAR(255)
) RETURNS void AS $$
DECLARE
    v_player1_id VARCHAR(255);
    v_player2_id VARCHAR(255);
    v_winner_result VARCHAR(255);
BEGIN
    -- Ensure consistent ordering (alphabetical)
    IF p_player1_id < p_player2_id THEN
        v_player1_id := p_player1_id;
        v_player2_id := p_player2_id;
    ELSE
        v_player1_id := p_player2_id;
        v_player2_id := p_player1_id;
    END IF;
    
    -- Determine winner result
    IF p_winner_id IS NULL THEN
        v_winner_result := 'draw';
    ELSE
        v_winner_result := p_winner_id;
    END IF;
    
    -- Insert or update the record
    INSERT INTO head_to_head_records (
        player1_id, 
        player2_id, 
        player1_wins, 
        player2_wins, 
        draws, 
        total_games,
        last_game_at,
        last_game_id,
        last_winner,
        win_streak_player,
        win_streak_count
    )
    VALUES (
        v_player1_id,
        v_player2_id,
        CASE WHEN p_winner_id = v_player1_id THEN 1 ELSE 0 END,
        CASE WHEN p_winner_id = v_player2_id THEN 1 ELSE 0 END,
        CASE WHEN p_winner_id IS NULL THEN 1 ELSE 0 END,
        1,
        CURRENT_TIMESTAMP,
        p_game_id,
        v_winner_result,
        CASE WHEN p_winner_id IS NOT NULL THEN p_winner_id ELSE NULL END,
        CASE WHEN p_winner_id IS NOT NULL THEN 1 ELSE 0 END
    )
    ON CONFLICT (player1_id, player2_id) DO UPDATE SET
        player1_wins = head_to_head_records.player1_wins + 
            CASE WHEN p_winner_id = v_player1_id THEN 1 ELSE 0 END,
        player2_wins = head_to_head_records.player2_wins + 
            CASE WHEN p_winner_id = v_player2_id THEN 1 ELSE 0 END,
        draws = head_to_head_records.draws + 
            CASE WHEN p_winner_id IS NULL THEN 1 ELSE 0 END,
        total_games = head_to_head_records.total_games + 1,
        last_game_at = CURRENT_TIMESTAMP,
        last_game_id = p_game_id,
        last_winner = v_winner_result,
        win_streak_player = CASE 
            WHEN p_winner_id IS NULL THEN NULL
            WHEN p_winner_id = head_to_head_records.win_streak_player THEN p_winner_id
            ELSE p_winner_id
        END,
        win_streak_count = CASE 
            WHEN p_winner_id IS NULL THEN 0
            WHEN p_winner_id = head_to_head_records.win_streak_player THEN head_to_head_records.win_streak_count + 1
            ELSE 1
        END,
        updated_at = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;