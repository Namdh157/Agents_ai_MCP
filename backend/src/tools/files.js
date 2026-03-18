/**
 * tools/files.js — File I/O tools
 *   - read_file
 *   - write_file
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { PATH_CONSTANTS, TOOL_CONSTANTS } = require('../constants');

// Whitelisted safe directories
const SAFE_FILE_DIRS = [
  path.join(os.homedir(), 'brain-os'),
  path.join(os.homedir(), 'workspace'),
  path.join(os.homedir(), 'Documents'),
  path.join(PATH_CONSTANTS.BACKEND_ROOT, 'workspace'),
];

function isSafeFilePath(filePath) {
  const abs = path.resolve(filePath);
  return SAFE_FILE_DIRS.some(safe => abs.startsWith(safe));
}

function resolveAllowedPath(filePath) {
  const projectRoot = PATH_CONSTANTS.BACKEND_ROOT;

  // Allow absolute safe dirs
  if (isSafeFilePath(filePath)) return path.resolve(filePath);

  // Allow relative paths within project root
  const abs = path.resolve(projectRoot, filePath);
  if (abs.startsWith(projectRoot)) return abs;

  return null;
}

async function read_file({ file_path, encoding = 'utf8' }) {
  const absPath = resolveAllowedPath(file_path);
  if (!absPath) {
    return { error: `Path not allowed: "${file_path}". Must be within project or workspace directories.` };
  }

  try {
    if (!fs.existsSync(absPath)) return { error: `File not found: ${file_path}` };

    const stat = fs.statSync(absPath);
    if (stat.size > TOOL_CONSTANTS.FILE_MAX_SIZE_BYTES) {
      return { error: `File too large (${Math.round(stat.size / 1024)}KB). Max 512KB.` };
    }

    const content = fs.readFileSync(absPath, encoding);
    const truncated = encoding === 'utf8' && content.length > TOOL_CONSTANTS.FILE_CONTENT_PREVIEW_LENGTH;

    return {
      path: absPath,
      size: stat.size,
      content: truncated ? content.slice(0, TOOL_CONSTANTS.FILE_CONTENT_PREVIEW_LENGTH) : content,
      truncated,
    };
  } catch (e) {
    return { error: `Read error: ${e.message}` };
  }
}

async function write_file({ file_path, content, mode = 'overwrite' }) {
  const absPath = resolveAllowedPath(file_path);
  if (!absPath) {
    return { error: `Path not allowed: "${file_path}".` };
  }

  try {
    const dir = path.dirname(absPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (mode === 'append') {
      fs.appendFileSync(absPath, content, 'utf8');
    } else {
      fs.writeFileSync(absPath, content, 'utf8');
    }

    return { ok: true, path: absPath, mode, bytes_written: content.length };
  } catch (e) {
    return { error: `Write error: ${e.message}` };
  }
}

module.exports = { read_file, write_file };