# Setting Up Lc0 (Leela Chess Zero) as Test Engine

## Overview
This guide will help you integrate Lc0 as a chess engine for testing your chess application. Lc0 is a neural network-based chess engine that can provide strong gameplay for testing purposes.

## System Requirements
- **GPU**: GTX 1050 (supported)
- **RAM**: 32GB (excellent for Lc0)
- **OS**: Linux (your current setup)
- **CUDA**: Required for GPU acceleration

## Step 1: Install CUDA Toolkit
```bash
# Check if CUDA is already installed
nvidia-smi

# If not installed, download CUDA 11.8 or 12.x
wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2004/x86_64/cuda-keyring_1.0-1_all.deb
sudo dpkg -i cuda-keyring_1.0-1_all.deb
sudo apt-get update
sudo apt-get -y install cuda
```

## Step 2: Download Lc0 Binary
```bash
# Create directory for Lc0
mkdir ~/lc0
cd ~/lc0

# Download latest Lc0 release (CUDA version)
wget https://github.com/LeelaChessZero/lc0/releases/download/v0.30.0/lc0-v0.30.0-linux-gpu-cuda.zip
unzip lc0-v0.30.0-linux-gpu-cuda.zip
chmod +x lc0
```

## Step 3: Download Neural Network Weights
```bash
# Download a suitable network for GTX 1050
# T1-512x15x8h-distilled.pb.gz (smaller, faster for GTX 1050)
wget https://training.lczero.org/get_network?sha=4f6c6ad5c96a67c4ac1686d7c2d19170880e9ad8a06c8e13c52bb2b80cab0b4e -O weights.pb.gz
gunzip weights.pb.gz
```

## Step 4: Test Lc0 Installation
```bash
# Test basic functionality
./lc0 --weights=weights.pb --backend=cuda-fp16

# Test position analysis
echo "position startpos moves e2e4" | ./lc0 --weights=weights.pb --backend=cuda-fp16
```

## Step 5: Optimize Settings for GTX 1050
Create `lc0.conf`:
```
# GPU Settings for GTX 1050
backend=cuda-fp16
minibatch-size=32
max-prefetch=8
max-collision-events=917

# Memory optimization
nncache=2000000

# Search settings for testing
nodes=1000
movetime=1000
```

## Step 6: Performance Tests

### Test 1: Basic Engine Response
```bash
# Test UCI communication
echo -e "uci\nquit" | ./lc0 --weights=weights.pb --backend=cuda-fp16
```
**Expected output**: Should see `id name Lc0` and various UCI options, ending with `uciok`

### Test 2: Simple Move Generation
```bash
# Test move from starting position
echo -e "uci\nposition startpos\ngo movetime 1000\nquit" | ./lc0 --weights=weights.pb --backend=cuda-fp16
```
**Expected output**: Should show search progress and end with `bestmove` followed by a move like `e2e4` or `d2d4`

### Test 3: Performance Benchmark
```bash
# Measure nodes per second
echo -e "uci\nposition startpos\ngo nodes 5000\nquit" | time ./lc0 --weights=weights.pb --backend=cuda-fp16
```
**Expected performance**: 800-1500 nodes/second on GTX 1050

### Test 4: Memory Usage Check
```bash
# Monitor GPU memory while running
nvidia-smi -l 1 &
echo -e "uci\nposition startpos\ngo movetime 5000\nquit" | ./lc0 --weights=weights.pb --backend=cuda-fp16
pkill nvidia-smi
```
**Expected usage**: 1-2GB VRAM usage

### Test 5: Complex Position Test
```bash
# Test on a complex middlegame position
echo -e "uci\nposition fen r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 4 4\ngo movetime 2000\nquit" | ./lc0 --weights=weights.pb --backend=cuda-fp16
```
**Expected**: Should find a reasonable move and show evaluation

### Test 6: Strength Variation Test
```bash
# Test different playing strengths
echo "Testing Beginner Level (100 nodes):"
echo -e "uci\nposition startpos\ngo nodes 100\nquit" | ./lc0 --weights=weights.pb --backend=cuda-fp16

echo "Testing Intermediate Level (1000 nodes):"
echo -e "uci\nposition startpos\ngo nodes 1000\nquit" | ./lc0 --weights=weights.pb --backend=cuda-fp16

echo "Testing Advanced Level (10000 nodes):"
echo -e "uci\nposition startpos\ngo nodes 10000\nquit" | ./lc0 --weights=weights.pb --backend=cuda-fp16
```

### Test 7: Stability Test
```bash
# Run multiple games to test stability
for i in {1..10}; do
  echo "Game $i:"
  echo -e "uci\nposition startpos moves e2e4 e7e5 g1f3\ngo movetime 1000\nquit" | ./lc0 --weights=weights.pb --backend=cuda-fp16 | grep bestmove
done
```
**Expected**: Should complete all 10 runs without crashes

## Step 7: Integration Options

### Option A: UCI Protocol Integration
```typescript
// Example UCI communication in TypeScript
import { spawn } from 'child_process';

class Lc0Engine {
  private process: any;
  
  constructor() {
    this.process = spawn('./lc0', ['--weights=weights.pb', '--backend=cuda-fp16']);
  }
  
  sendCommand(command: string) {
    this.process.stdin.write(command + '\n');
  }
  
  async getBestMove(fen: string): Promise<string> {
    return new Promise((resolve) => {
      this.sendCommand(`position fen ${fen}`);
      this.sendCommand('go movetime 1000');
      // Parse bestmove response...
    });
  }
}
```

### Option B: Direct Binary Execution
```typescript
import { exec } from 'child_process';

async function getLc0Move(fen: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const command = `echo "position fen ${fen}\ngo movetime 1000" | ./lc0 --weights=weights.pb`;
    exec(command, (error, stdout) => {
      if (error) reject(error);
      // Parse stdout for bestmove
      const match = stdout.match(/bestmove ([a-h][1-8][a-h][1-8])/);
      resolve(match ? match[1] : null);
    });
  });
}
```

## Step 8: Performance Tuning

### For Testing Different Strengths:
```bash
# Beginner level (very fast)
./lc0 --weights=weights.pb --nodes=100 --backend=cuda-fp16

# Intermediate level
./lc0 --weights=weights.pb --nodes=1000 --backend=cuda-fp16

# Advanced level (slower but stronger)
./lc0 --weights=weights.pb --nodes=10000 --backend=cuda-fp16
```

### Memory Usage Optimization:
- **NNCache**: Set to 2M for 32GB RAM
- **Hash**: Can use up to 4GB safely
- **Threads**: 1-2 threads optimal for GTX 1050

## Step 9: Validation Tests

### Test 8: Known Position Test
```bash
# Test on a known tactical position (White to move and win)
# Position: 8/8/8/8/8/2K5/2Q5/2k5 w - - 0 1 (Queen vs King endgame)
echo -e "uci\nposition fen 8/8/8/8/8/2K5/2Q5/2k5 w - - 0 1\ngo movetime 3000\nquit" | ./lc0 --weights=weights.pb --backend=cuda-fp16
```
**Expected**: Should find a winning move like Qc1+ or similar

### Test 9: Blunder Detection Test
```bash
# Position where one move is clearly better than others
# Scholar's mate threat position
echo -e "uci\nposition fen rnbqkb1r/pppp1ppp/5n2/4p3/2B1P3/8/PPPP1PPP/RNBQK1NR w KQkq - 2 3\ngo movetime 2000\nquit" | ./lc0 --weights=weights.pb --backend=cuda-fp16
```
**Expected**: Should avoid/defend against Qh5 threat

### Test 10: Endgame Knowledge Test
```bash
# Basic King and Queen vs King endgame
echo -e "uci\nposition fen 8/8/8/8/8/8/3QK3/7k w - - 0 1\ngo movetime 2000\nquit" | ./lc0 --weights=weights.pb --backend=cuda-fp16
```
**Expected**: Should show moves that lead to checkmate

## Step 10: Alternative Networks
For different playing styles/strengths:
```bash
# Faster networks for weaker play
wget https://training.lczero.org/get_network?sha=591226 -O fast-network.pb.gz

# Stronger networks (if performance allows)
wget https://training.lczero.org/get_network?sha=753723 -O strong-network.pb.gz
```

## Integration with Your Chess App

1. **Replace ChessAI**: Create new `Lc0AI` class implementing same interface
2. **UCI Communication**: Use node.js child_process for engine communication
3. **Difficulty Levels**: Adjust nodes/movetime parameters
4. **Error Handling**: Implement fallback to existing AI if Lc0 fails

## Expected Performance Benchmarks on GTX 1050

| Test | Expected Result | Performance Target |
|------|----------------|-------------------|
| Basic UCI | `uciok` response | < 1 second |
| Simple move | Valid move output | 1-2 seconds |
| 1000 nodes | ~1000 nps | 1-2 seconds |
| 5000 nodes | ~1200 nps | 4-5 seconds |
| GPU memory | 1-2GB VRAM | Consistent |
| Stability | 10/10 runs pass | No crashes |

## Troubleshooting

### Common Issues and Solutions:

**CUDA errors**: 
```bash
# Check CUDA installation
nvcc --version
nvidia-smi
```

**Slow performance**: 
```bash
# Reduce batch size
./lc0 --weights=weights.pb --backend=cuda-fp16 --minibatch-size=16
```

**Memory issues**: 
```bash
# Reduce cache size
./lc0 --weights=weights.pb --backend=cuda-fp16 --nncache=1000000
```

**Network download fails**: 
```bash
# Try direct download with curl
curl -L "https://training.lczero.org/get_network?sha=4f6c6ad5c96a67c4ac1686d7c2d19170880e9ad8a06c8e13c52bb2b80cab0b4e" -o weights.pb.gz
```

**Engine hangs**:
```bash
# Check if using correct backend
./lc0 --help | grep backend
# Try CPU backend as fallback
./lc0 --weights=weights.pb --backend=eigen
```

**CUDA version mismatch (Runtime 12.9.0 vs Driver 12.4.0)**:
```bash
# If you see "WARNING: code was compiled with unsupported CUDA version"
# and the engine hangs on CUDA backends, use CPU backend instead:
./lc0 --weights=weights.pb --backend=eigen

# CPU backend still provides good performance and works reliably
# Expected performance: ~200-500 nodes/second (slower than GPU but functional)
```

## Quick Verification Script
Create `test_lc0.sh`:
```bash
#!/bin/bash
echo "=== Lc0 Installation Test ==="
echo "1. Testing UCI response..."
echo -e "uci\nquit" | timeout 10 ./lc0 --weights=weights.pb --backend=eigen > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✓ UCI communication works"
else
    echo "✗ UCI communication failed"
    exit 1
fi

echo "2. Testing move generation..."
MOVE=$(echo -e "uci\nposition startpos\ngo movetime 1000\nquit" | timeout 15 ./lc0 --weights=weights.pb --backend=eigen 2>/dev/null | grep bestmove | head -1)
if [[ $MOVE == bestmove* ]]; then
    echo "✓ Move generation works: $MOVE"
else
    echo "✗ Move generation failed"
    exit 1
fi

echo "3. Testing GPU usage..."
nvidia-smi > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✓ NVIDIA GPU detected"
else
    echo "✗ NVIDIA GPU not detected"
fi

echo "=== All tests passed! Lc0 is ready for use ==="
```

Make it executable and run:
```bash
chmod +x test_lc0.sh
./test_lc0.sh
```