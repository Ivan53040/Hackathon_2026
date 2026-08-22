import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { readFile, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_NAME = 'backend tracking test';
const APP_VERSION = '1.4.0';
const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC_DIR = resolve(ROOT, 'public');
const HOST = process.env.TRACKING_HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 4180);

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.wasm', 'application/wasm'],
  ['.webp', 'image/webp'],
]);

function sendJson(response, status, body) {
  const payload = Buffer.from(JSON.stringify(body));
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': payload.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(payload);
}

function publicPath(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); }
  catch { return null; }
  const relativePath = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const candidate = resolve(PUBLIC_DIR, relativePath);
  const insidePublic = candidate === PUBLIC_DIR || candidate.startsWith(`${PUBLIC_DIR}${sep}`);
  return insidePublic ? candidate : null;
}

async function findAsset(pathname) {
  const candidate = publicPath(pathname);
  if (!candidate) return { status: 403 };
  try {
    const details = await stat(candidate);
    if (details.isFile()) return { status: 200, path: candidate, size: details.size };
    if (details.isDirectory()) {
      const indexPath = join(candidate, 'index.html');
      const indexDetails = await stat(indexPath);
      if (indexDetails.isFile()) return { status: 200, path: indexPath, size: indexDetails.size };
    }
  } catch { /* Try the SPA fallback below. */ }

  if (!extname(pathname)) {
    const indexPath = join(PUBLIC_DIR, 'index.html');
    const details = await stat(indexPath);
    return { status: 200, path: indexPath, size: details.size };
  }
  return { status: 404 };
}

async function requestHandler(request, response) {
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    sendJson(response, 405, { ok: false, error: 'Method not allowed' });
    return;
  }

  if (requestUrl.pathname === '/health') {
    sendJson(response, 200, {
      ok: true,
      name: APP_NAME,
      version: APP_VERSION,
      input: 'Hold Shift to draw; release Shift to detect',
      shapes: ['z', 'line', 'doubleArc', 'arc', 'star'],
      now: new Date().toISOString(),
    });
    return;
  }

  let asset;
  try { asset = await findAsset(requestUrl.pathname); }
  catch (error) {
    console.error('[backend tracking test] Failed to resolve asset:', error);
    sendJson(response, 500, { ok: false, error: 'Internal server error' });
    return;
  }
  if (asset.status !== 200 || !asset.path) {
    sendJson(response, asset.status, { ok: false, error: asset.status === 403 ? 'Forbidden' : 'Not found' });
    return;
  }

  const extension = extname(asset.path).toLowerCase();
  const isIndex = asset.path.endsWith(`${sep}index.html`);
  response.writeHead(200, {
    'Content-Type': MIME_TYPES.get(extension) || 'application/octet-stream',
    'Content-Length': asset.size,
    'Cache-Control': isIndex ? 'no-store' : 'public, max-age=300',
    'Permissions-Policy': 'camera=(self)',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  });
  if (request.method === 'HEAD') { response.end(); return; }
  response.end(await readFile(asset.path));
}

async function createServer() {
  const keyPath = process.env.TRACKING_TLS_KEY;
  const certificatePath = process.env.TRACKING_TLS_CERT;
  if (keyPath && certificatePath) {
    if (!isAbsolute(keyPath) || !isAbsolute(certificatePath)) {
      throw new Error('TRACKING_TLS_KEY and TRACKING_TLS_CERT must be absolute paths.');
    }
    return {
      protocol: 'https',
      server: createHttpsServer({ key: await readFile(keyPath), cert: await readFile(certificatePath) }, requestHandler),
    };
  }
  return { protocol: 'http', server: createHttpServer(requestHandler) };
}

const { protocol, server } = await createServer();
server.on('error', (error) => {
  console.error(`[${APP_NAME}] Server error:`, error);
  process.exitCode = 1;
});
server.listen(PORT, HOST, () => {
  console.log(`[${APP_NAME}] ${protocol}://${HOST}:${PORT}`);
  console.log(`[${APP_NAME}] health: ${protocol}://${HOST}:${PORT}/health`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
