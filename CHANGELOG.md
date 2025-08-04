# Changelog

All notable changes to the Chess App will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
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