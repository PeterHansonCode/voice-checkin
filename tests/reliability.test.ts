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
