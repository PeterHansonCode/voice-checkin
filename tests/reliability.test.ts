import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../src/store.ts';
import {brisbaneDate, ConflictError, InputError} from '../src/domain.ts';
import {buildServer} from '../src/server.ts';

const submission={submissionId:'12345678-1234-1234-abcd-123456789012',date:'2026-09-06',confirmed:true,answers:{sleepHours:7.5,energy:4,sunlight:true,exercise:false,meditation:null,note:'Steady start'}};

test('lost acknowledgement and restart preserve one record; conflicting retry is rejected',()=>{
  const dir=mkdtempSync(join(tmpdir(),'voice-checkin-'));
  let store=createStore(join(dir,'test.db'));
  try {
    store.save(submission); // Simulate a successful commit whose response was lost.
    store.close();store=createStore(join(dir,'test.db'));
    assert.equal(store.save(submission).duplicate,true);
    assert.equal(store.list().length,1);
    assert.throws(()=>store.save({...submission,answers:{...submission.answers,energy:2}}),ConflictError);
    assert.equal(store.list()[0].answers.energy,4);
  } finally {store.close();rmSync(dir,{recursive:true});}
});

test('invalid or unconfirmed answers cannot be persisted',()=>{
  const store=createStore(':memory:');
  try {
    for(const invalid of [{confirmed:false},{answers:{...submission.answers,sleepHours:25}},{answers:{...submission.answers,energy:2.5}},{date:'2026-02-30'}]) {
      assert.throws(()=>store.save({...submission,...invalid}),InputError);
    }
    assert.equal(store.list().length,0);
  } finally {store.close();}
});

test('Brisbane date handles the UTC boundary',()=>assert.equal(brisbaneDate(new Date('2026-09-05T15:00:00Z')),'2026-09-06'));

test('every ES module app.js statically imports is actually served by the real HTTP server',async()=>{
  // A review caught this the hard way: app.js gained an `import ... from
  // './newCheckin.js'` while the server's static-asset map wasn't updated,
  // so the browser's module fetch 404'd and the whole script failed to
  // execute -- no handlers ever wired up, with nothing in the unit tests
  // (which import newCheckin.js directly in Node, bypassing the server
  // entirely) able to notice. This walks app.js's own source for static
  // import specifiers and fetches each one from a real running server, so
  // a future import with no matching route entry fails this test instead
  // of silently breaking the page.
  const server=await buildServer(':memory:');
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  const address=server.address() as {port:number};
  const base=`http://127.0.0.1:${address.port}`;
  try {
    const appJs=await (await fetch(`${base}/app.js`)).text();
    const specifiers=[...appJs.matchAll(/^import\s*\{[^}]*\}\s*from\s*'(\.\/[^']+)';?$/gm)].map(m=>m[1]);
    assert.ok(specifiers.length>0,'expected at least one static import in app.js to check');
    for(const specifier of specifiers){
      const response=await fetch(new URL(specifier,`${base}/app.js`));
      assert.equal(response.status,200,`${specifier} (imported by app.js) must be served, got ${response.status}`);
      assert.match(response.headers.get('content-type') || '',/javascript/);
    }
  } finally {server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});

test('concurrent HTTP retries create one row; export derives from saved data; foreign origins fail',async()=>{
  const server=await buildServer(':memory:');
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  const address=server.address() as {port:number};
  const base=`http://127.0.0.1:${address.port}`;
  try {
    const responses=await Promise.all(Array.from({length:8},()=>fetch(`${base}/api/checkins`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(submission)})));
    assert.equal(responses.filter(r=>r.status===201).length,1);
    assert.equal(responses.filter(r=>r.status===200).length,7);
    const rows=await (await fetch(`${base}/api/checkins`)).json() as unknown[];
    assert.equal(rows.length,1);
    assert.match(await (await fetch(`${base}/api/export/${submission.submissionId}`)).text(),/7.5 hours/);
    const cross=await fetch(`${base}/api/checkins`,{headers:{Origin:'https://example.com'}});
    assert.equal(cross.status,403);
  } finally {server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
