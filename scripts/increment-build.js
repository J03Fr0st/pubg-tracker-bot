#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const versionFile = path.join(__dirname, '../version.json');
const packageFile = path.join(__dirname, '../package.json');

// Read current version
const version = JSON.parse(fs.readFileSync(versionFile, 'utf8'));

// Increment build number
version.build += 1;

// Create version string
const versionString = `${version.major}.${version.minor}.${version.patch}.${version.build}`;

// Update version.json
fs.writeFileSync(versionFile, JSON.stringify(version, null, 2) + '\n');

// Update package.json
const packageJson = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
packageJson.version = versionString;
fs.writeFileSync(packageFile, JSON.stringify(packageJson, null, 2) + '\n');

console.log(`Version updated to: ${versionString}`);
console.log(`Build number: ${version.build}`);

// Output for use in CI/CD
process.stdout.write(`${versionString}`);
