import {createServer, type IncomingMessage} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createStore} from './store.ts';
import {brisbaneDate, ConflictError, InputError, markdown} from './domain.ts';
import {extract} from './ollama.ts';

export async function buildServer(dbPath: string) {
  const store = createStore(dbPath);
  const assets = new Map([['/', ['index.html','text/html']], ['/app.js',['app.js','text/javascript']], ['/style.css',['style.css','text/css']]]);
  async function body(req: IncomingMessage) {
    if (!req.headers['content-type']?.startsWith('application/json')) throw new InputError('Send JSON.');
    let text = '';
    for await (const chunk of req) {
      text += chunk.toString();
      if (Buffer.byteLength(text) > 16384) throw new InputError('Request is too large.');
    }
    try { return JSON.parse(text); } catch { throw new InputError('Invalid JSON.'); }
  }
  const server = createServer(async (req,res) => {
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");
    const json = (status:number, value:unknown) => {res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
    try {
      const host = req.headers.host || '';
      if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) {json(403,{error:'Local access only.'});return;}
      if (req.headers.origin && req.headers.origin !== `http://${host}`) {json(403,{error:'Cross-origin requests are refused.'});return;}
      const url = new URL(req.url || '/',`http://${host}`);
      if (req.method === 'GET' && assets.has(url.pathname)) {
        const [file,type] = assets.get(url.pathname)!;
        res.writeHead(200,{'Content-Type':type});res.end(await readFile(new URL(`../web/${file}`,import.meta.url)));return;
      }
      if (req.method === 'GET' && url.pathname === '/api/status') {json(200,{date:brisbaneDate(),mode:'local-llm',model:process.env.OLLAMA_MODEL || 'qwen3:4b-instruct'});return;}
      if (req.method === 'GET' && url.pathname === '/api/checkins') {json(200,store.list());return;}
      if (req.method === 'POST' && url.pathname === '/api/extract') {json(200,await extract((await body(req)).transcript));return;}
      if (req.method === 'POST' && url.pathname === '/api/checkins') {
        const saved=store.save(await body(req));json(saved.duplicate?200:201,saved);return;
      }
      if (req.method === 'GET' && url.pathname.startsWith('/api/export/')) {
        const row=store.list().find(x=>x.submissionId===url.pathname.slice('/api/export/'.length));
        if(!row){json(404,{error:'Record not found.'});return;}
        res.writeHead(200,{'Content-Type':'text/markdown; charset=utf-8','Content-Disposition':`attachment; filename="checkin-${row.date}.md"`});res.end(markdown(row.date,row.answers));return;
      }
      json(404,{error:'Not found.'});
    } catch(e) {
      const status=e instanceof ConflictError?409:e instanceof InputError?400:503;
      json(status,{error:status===503?'Local service unavailable. Your draft is preserved; check Ollama or retry.':(e as Error).message});
    }
  });
  server.on('close',()=>store.close());
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await mkdir(new URL('../data/private/',import.meta.url),{recursive:true});
  const server=await buildServer(fileURLToPath(new URL('../data/private/checkins.db',import.meta.url)));
  server.listen(Number(process.env.PORT || 3100),'127.0.0.1',()=>console.log('Voice Check-in: http://127.0.0.1:3100'));
}
