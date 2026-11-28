/* POLY — локальный сервер для просмотра сайта.
   Запуск: start-server.bat или `node server.js`.
   Открывает сайт на http://localhost:8090 без доступа из сети. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = __dirname;
const port = Number(process.env.PORT) || 8090;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4'
};

http.createServer((req, res) => {
  let url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/') url = '/index.html';
  const file = path.join(root, url);
  if (!file.startsWith(root)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  fs.stat(file, (err, stat) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('not found');
      return;
    }
    const type = types[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range;
    if (range && stat.isFile()) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (match) {
        const start = match[1] ? Number(match[1]) : 0;
        const end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
        if (start <= end && start < stat.size) {
          res.writeHead(206, {
            'Content-Type': type,
            'Content-Range': 'bytes ' + start + '-' + end + '/' + stat.size,
            'Accept-Ranges': 'bytes',
            'Content-Length': end - start + 1,
            'Cache-Control': 'no-cache'
          });
          fs.createReadStream(file, { start, end }).pipe(res);
          return;
        }
      }
    }
    res.writeHead(200, {
      'Content-Type': type,
      'Accept-Ranges': 'bytes',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(file).pipe(res);
  });
}).listen(port, '0.0.0.0', () => {
  console.log('POLY — сайт открыт на http://localhost:' + port);
  const nets = os.networkInterfaces();
  Object.keys(nets).forEach((name) => {
    (nets[name] || []).forEach((net) => {
      if (net.family === 'IPv4' && !net.internal) {
        console.log('Для телефона в той же Wi-Fi: http://' + net.address + ':' + port);
      }
    });
  });
  console.log('Остановка: Ctrl+C');
});
