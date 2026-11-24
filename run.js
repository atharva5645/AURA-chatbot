/**
 * AURA - Atharva's Intelligent Reminder Assistant
 * Root Runner Script
 * Concurrently starts both the Node.js Express backend and Vite React frontend.
 * Works seamlessly across Windows, macOS, and Linux without external packages.
 */

const { spawn } = require('child_process');
const path = require('path');

const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';

console.log('================================================================');
console.log('🌟 Starting AURA: Atharva’s Intelligent Reminder Assistant 🌟');
console.log('================================================================');

// 1. Start Backend Server
const backend = spawn(npmCmd, ['start'], {
  cwd: path.join(__dirname, 'backend'),
  stdio: 'pipe',
  shell: true
});

backend.stdout.on('data', (data) => {
  process.stdout.write(`[Backend] ${data}`);
});

backend.stderr.on('data', (data) => {
  process.stderr.write(`[Backend Error] ${data}`);
});

// 2. Start Frontend Vite Server
const frontend = spawn(npmCmd, ['run', 'dev'], {
  cwd: path.join(__dirname, 'frontend'),
  stdio: 'pipe',
  shell: true
});

frontend.stdout.on('data', (data) => {
  process.stdout.write(`[Frontend] ${data}`);
});

frontend.stderr.on('data', (data) => {
  process.stderr.write(`[Frontend Error] ${data}`);
});

function handleExit() {
  console.log('\nShutting down AURA servers...');
  backend.kill();
  frontend.kill();
  process.exit(0);
}

process.on('SIGINT', handleExit);
process.on('SIGTERM', handleExit);
