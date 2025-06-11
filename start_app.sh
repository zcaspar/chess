#!/bin/bash

# Chess App Startup Script
# This script starts the React frontend
# Note: The app uses a simulated chess engine by default
# For real LC0 integration, you would need to implement a backend server

echo "Starting Chess App..."

# Function to cleanup processes on exit
cleanup() {
    echo "Shutting down..."
    kill $APP_PID 2>/dev/null
    exit 0
}

# Set up trap to cleanup on script exit
trap cleanup SIGINT SIGTERM EXIT

# Start the React app
echo "Starting React app..."
npm start &
APP_PID=$!

echo "✓ Chess app is starting..."
echo "✓ React app starting (PID: $APP_PID)"
echo ""
echo "The app uses a simulated chess engine by default."
echo "LC0 integration would require a backend server (not implemented)."
echo ""
echo "Press Ctrl+C to stop the application"

# Wait for React app to finish (or be interrupted)
wait $APP_PID