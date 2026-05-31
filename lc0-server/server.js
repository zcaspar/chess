/**
 * LC0 HTTP server.
 *
 * Wraps the Leela Chess Zero (lc0) UCI engine in a small HTTP API that the
 * chess app's backend calls:
 *
 *   GET  /health  -> { status: 'ok', engine: 'lc0', engineReady, weights }
 *   POST /move    -> body { fen, difficulty } -> { move: { uci, san, from, to, promotion }, responseTime, engine }
 *
 * Design notes:
 *  - The HTTP server starts listening immediately so platform healthchecks pass;
 *    the engine (and weights download) initialise in the background.
 *  - lc0 is a single long-lived UCI subprocess; requests are serialised through a
 *    mutex so UCI commands never interleave.
 *  - CORS is enabled (default: all origins) so both the backend proxy and, if
 *    ever needed, the browser can call it.
 */
const express = require('express');
const cors = require('cors');
const { Chess } = require('chess.js');
const { spawn, execFile } = require('child_process');
const fs = require('fs');

const PORT = parseInt(process.env.PORT || '3006', 10);
const LC0_PATH = process.env.LC0_PATH || '/app/lc0/lc0';
const WEIGHTS_PATH = process.env.LC0_WEIGHTS || '/app/weights.pb.gz';
const WEIGHTS_URL =
  process.env.LC0_WEIGHTS_URL ||
  'https://github.com/CSSLab/maia-chess/raw/master/maia_weights/maia-1900.pb.gz';
const LC0_BACKEND = process.env.LC0_BACKEND || ''; // empty => let lc0 auto-select
const EXTRA_ARGS = process.env.LC0_EXTRA_ARGS ? process.env.LC0_EXTRA_ARGS.split(' ') : [];

// Difficulty -> search nodes. Overridable via env (e.g. LC0_NODES_EXPERT=2000).
const NODES = {
  beginner: parseInt(process.env.LC0_NODES_BEGINNER || '1', 10),
  easy: parseInt(process.env.LC0_NODES_EASY || '10', 10),
  medium: parseInt(process.env.LC0_NODES_MEDIUM || '50', 10),
  hard: parseInt(process.env.LC0_NODES_HARD || '200', 10),
  expert: parseInt(process.env.LC0_NODES_EXPERT || '800', 10),
};

let engine = null;
let engineReady = false;
let initError = null;
const lineListeners = [];

function log(...args) {
  console.log('[lc0-server]', ...args);
}

function send(cmd) {
  if (engine && engine.stdin.writable) {
    engine.stdin.write(cmd + '\n');
  }
}

/** Send a UCI command and resolve when `predicate(line)` returns a truthy value. */
function sendAndWait(cmd, predicate, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      remove();
      reject(new Error(`UCI timeout waiting after "${cmd}"`));
    }, timeoutMs);
    const listener = (line) => {
      let result;
      try {
        result = predicate(line);
      } catch (e) {
        remove();
        reject(e);
        return;
      }
      if (result !== undefined && result !== false && result !== null) {
        remove();
        resolve(result);
      }
    };
    function remove() {
      clearTimeout(timer);
      const i = lineListeners.indexOf(listener);
      if (i >= 0) lineListeners.splice(i, 1);
    }
    lineListeners.push(listener);
    if (cmd) send(cmd);
  });
}

function downloadWeights() {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(WEIGHTS_PATH) && fs.statSync(WEIGHTS_PATH).size > 0) {
      log('Weights already present at', WEIGHTS_PATH);
      return resolve();
    }
    log('Downloading weights from', WEIGHTS_URL);
    execFile(
      'wget',
      ['--tries=3', '--timeout=120', '-q', '-O', WEIGHTS_PATH, WEIGHTS_URL],
      (err) => {
        if (err) return reject(new Error('Weights download failed: ' + err.message));
        if (!fs.existsSync(WEIGHTS_PATH) || fs.statSync(WEIGHTS_PATH).size === 0) {
          return reject(new Error('Weights download produced an empty file'));
        }
        log('Weights downloaded:', Math.round(fs.statSync(WEIGHTS_PATH).size / 1024), 'KB');
        resolve();
      },
    );
  });
}

async function startEngine() {
  await downloadWeights();

  const args = [`--weights=${WEIGHTS_PATH}`];
  if (LC0_BACKEND) args.push(`--backend=${LC0_BACKEND}`);
  args.push(...EXTRA_ARGS);

  log('Starting lc0:', LC0_PATH, args.join(' '));
  engine = spawn(LC0_PATH, args);

  let buffer = '';
  engine.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line) lineListeners.slice().forEach((l) => l(line));
    }
  });
  engine.stderr.on('data', (d) => log('lc0 stderr:', d.toString().trim()));
  engine.on('exit', (code) => {
    log('lc0 exited with code', code);
    engineReady = false;
    initError = new Error('lc0 process exited with code ' + code);
  });
  engine.on('error', (err) => {
    initError = err;
    log('lc0 spawn error:', err.message);
  });

  await sendAndWait('uci', (line) => line === 'uciok', 60000);
  await sendAndWait('isready', (line) => line === 'readyok', 60000);
  engineReady = true;
  log('Engine ready.');
}

// Serialise getBestMove calls (single UCI process).
let queue = Promise.resolve();
function getBestMove(fen, nodes) {
  const task = queue.then(async () => {
    send('position fen ' + fen);
    const uci = await sendAndWait(
      `go nodes ${nodes}`,
      (line) => (line.startsWith('bestmove ') ? line.split(/\s+/)[1] : undefined),
      60000,
    );
    return uci;
  });
  // Keep the chain going even if this task rejects.
  queue = task.catch(() => {});
  return task;
}

// ---- HTTP API ----
const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    engine: 'lc0',
    engineReady,
    weights: WEIGHTS_PATH,
    error: initError ? initError.message : undefined,
  });
});

app.get('/', (req, res) => {
  res.json({ name: 'lc0-server', engineReady, endpoints: ['/health', 'POST /move'] });
});

app.post('/move', async (req, res) => {
  const start = Date.now();
  const { fen, difficulty = 'medium' } = req.body || {};

  if (!fen) {
    return res.status(400).json({ error: 'FEN position is required' });
  }
  if (!engineReady) {
    return res.status(503).json({ error: 'Engine not ready', detail: initError ? initError.message : 'initialising' });
  }

  // Validate FEN up front.
  let chess;
  try {
    chess = new Chess(fen);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid FEN position' });
  }

  const nodes = NODES[difficulty] || NODES.medium;

  try {
    const uci = await getBestMove(fen, nodes);
    if (!uci || uci === '(none)') {
      return res.status(200).json({ move: null, message: 'No legal moves', responseTime: Date.now() - start });
    }

    const from = uci.substring(0, 2);
    const to = uci.substring(2, 4);
    const promotion = uci.length > 4 ? uci.substring(4) : undefined;

    // Derive SAN (and confirm legality) via chess.js; fall back to raw uci.
    let san = uci;
    try {
      const applied = chess.move({ from, to, promotion });
      if (applied) san = applied.san;
    } catch (_) {
      /* keep uci as san */
    }

    res.json({
      move: { uci, san, from, to, promotion },
      responseTime: Date.now() - start,
      engine: 'lc0',
      nodes,
    });
  } catch (err) {
    log('move error:', err.message);
    res.status(503).json({ error: 'Engine error', detail: err.message });
  }
});

// Start listening first so the platform healthcheck passes, then init the engine.
app.listen(PORT, () => {
  log(`HTTP server listening on port ${PORT}`);
  startEngine().catch((err) => {
    initError = err;
    log('Engine initialisation failed:', err.message);
  });
});
