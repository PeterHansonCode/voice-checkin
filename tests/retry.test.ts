import {test} from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Shared browser JavaScript module is exercised directly.
import {retrySave} from '../web/retry.js';
import {createStore} from '../src/store.ts';

test('browser retry recovers a lost acknowledgement without a second record',async()=>{
  const store=createStore(':memory:');let attempts=0;const delays:number[]=[];
  const input={submissionId:'abcdefghijklmnop',date:'2026-09-06',confirmed:true,answers:{sleepHours:null,energy:null,sunlight:null,exercise:null,meditation:null,note:''}};
  try {
    const result=await retrySave(async()=>{attempts++;const saved=store.save(input);if(attempts===1)throw new TypeError('Connection reset after commit');return saved;},()=>{},async(ms:number)=>{delays.push(ms);});
    assert.equal(result.duplicate,true);assert.equal(store.list().length,1);assert.equal(attempts,2);assert.deepEqual(delays,[400]);
  }finally{store.close();}
});

test('permanent errors are not retried and transient errors stop after three attempts',async()=>{
  let attempts=0;
  await assert.rejects(()=>retrySave(async()=>{attempts++;throw Object.assign(new Error('Conflict'),{status:409});},()=>{},async()=>{}));
  assert.equal(attempts,1);attempts=0;
  await assert.rejects(()=>retrySave(async()=>{attempts++;throw new Error('Disconnected');},()=>{},async()=>{}));
  assert.equal(attempts,3);
});
