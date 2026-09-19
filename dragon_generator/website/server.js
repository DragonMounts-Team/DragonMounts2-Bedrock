const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const websiteRoot = __dirname;
const generatorRoot = path.resolve(websiteRoot, '..');
const resourcePackRoot = path.resolve(generatorRoot, '..', 'DM2RP');
const port = Number(process.env.PORT) || 4173;
const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png'
};

function send(response, status, body, contentType = 'text/plain; charset=utf-8') {
  response.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store' });
  response.end(body);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10000) reject(new Error('Request body is too large.'));
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function runGenerator({ type, assets, dryRun }) {
  return new Promise((resolve) => {
    const args = ['generate.js', '--type', type];
    if (assets === 'all') args.push('--assets', 'all');
    if (dryRun) args.push('--dry-run');

    const child = spawn(process.execPath, args, { cwd: generatorRoot, windowsHide: true });
    let output = '';
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const collect = (chunk) => { output += chunk.toString(); };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', (error) => finish({ ok: false, code: null, output: `${output}${error.message}` }));
    child.on('close', (code) => finish({ ok: code === 0, code, output }));
    setTimeout(() => {
      child.kill();
      finish({ ok: false, code: null, output: `${output}\nGeneration timed out after 120 seconds.` });
    }, 120000).unref();
  });
}

async function handleGenerate(request, response) {
  try {
    const payload = JSON.parse(await readBody(request));
    const type = typeof payload.type === 'string' ? payload.type.trim().toLowerCase() : '';
    if (!/^[a-z0-9]+(?:_[a-z0-9]+)*_dragon$/.test(type)) {
      send(response, 400, JSON.stringify({ error: 'Choose a valid dragon type.' }), 'application/json; charset=utf-8');
      return;
    }
    const result = await runGenerator({
      type,
      assets: payload.assets === 'all' ? 'all' : undefined,
      dryRun: payload.dryRun === true
    });
    send(response, result.ok ? 200 : 500, JSON.stringify(result), 'application/json; charset=utf-8');
  } catch (error) {
    send(response, 400, JSON.stringify({ error: error.message }), 'application/json; charset=utf-8');
  }
}

function serveStatic(request, response) {
  const requestedPath = request.url === '/' ? '/index.html' : request.url.split('?')[0];
  const isResourcePackRequest = requestedPath === '/DM2RP' || requestedPath.startsWith('/DM2RP/');
  const root = isResourcePackRequest ? resourcePackRoot : websiteRoot;
  const relativePath = isResourcePackRequest ? requestedPath.slice('/DM2RP'.length) : requestedPath;
  const filePath = path.resolve(root, `.${relativePath}`);
  if (!filePath.startsWith(`${root}${path.sep}`)) {
    send(response, 403, 'Forbidden');
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      send(response, error.code === 'ENOENT' ? 404 : 500, error.code === 'ENOENT' ? 'Not found' : error.message);
      return;
    }
    send(response, 200, data, contentTypes[path.extname(filePath)] || 'application/octet-stream');
  });
}

const server = http.createServer((request, response) => {
  if (request.method === 'POST' && request.url === '/api/generate') {
    handleGenerate(request, response);
    return;
  }
  if (request.method === 'GET') {
    serveStatic(request, response);
    return;
  }
  send(response, 405, 'Method not allowed');
});

server.listen(port, 'localhost', () => {
  console.log(`Dragon Mount's Generator is running at http://localhost:${port}`);
});
