// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
/**
 * JWT Secrets Fix Migration
 * 
 * This migration fixes JWT_SECRET and ENCRYPTION_SECRET placeholders in .env files
 * and ensures JWT_EXPIRE is set to 24h for consistent token expiration.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dotenv = require('dotenv');

const generateSecureKey = (bytes = 32) => {
  return crypto.randomBytes(bytes).toString('hex');
};

/**
 * Fix JWT secrets in the specified .env file
 * @param {string} envFilePath - Path to the .env file
 * @returns {boolean} Whether the fix was successful
 */
const fixJwtSecrets = (envFilePath) => {
  console.log(`[Migration: 000_fix_jwt_secrets] Checking JWT secrets in ${envFilePath}`);
  
  try {
    let envContent;
    try {
      envContent = fs.readFileSync(envFilePath, 'utf8');
    } catch (readErr) {
      if (readErr.code === 'ENOENT') {
        console.error('[Migration: 000_fix_jwt_secrets] File not found: %s', envFilePath);
        return false;
      }
      throw readErr;
    }
    const envVars = dotenv.parse(envContent);
    
    let updated = false;
    
    if (!envVars.JWT_SECRET || 
        envVars.JWT_SECRET === 'change_this_to_a_secure_random_string' ||
        envVars.JWT_SECRET === '${JWT_SECRET_PLACEHOLDER}' ||
        envVars.JWT_SECRET.includes('$(openssl') ||
        envVars.JWT_SECRET.length < 32) {
      console.log('[Migration: 000_fix_jwt_secrets] Generating new JWT_SECRET');
      envVars.JWT_SECRET = generateSecureKey();
      updated = true;
    }
    
    if (!envVars.ENCRYPTION_SECRET || 
        envVars.ENCRYPTION_SECRET === 'change_this_to_a_secure_32_char_string' ||
        envVars.ENCRYPTION_SECRET === '${ENCRYPTION_SECRET_PLACEHOLDER}' ||
        envVars.ENCRYPTION_SECRET.includes('$(openssl') ||
        envVars.ENCRYPTION_SECRET.length < 32) {
      console.log('[Migration: 000_fix_jwt_secrets] Generating new ENCRYPTION_SECRET');
      envVars.ENCRYPTION_SECRET = generateSecureKey();
      updated = true;
    }
    
    // Check JWT_EXPIRE
    if (!envVars.JWT_EXPIRE || envVars.JWT_EXPIRE !== '24h') {
      console.log('[Migration: 000_fix_jwt_secrets] Setting JWT_EXPIRE to 24h');
      envVars.JWT_EXPIRE = '24h';
      updated = true;
    }
    
    if (updated) {
      const backupPath = `${envFilePath}.backup-${Date.now()}`;
      fs.copyFileSync(envFilePath, backupPath);
      console.log(`[Migration: 000_fix_jwt_secrets] Created backup at ${backupPath}`);
      
      const newEnvContent = Object.entries(envVars)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
      
      fs.writeFileSync(envFilePath, newEnvContent);
      console.log('[Migration: 000_fix_jwt_secrets] Successfully updated environment variables');
      
      process.env.JWT_SECRET = envVars.JWT_SECRET;
      process.env.ENCRYPTION_SECRET = envVars.ENCRYPTION_SECRET;
      process.env.JWT_EXPIRE = envVars.JWT_EXPIRE;
      
      return true;
    } else {
      console.log('[Migration: 000_fix_jwt_secrets] No changes needed - JWT secrets are already properly configured');
      return true;
    }
  } catch (error) {
    console.error('[Migration: 000_fix_jwt_secrets] Error fixing JWT secrets:', error);
    console.error('Detailed error:', error.stack || error);
    return false;
  }
};

/**
 * Fix JWT secrets in all .env files
 */
const fixAllJwtSecrets = () => {
  console.log('[Migration: 000_fix_jwt_secrets] Starting JWT secrets fix');
  
  const cwd = process.cwd();
  
  const envFiles = [
    path.join(cwd, '.env'),
    path.join(cwd, '.env.production'),
    path.join(cwd, '.env.local')
  ];
  
  let successCount = 0;
  
  for (const envFile of envFiles) {
    if (fs.existsSync(envFile)) {
      const success = fixJwtSecrets(envFile);
      if (success) successCount++;
    }
  }
  
  console.log(`[Migration: 000_fix_jwt_secrets] Processed ${successCount} environment files`);
  return successCount > 0;
};

module.exports = {
  runMigration: fixAllJwtSecrets, 
  fixJwtSecrets, 
  generateSecureKey 
};
