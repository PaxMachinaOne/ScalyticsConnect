// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const frontendDir = path.join(rootDir, 'frontend');
const buildDir = path.join(frontendDir, 'build');

if (!fs.existsSync(path.join(frontendDir, 'package.json'))) {
  console.error('❌ package.json not found in frontend directory!');
  process.exit(1);
}

function run(command) {
  console.log(`Running: ${command}`);
  execSync(command, { stdio: 'inherit', cwd: frontendDir });
}

try {
  run('npm ci');
  run('npm run build');
} catch (error) {
  console.error(`❌ Build failed: ${error.message}`);
  process.exit(1);
}

for (const artifact of [buildDir, path.join(buildDir, 'index.html'), path.join(buildDir, 'static')]) {
  if (!fs.existsSync(artifact)) {
    console.error(`❌ Missing build output: ${artifact}`);
    process.exit(1);
  }
}

console.log(`✅ Build completed successfully in: ${buildDir}`);
