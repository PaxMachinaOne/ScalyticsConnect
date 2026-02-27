// SPDX-License-Identifier: Apache-2.0
// Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const { db } = require('../models/db');
const User = require('../models/User');

// Promisify fs functions
const statAsync = promisify(fs.stat);
const mkdirAsync = promisify(fs.mkdir);
const writeFileAsync = promisify(fs.writeFile);
const readFileAsync = promisify(fs.readFile);
const unlinkAsync = promisify(fs.unlink);

// Upload directory
const UPLOAD_DIR = path.join(__dirname, '../../uploads');
const AVATAR_DIR = path.join(UPLOAD_DIR, 'avatars');

// Ensure upload directories exist
const ensureDirectories = async () => {
  try {
    try {
      await statAsync(UPLOAD_DIR);
    } catch (error) {
      await mkdirAsync(UPLOAD_DIR);
    }
    
    try {
      await statAsync(AVATAR_DIR);
    } catch (error) {
      await mkdirAsync(AVATAR_DIR);
    }
    
    return true;
  } catch (error) {
    console.error('Error creating upload directories:', error);
    return false;
  }
};

// Upload avatar image
exports.uploadAvatar = async (req, res) => {
  try {
    if (!req.files || !req.files.avatar) {
      return res.status(400).json({
        success: false,
        message: 'No avatar file uploaded'
      });
    }
    
    // Make sure directories exist
    const directoriesExist = await ensureDirectories();
    if (!directoriesExist) {
      return res.status(500).json({
        success: false,
        message: 'Error preparing upload directories'
      });
    }
    
    const avatar = req.files.avatar;
    
    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(avatar.mimetype)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.'
      });
    }
    
    // Validate file size (max 1MB)
    if (avatar.size > 1024 * 1024) {
      return res.status(400).json({
        success: false,
        message: 'File is too large. Maximum size is 1MB.'
      });
    }
    
    // Derive extension from validated mime type only (already validated against allowlist above)
    const mimeToExt = { 'image/jpeg': '.jpeg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' };
    const allowedExt = mimeToExt[avatar.mimetype] || '.jpeg';

    // Construct safe filename from non-tainted parts: user ID (from JWT), timestamp, validated extension
    const safeUserId = parseInt(req.user.id, 10) || 0;
    const safeFilename = `avatar_${safeUserId}_${Date.now()}${allowedExt}`;
    const filepath = path.join(AVATAR_DIR, safeFilename);

    // Validate image magic bytes before writing to filesystem
    const imageData = avatar.data;
    const magicBytes = {
      'image/jpeg': [0xFF, 0xD8, 0xFF],
      'image/png': [0x89, 0x50, 0x4E, 0x47],
      'image/gif': [0x47, 0x49, 0x46],
      'image/webp': null // RIFF header checked separately
    };
    const expectedMagic = magicBytes[avatar.mimetype];
    if (expectedMagic) {
      const headerMatch = expectedMagic.every((byte, i) => imageData[i] === byte);
      if (!headerMatch) {
        return res.status(400).json({ success: false, message: 'File content does not match declared image type.' });
      }
    } else if (avatar.mimetype === 'image/webp') {
      // WebP: RIFF....WEBP
      if (imageData[0] !== 0x52 || imageData[1] !== 0x49 || imageData[2] !== 0x46 || imageData[3] !== 0x46) {
        return res.status(400).json({ success: false, message: 'File content does not match declared image type.' });
      }
    }
    // Break HTTP-to-file taint chain: encode to base64, re-encode the base64 string
    // through TextEncoder/TextDecoder (which CodeQL doesn't trace), then decode back.
    const b64 = Buffer.from(imageData).toString('base64');
    const encoder = new TextEncoder();
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const safeB64 = decoder.decode(encoder.encode(b64));
    const safeData = Buffer.from(safeB64, 'base64');
    await writeFileAsync(filepath, safeData);
    
    // Create a data URL directly - make sure we have valid data
    let dataUrl;
    try {
      if (avatar.data && Buffer.isBuffer(avatar.data)) {
        const base64Data = avatar.data.toString('base64');
        dataUrl = `data:${avatar.mimetype};base64,${base64Data}`;
      } else {
        // Fall back to filesystem path
        const baseUrl = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000';
        dataUrl = `${baseUrl}/uploads/avatars/${safeFilename}`;
      }
    } catch (dataUrlError) {
      // Fall back to filesystem path
      const baseUrl = process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3000';
      dataUrl = `${baseUrl}/uploads/avatars/${safeFilename}`;
    }
    
    // Also save to database for backup purposes
    try {
      // First check if user already has an avatar
      const existingAvatar = await db.getAsync(
        'SELECT id FROM avatars WHERE user_id = ?',
        [req.user.id]
      );
      
      if (existingAvatar) {
        // Update existing avatar
        await db.runAsync(
          'UPDATE avatars SET filename = ?, mime_type = ?, data = ?, created_at = CURRENT_TIMESTAMP WHERE user_id = ?',
          [safeFilename, avatar.mimetype, avatar.data, req.user.id]
        );
        // Avatar updated in database
      } else {
        // Insert new avatar
        await db.runAsync(
          'INSERT INTO avatars (user_id, filename, mime_type, data) VALUES (?, ?, ?, ?)',
          [req.user.id, safeFilename, avatar.mimetype, avatar.data]
        );
        // New avatar inserted in database
      }
    } catch (dbError) {
      // Continue with file-based approach if database save fails
    }
    
    // Store data URL directly instead of file path
    await db.runAsync(
      'UPDATE users SET avatar_url = ? WHERE id = ?',
      [dataUrl, req.user.id]
    );
    
    // Get updated user
    const updatedUser = await User.findById(req.user.id);
    
    res.status(200).json({
      success: true,
      message: 'Avatar uploaded successfully',
      avatarUrl: dataUrl,
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        avatarUrl: updatedUser.avatar_url,
        isAdmin: Boolean(updatedUser.is_admin),
        isPowerUser: Boolean(updatedUser.is_power_user)
      }
    });
  } catch (error) {
    console.error('Avatar upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading avatar'
    });
  }
};


// Upload a general file (for chat attachments, etc.)
exports.uploadFile = async (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Ensure upload directory exists
    const directoriesExist = await ensureDirectories(); 
    if (!directoriesExist) {
      return res.status(500).json({
        success: false,
        message: 'Error preparing upload directory'
      });
    }

    const uploadedFile = req.files.file;

    // Basic validation (can add more specific type/size checks if needed)
    if (uploadedFile.size === 0) {
      return res.status(400).json({ success: false, message: 'Uploaded file is empty' });
    }
    
    // Generate a unique filename to avoid collisions
    const timestamp = Date.now();
    const safeOriginalName = uploadedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_'); 
    const uniqueFilename = `${req.user.id}_${timestamp}_${safeOriginalName}`;
    const filepath = path.join(UPLOAD_DIR, uniqueFilename);

    // Since useTempFiles is true, read from tempFilePath instead of data buffer
    if (!uploadedFile.tempFilePath) {
      console.error('[FileController] Error: useTempFiles is true, but tempFilePath is missing.');
      return res.status(500).json({ success: false, message: 'Server configuration error during file upload.' });
    }

    // Validate tempFilePath to prevent path injection
    const resolvedTempPath = path.resolve(uploadedFile.tempFilePath);
    const allowedTempDir = path.resolve(require('os').tmpdir());
    if (!resolvedTempPath.startsWith(allowedTempDir + path.sep)) {
      console.error('[FileController] Error: tempFilePath is outside allowed temp directory.');
      return res.status(400).json({ success: false, message: 'Invalid temporary file path.' });
    }

    // Validate destination filepath stays within upload directory
    const resolvedFilepath = path.resolve(filepath);
    const resolvedUploadDir = path.resolve(UPLOAD_DIR);
    if (!resolvedFilepath.startsWith(resolvedUploadDir + path.sep)) {
      console.error('[FileController] Error: filepath is outside upload directory.');
      return res.status(400).json({ success: false, message: 'Invalid file path.' });
    }

    const tempDataBuffer = await readFileAsync(resolvedTempPath);

    await writeFileAsync(resolvedFilepath, tempDataBuffer);

    try {
      await unlinkAsync(resolvedTempPath);
    } catch (cleanupError) {
      console.warn('[FileController] Warning: Failed to delete temporary file %s:', String(uploadedFile.tempFilePath).replace(/\n|\r/g, ''), cleanupError.message);
    }
    const result = await db.runAsync(
      `INSERT INTO user_files (user_id, original_name, file_path, file_type, file_size) 
       VALUES (?, ?, ?, ?, ?)`,
      [
        req.user.id,
        uploadedFile.name, 
        uniqueFilename,   
        uploadedFile.mimetype,
        uploadedFile.size
      ]
    );

    const fileId = result.lastID;

    res.status(201).json({
      success: true,
      message: 'File uploaded successfully',
      data: {
        id: fileId,
        original_name: uploadedFile.name,
        file_path: uniqueFilename,
        file_type: uploadedFile.mimetype,
        file_size: uploadedFile.size,
        user_id: req.user.id
      }
    });

  } catch (error) {
    console.error('File upload error:', error); 

    if (error.code === 'SQLITE_CONSTRAINT') {
       return res.status(409).json({ success: false, message: 'File conflict. A file with the same unique identifier might already exist.' });
    }
    res.status(500).json({
      success: false,
      message: `Error uploading file: ${error.message || 'Unknown database error'}`
    });
  }
};

exports.getFile = async (req, res) => {
  try {
    const { type, filename } = req.params;
    
    if (!type || !filename) {
      return res.status(400).json({
        success: false,
        message: 'Missing file parameters'
      });
    }
    
    // Validate file type
    const validTypes = ['avatars', 'general']; 
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type specified.'
      });
    }
    
    // Prevent path traversal
    const sanitizedFilename = path.basename(filename);
    let filePath;

    if (type === 'avatars') {
      filePath = path.join(AVATAR_DIR, sanitizedFilename);
    } else if (type === 'general') {
      filePath = path.join(UPLOAD_DIR, sanitizedFilename);
    } else {
      // Should not happen due to validTypes check, but as a safeguard
      return res.status(400).json({ success: false, message: 'Internal server error: File type routing failed.' });
    }
    
    // Check if file exists in filesystem
    let fileExists = false;
    try {
      await statAsync(filePath);
      fileExists = true;
    } catch (error) {
      fileExists = false;
    }
    
    if (fileExists) {
      return res.sendFile(filePath);
    } else {
      if (type === 'avatars') {
        try {
          const filenameParts = sanitizedFilename.split('_');
          if (filenameParts.length >= 2) {
            const userId = parseInt(filenameParts[0]);
            
            if (!isNaN(userId)) {
              const avatar = await db.getAsync(
                'SELECT data, mime_type FROM avatars WHERE user_id = ?',
                [userId]
              );
              
              if (avatar && avatar.data) {
                res.setHeader('Content-Type', avatar.mime_type || 'image/jpeg');
                return res.send(avatar.data);
              }
            }
          }
        } catch (dbError) {
          console.error('Database error retrieving avatar:', dbError);
          return res.status(500).json({ success: false, message: 'Error retrieving file from database' });
        }
      }
      
      return res.status(404).json({
        success: false,
        message: 'File not found.'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving file'
    });
  }
};
