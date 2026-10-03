// Rende una vista del visualizzatore three.js in Chromium headless.
// Uso: node render.mjs <dir_export> <cx,cy,cz> <tx,ty,tz> <uscita.png> [fov]
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const [dir, cam, tgt, out, fov = '55'] = process.argv.slice(2);
const root = path.dirname(new URL(import.meta.url).pathname);
const types = {'.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.dae': 'model/vnd.collada+xml'};
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {'Content-Type': types[path.extname(p)] || 'application/octet-stream'});
  fs.createReadStream(p).pipe(res);
}).listen(0);
const port = server.address().port;
const browser = await chromium.launch({executablePath: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
const page = await browser.newPage({viewport: {width: 1280, height: 720}});
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
await page.goto(`http://127.0.0.1:${port}/viewer.html?dir=${path.relative(root, dir)}&cam=${cam}&tgt=${tgt}&fov=${fov}`);
await page.waitForFunction(() => window.__done === true, null, {timeout: 240000});
await page.screenshot({path: out});
if (errors.length) console.log('ERRORI:', errors.join('\n'));
await browser.close();
server.close();
console.log('ok', out);
