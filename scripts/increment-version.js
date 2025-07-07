#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const versionFile = path.join(__dirname, '../version.json');
const packageFile = path.join(__dirname, '../package.json');

const versionType = process.argv[2];

if (!versionType || !['major', 'minor', 'patch'].includes(versionType)) {
  console.error('Usage: node increment-version.js <major|minor|patch>');
  process.exit(1);
}

// Read current version
const version = JSON.parse(fs.readFileSync(versionFile, 'utf8'));

// Increment version based on type
switch (versionType) {
  case 'major':
    version.major += 1;
    version.minor = 0;
    version.patch = 0;
    version.build = 0;
    break;
  case 'minor':
    version.minor += 1;
    version.patch = 0;
    version.build = 0;
    break;
  case 'patch':
    version.patch += 1;
    version.build = 0;
    break;
}

// Create version string
const versionString = `${version.major}.${version.minor}.${version.patch}`;

// Update version.json
fs.writeFileSync(versionFile, JSON.stringify(version, null, 2) + '\n');

// Update package.json
const packageJson = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
packageJson.version = versionString;
fs.writeFileSync(packageFile, JSON.stringify(packageJson, null, 2) + '\n');

console.log(`Version updated to: ${versionString}`);
console.log(`${versionType} version incremented`);
console.log(`Build number reset to: ${version.build}`);

// Output for use in scripts
process.stdout.write(`${versionString}`);