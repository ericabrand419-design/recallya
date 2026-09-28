import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
const server = http.createServer(async (req,res)=>{
  try {
    const u = new URL(req.url, `http://${req.headers.host}`);
    if (u.pathname.startsWith('/api/')) {
      const name = u.pathname.slice(5).replace(/\/$/,'');
      const file = path.join(__dirname,'api',`${name}.js`);
      const mod = await import(pathToFileURL(file).href + `?t=${Date.now()}`);
      req.query = Object.fromEntries(u.searchParams.entries());
      await mod.default(req,res);
      return;
    }
    let p = u.pathname === '/' ? '/index.html' : u.pathname;
    const file = path.join(__dirname,'public',p);
    const data = await fs.readFile(file);
    res.statusCode=200; res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream'); res.end(data);
  } catch (e) {
    res.statusCode=404; res.setHeader('Content-Type','text/plain'); res.end('Not found');
  }
});
server.listen(port,()=>console.log(`Recallya running at http://localhost:${port}`));
