import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, extname, relative, sep } from 'node:path';
import { setupFeedback } from './feedback-http.mjs';

const root = await realpath(resolve(process.argv[2] || 'dist'));
const port = Number(process.env.PORT || 50772);
const feedback = setupFeedback(port);
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};
createServer(async (request, response) => {
  if (request.url === '/api/feedback') return feedback(request, response);
  try {
    const path = resolve(
      root,
      '.' + decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    );
    if (relative(root, path).split(sep).some((segment) => segment.startsWith('.')) ||
        (path !== root && !path.startsWith(root + sep))) throw new Error('Invalid path');
    const file = await realpath((await stat(path)).isDirectory() ? resolve(path, 'index.html') : path);
    if (!file.startsWith(root + sep) || relative(root, file).split(sep).some((segment) => segment.startsWith('.'))) {
      throw new Error('Invalid file');
    }
    const body = await readFile(file);
    response.writeHead(200, {
      'Content-Type': types[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`Local preview: http://127.0.0.1:${port}`));
