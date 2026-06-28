/**
 * 零依赖 Node.js 静态文件服务器
 * 仅使用 Node.js 内置模块，无需任何外部依赖
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.DEPLOY_RUN_PORT || '5000', 10);
const ROOT = process.env.COZE_WORKSPACE_PATH || __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.wasm': 'application/wasm',
};

const CACHE_MAX_AGE = {
  '.html': 0,
  '.css': 3600,
  '.js': 3600,
  '.png': 86400,
  '.jpg': 86400,
  '.jpeg': 86400,
  '.gif': 86400,
  '.svg': 86400,
  '.ico': 86400,
  '.webp': 86400,
  '.woff': 604800,
  '.woff2': 604800,
  '.ttf': 604800,
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

function getCacheControl(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const maxAge = CACHE_MAX_AGE[ext];
  if (maxAge === undefined || maxAge === 0) {
    return 'no-cache, no-store, must-revalidate';
  }
  return `public, max-age=${maxAge}`;
}

function sanitizePath(urlPath) {
  // 解码 URL 并防止路径遍历攻击
  let safePath = path.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, '');
  // 移除查询参数
  safePath = safePath.split('?')[0];
  return safePath;
}

const server = http.createServer((req, res) => {
  const urlPath = sanitizePath(req.url);
  
  // 默认首页
  let filePath = path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath);
  
  // 安全检查：确保文件在 ROOT 目录内
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(path.resolve(ROOT))) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err) {
      // 文件不存在，尝试 index.html（用于 SPA 路由）
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('500 Internal Server Error');
      }
      return;
    }

    if (stats.isDirectory()) {
      // 目录请求尝试 index.html
      filePath = path.join(filePath, 'index.html');
      fs.stat(filePath, (err2, stats2) => {
        if (err2) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('404 Not Found');
          return;
        }
        serveFile(filePath, stats2, res);
      });
    } else {
      serveFile(filePath, stats, res);
    }
  });
});

function serveFile(filePath, stats, res) {
  const mimeType = getMimeType(filePath);
  const cacheControl = getCacheControl(filePath);
  
  const headers = {
    'Content-Type': mimeType,
    'Content-Length': stats.size,
    'Cache-Control': cacheControl,
    'Access-Control-Allow-Origin': '*',
  };

  // 支持 Range 请求（视频等大文件）
  const range = res.req.headers.range;
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      ...headers,
      'Content-Range': `bytes ${start}-${end}/${stats.size}`,
      'Content-Length': chunkSize,
      'Accept-Ranges': 'bytes',
    });

    const stream = fs.createReadStream(filePath, { start, end });
    stream.pipe(res);
    stream.on('error', () => {
      res.end();
    });
    return;
  }

  res.writeHead(200, headers);
  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
  stream.on('error', () => {
    res.end();
  });
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] Static file server running at http://0.0.0.0:${PORT}`);
  console.log(`[server] Serving files from: ${ROOT}`);
});

// 优雅退出
process.on('SIGTERM', () => {
  console.log('[server] Received SIGTERM, shutting down...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('[server] Received SIGINT, shutting down...');
  server.close(() => process.exit(0));
});
