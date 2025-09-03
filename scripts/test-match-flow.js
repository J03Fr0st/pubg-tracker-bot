#!/usr/bin/env node

/**
 * JavaScript wrapper for the TypeScript test script
 * This allows running the test without ts-node being globally installed
 */

const { spawn } = require('child_process');
const path = require('path');

// Get command line arguments (skip node and script name)
const args = process.argv.slice(2);

// Path to the TypeScript script
const scriptPath = path.join(__dirname, 'test-match-flow.ts');

// Spawn ts-node with the TypeScript script
const child = spawn('npx', ['ts-node', scriptPath, ...args], {
  stdio: 'inherit',
  cwd: path.join(__dirname, '..'),
});

// Handle process exit
child.on('close', (code) => {
  process.exit(code);
});

// Handle errors
child.on('error', (error) => {
  console.error('Failed to start test script:', error.message);
  process.exit(1);
});
