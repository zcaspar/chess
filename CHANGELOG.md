# Changelog

All notable changes to the Chess App will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Chess Variants System** - Nuclear chess, teleportation, and feature toggle management (2025-08-23)
  - **Feature**: Comprehensive special moves system with easy management via feature toggles
  - **Nuclear Chess**: Integrated from nuclear-chess branch - destroy opponent pieces (excluding King/Queen) once per game
  - **Teleportation**: New variant allowing pieces to randomly relocate to empty squares once per game  
  - **Feature Toggles**: Centralized configuration system for easy feature removal or testing
  - **Justification**: Users requested exciting chess variants while maintaining ability to revert to traditional chess experience
  - **Implementation**:
    - Created `/src/config/gameFeatures.ts` for centralized feature management with boolean flags
    - Enhanced GameContext with nuclear and teleportation state management and validation functions
    - Updated GameControls with color-coded variant UI (orange nuclear, purple teleportation, green hints)
    - Modified ChessBoard to handle special move interactions with visual feedback systems
    - All variants restricted to human-vs-human games, first 10 moves, one use per player
    - Build-time optimization removes disabled features from bundle for performance
  - **Files Added/Modified**:
    - `src/config/gameFeatures.ts` - NEW: Central feature management configuration
    - `src/contexts/GameContext.tsx` - Added nuclear/teleportation state and game logic
    - `src/components/GameControls/GameControls.tsx` - Added variant-specific UI components
    - `src/components/ChessBoard/ChessBoard.tsx` - Enhanced board interactions for special moves
    - `CLAUDE.md` - Updated documentation for Phase 11: Chess Variants & Special Moves
  - **User Experience**: Players can now use exciting chess variants for casual fun, with easy toggle system allowing administrators to disable features for tournaments or traditional play

- **AI vs AI Game Mode** - Watch computer players compete against each other (2025-08-04)
  - **Feature**: Added new game mode where users can watch AI play against itself with different difficulty levels
  - **Justification**: Users wanted to observe high-level chess gameplay and learn from AI strategies without having to play themselves
  - **Implementation**: 
    - Added 'ai-vs-ai' game mode type to GameContext with separate difficulty settings for white and black AI
    - Implemented automatic move scheduling system that alternates between white and black AI moves
    - Added pause/resume functionality to control the AI game flow
    - Enhanced GameModeSelector with separate difficulty controls for each AI player
    - Added dedicated AI vs AI controls in GameControls component with pause/resume buttons
    - AI moves are scheduled with 2-second delays for better viewing experience
    - Supports all 5 difficulty levels (Beginner ~800 to Expert ~3400+ ELO) for each AI
  - **Files Added/Modified**:
    - `src/contexts/GameContext.tsx` - Added AI vs AI game logic, state management, and move scheduling
    - `src/components/GameModeSelector/GameModeSelector.tsx` - Added AI vs AI mode selection with dual difficulty controls
    - `src/components/GameControls/GameControls.tsx` - Added pause/resume controls for AI games
  - **User Experience**: Users can now select different difficulty combinations (e.g., Expert vs Beginner) and watch AI games unfold, learning strategies and opening patterns from high-level play

### Fixed
- **Vercel Preview URL CORS Issues** - Fixed NetworkError when accessing app through Vercel preview URLs (2025-08-04)
  - **Issue**: Users getting "NetworkError when attempting to fetch resource" and CORS errors when trying to sign in with Google from Vercel preview URLs like `chess-pu71-git-master-caspars-projects-ada039ca.vercel.app`
  - **Root Cause**: Railway backend CORS was configured to only accept requests from the main production domain `chess-pu71.vercel.app`, blocking all preview deployment URLs
  - **Solution**: Enhanced backend CORS configuration to support multiple origins with wildcard patterns, allowing both production and preview URLs
  - **Files Changed**: 
    - `backend-src/server.ts` - Modified CORS configuration to accept comma-separated origins with wildcard support
    - `CLAUDE.md` - Added troubleshooting section explaining the issue and recommended URL usage
  - **Justification**: Users often access the app through preview URLs during development/testing, and authentication failures create confusion. This fix ensures the app works from any Vercel deployment URL while maintaining security

- **Game Replay PGN Parsing Errors** - Fixed "Unable to parse PGN" errors preventing game replay viewing (2025-08-04)
  - **Issue**: Users getting "Failed to load game replay: Unable to parse PGN" error when trying to view saved games, with PGN preview showing standard chess headers like `[Event "?"] [Site "?"]`
  - **Root Cause**: The GameReplay component's PGN parsing logic couldn't handle standard chess.js PGN format which includes metadata headers. The parsing would fail when encountering these headers, even though the move data was present
  - **Solution**: Enhanced PGN parsing with multiple fallback approaches and improved PGN generation to create cleaner formats
  - **Technical Details**:
    - Improved header removal regex to properly strip `[Event "?"]` style metadata while preserving moves
    - Enhanced cleaning logic to handle various PGN formats (with/without headers, different whitespace patterns)
    - Modified GameContext PGN generation to create minimal PGNs without unnecessary headers for future games
    - Added comprehensive logging to diagnose parsing failures
    - Added fallback to display final board position even when moves cannot be parsed
  - **Files Changed**: 
    - `src/components/GameReplay/GameReplay.tsx` - Enhanced PGN parsing with better header handling and multiple parsing approaches
    - `src/contexts/GameContext.tsx` - Modified PGN generation to create cleaner format without headers
  - **Justification**: Game replay is a critical feature for learning and analysis. Users were completely unable to review their completed games due to parsing errors, making the feature unusable despite games being properly saved

- **Game Replay Move History** - Fixed issue where saved games were not showing complete move history (2025-01-27)
  - **Issue**: When replaying saved games, only the last few moves or no moves at all were being displayed, despite games having many more moves
  - **Root Cause**: The PGN generation logic in `GameContext.tsx` was using `gameState.game.pgn()` which often didn't contain the complete game history. This happened because the chess.js game object was sometimes recreated from FEN positions during moves, losing the historical move context
  - **Solution**: Modified PGN generation to always reconstruct the complete game from `gameState.history` array which maintains the full move list throughout the game
  - **Files Changed**: 
    - `src/contexts/GameContext.tsx` - Rewrote PGN generation logic to use gameState.history as primary source
    - `src/components/GameReplay/GameReplay.tsx` - Made regex parsing more resilient for older games
  - **Justification**: Users were unable to review their complete games, which is essential for learning and analysis. This fix ensures all moves are properly saved and can be replayed

## [1.0.0] - 2025-01-27

### Added
- **Hero Board Design** - Transformed chess board into prominent hero element
  - **Justification**: Enhanced visual hierarchy and user engagement by making the game board the focal point
  - Increased board size from 500px to 600px
  - Added multi-layered stage effect with elevation
  - Implemented glassmorphism sidebars
  - Added decorative corner pieces

### Enhanced
- **Move History Display** - Expanded capacity and added auto-scrolling
  - **Justification**: Users complained about only seeing 10 moves when games often have 30+ moves
  - Increased display height from ~200px to 600px
  - Added auto-scrolling to keep current move in view
  - Shows move counter when total moves exceed 10

### Added
- **Drag and Drop Movement** - Full drag-and-drop functionality for pieces
  - **Justification**: Modern chess applications support both click and drag movement patterns, improving user experience
  - Implemented alongside existing click-to-move
  - Added visual feedback during drag
  - Turn validation prevents dragging opponent's pieces
  - Enhanced with grab/grabbing cursors

## [0.9.0] - 2025-01-12

### Fixed
- **Game Replay System** - Complete overhaul and bug fixes
  - **Justification**: Critical white screen bug was preventing users from viewing their game history
  - Fixed PGN parsing white screen bug
  - Enhanced with 6-tier parsing fallback system
  - Added comprehensive debug tools
  - Fixed PGN generation to capture complete history

### Added
- **Board Customization** - New visual options
  - **Justification**: Users requested more personalization options to make the game feel more engaging
  - Fixed piece style CSS selectors
  - Added new "Lego" piece style
  - Corrected LC0 ELO rating display

- **Board Orientation** - Flip board functionality
  - **Justification**: Players playing as black wanted to view the board from their perspective
  - Purple flip board button
  - User preference persistence
  - Support for black's perspective

### Removed
- **UI Cleanup** - Removed empty components
  - **Justification**: Streamlined interface by removing non-functional "Players & Statistics" box
  - Cleaner, more focused gameplay experience

## [0.8.1] - 2025-01-09

### Added
- **LC0 Position Analysis** - Expert-level analysis in game replay
  - **Justification**: Players wanted to improve by understanding optimal moves in their completed games
  - LC0-powered move suggestions
  - Visual highlighting of best moves
  - ~3400 ELO strength analysis

## [0.8.0] - 2025-01-09

### Added
- **Statistical Dashboard** - Comprehensive analytics
  - **Justification**: Players wanted to track their improvement and performance over time
  - Win/loss/draw statistics
  - Performance charts
  - Game history analytics

## [0.7.0] - 2025-01-08

### Added
- **Comprehensive Testing Suite** - 104+ tests
  - **Justification**: Ensure stability and catch regressions as the codebase grows
  - Unit tests for components
  - Integration tests
  - Game logic validation

## [0.6.5] - 2025-01-06

### Added
- **Online Multiplayer** - Complete implementation
  - **Justification**: Core feature for playing with friends remotely
  - WebSocket-based real-time gameplay
  - Room system for private games
  - Reconnection support

## [0.6.0] - 2025-01-05

### Fixed
- **Firebase Authentication** - Production fixes
  - **Justification**: Google Sign-In was not working in production deployment
  - Fixed CORS configuration
  - Updated environment variables
  - Resolved Firebase project setup

## [0.5.0] - 2025-01-04

### Added
- **Deployment** - Production infrastructure
  - **Justification**: Make the app publicly accessible
  - Frontend on Vercel
  - Backend on Railway
  - Database on PostgreSQL

## [0.4.0] - 2025-01-03

### Added
- **Online Multiplayer** - Initial implementation
  - **Justification**: Enable remote play between users
  - Database integration
  - Game persistence
  - Basic room system

## [0.3.5] - 2025-01-02

### Added
- **User Authentication** - Firebase/Google integration
  - **Justification**: Required for personalized features and online play
  - Google Sign-In
  - User profiles
  - Authentication flow

## [0.3.0] - 2025-01-01

### Added
- **Computer Opponent** - LC0 integration
  - **Justification**: Allow single-player gameplay against world-class AI
  - ~3400 ELO strength
  - 5 difficulty levels
  - Neural network based

## [0.2.0] - 2024-12-30

### Added
- **Core Chess Functionality** - Complete chess engine
  - **Justification**: Foundation for all gameplay features
  - Move validation
  - Game state management
  - Chess rules implementation

## [0.1.0] - 2024-12-28

### Added
- **Initial MVP** - Basic chess board
  - **Justification**: Starting point for the application
  - React setup
  - Board rendering
  - Basic piece movement