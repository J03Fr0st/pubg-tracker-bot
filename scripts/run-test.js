#!/usr/bin/env node

/**
 * Simple wrapper to run the TypeScript test script with proper argument passing
 */

const { spawn } = require('child_process');
const path = require('path');

// Get all arguments after 'node run-test.js'
const args = process.argv.slice(2);

// Path to the TypeScript script
const scriptPath = path.join(__dirname, 'test-match-flow.ts');

// Run ts-node with the script and all arguments
const child = spawn('npx', ['ts-node', scriptPath, ...args], {
  stdio: 'inherit',
  cwd: path.join(__dirname, '..'),
});

// Handle exit codes
child.on('close', (code) => {
  process.exit(code);
});

child.on('error', (error) => {
  console.error('Failed to start test script:', error.message);
  process.exit(1);
});
