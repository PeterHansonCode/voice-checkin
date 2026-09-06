import {retrySave} from './retry.js';
const $ = id => document.getElementById(id);
const keys=['sleepHours','energy','sunlight','exercise','meditation','note'];
const draftKey='morning-checkin-draft-v1';
let submissionId=crypto.randomUUID(), date='', frozen=null, busy=false;
const status=message=>$('status').textContent=message;
function answers(){return Object.fromEntries(keys.map(k=>[k,k==='note'?$(k).value:$(k).value===''?null:['sleepHours','energy'].includes(k)?Number($(k).value):$(k).value==='true']));}
function preserve(){localStorage.setItem(draftKey,JSON.stringify({submissionId,date,transcript:$('transcript').value,answers:answers(),frozen}));}
function fill(a){for(const k of keys)$(k).value=a[k]===null?'':String(a[k]??'');}
function lock(value){for(const k of keys)$(k).disabled=value;$('extract').disabled=value;$('listen').disabled=value;$('transcript').disabled=value;$('confirmed').disabled=value;}
async function request(path, options={}){
  const response=await fetch(path,{...options,signal:AbortSignal.timeout(path.includes('extract')?125000:10000)});
  const result=await response.json();
  if(!response.ok){const error=new Error(result.error);error.status=response.status;throw error;}
  return result;
}
async function history(){
  const rows=await request('/api/checkins');$('history').replaceChildren();
  if(!rows.length){$('history').textContent='Your first check-in starts here.';return;}
  for(const row of rows){const div=document.createElement('div');div.className='entry';const text=document.createElement('span');text.textContent=`${row.date} · Sleep ${row.answers.sleepHours??'—'}h · Energy ${row.answers.energy??'—'}/5`;const link=document.createElement('a');link.href=`/api/export/${encodeURIComponent(row.submissionId)}`;link.textContent='Download Markdown';div.append(text,link);$('history').append(div);}
}
for(const id of [...keys,'transcript'])$(id).addEventListener('input',()=>{$('confirmed').checked=false;preserve();});
$('extract').onclick=async()=>{
  busy=true;lock(true);$('new').disabled=true;status('Organising your answers with the local model…');
  try{const result=await request('/api/extract',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({transcript:$('transcript').value})});fill(result.answers);$('confirmed').checked=false;preserve();const droppedNote=result.dropped&&result.dropped.length?` ${result.dropped.join(', ')} could not be understood as a valid value and ${result.dropped.length>1?'were':'was'} left unknown.`:'';status(`Answers ready in ${(result.durationMs/1000).toFixed(1)}s.${droppedNote} Review each field before saving.`);}
  catch(e){status(`${e.message} You can enter the fields manually; your words are preserved.`);}
  finally{busy=false;lock(false);$('new').disabled=false;}
};
$('review').onsubmit=async event=>{
  event.preventDefault();if(busy)return;
  if(!frozen){frozen={submissionId,date,confirmed:true,answers:answers()};preserve();}
  busy=true;lock(true);$('save').disabled=true;$('new').disabled=true;
  try{
    const saved=await retrySave(()=>request('/api/checkins',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(frozen)}),attempt=>status(`Save interrupted. Retrying the same submission (${attempt}/3)…`));
    localStorage.removeItem(draftKey);status(saved.duplicate?'Already saved. The retry did not create a duplicate.':'Saved. Your Markdown export is ready below.');
    try{await history();}catch{status('Saved successfully. Refresh to see your history.');}
    $('save').textContent='Saved';
  }catch(e){if(e.status===400){frozen=null;lock(false);$('confirmed').checked=false;preserve();status(`${e.message} Correct your answers and confirm again.`);}else{status(`${e.message} Retry Save with the same answers. Use New check-in only if you intend a separate record.`);}$('save').disabled=false;}
  finally{busy=false;$('new').disabled=false;}
};
$('new').onclick=async()=>{
  if(busy)return;
  $('new').disabled=true;
  try{const info=await request('/api/status');date=info.date;$('date').textContent=date;}catch{}
  submissionId=crypto.randomUUID();frozen=null;localStorage.removeItem(draftKey);$('review').reset();$('transcript').value='';lock(false);$('save').disabled=false;$('save').textContent='Save check-in';preserve();status('A new check-in is ready.');
  $('new').disabled=false;
};
$('speak').onclick=()=>{speechSynthesis.cancel();speechSynthesis.speak(new SpeechSynthesisUtterance('How long did you sleep? What is your energy out of five? Have you had sunlight, exercised, or meditated?'));};
const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
if(!Recognition){$('listen').disabled=true;$('listen').textContent='Microphone unavailable — type below';}
else{
  const recognition=new Recognition();recognition.lang='en-AU';recognition.continuous=false;recognition.interimResults=false;
  // Some browsers still fire onresult more than once per utterance even with
  // interimResults=false (each call a progressively more complete guess for
  // the SAME sentence). Only replace a pending buffer on each call, and
  // commit it to the visible transcript once, when the session truly ends —
  // this stays correct no matter how many times onresult fires.
  let pendingByIndex=new Map();
  $('listen').onclick=()=>{pendingByIndex=new Map();try{recognition.start();status('Listening…');}catch{status('Microphone is already starting.');}};
  // event.resultIndex is the lowest result index that changed in this
  // event. Buffering by index (not just the last one) keeps every
  // finalized segment from the session, not only the most recent -- a
  // browser can finalize more than one result before onend fires. The
  // same index firing again with more complete text still just replaces
  // its own entry, which is what fixed the original repeating-transcript
  // bug; this generalises that fix to sessions with multiple segments.
  recognition.onresult=event=>{for(let i=event.resultIndex;i<event.results.length;i++){pendingByIndex.set(i,event.results[i][0].transcript.trim());}};
  recognition.onerror=event=>{pendingByIndex=new Map();status(`Speech recognition: ${event.error}. You can type your answers instead.`);};
  recognition.onend=()=>{const pendingSpeech=[...pendingByIndex.keys()].sort((a,b)=>a-b).map(i=>pendingByIndex.get(i)).join(' ').trim();if(pendingSpeech){$('transcript').value+=($('transcript').value?' ':'')+pendingSpeech;$('confirmed').checked=false;preserve();status('Speech captured. Organise your answers or continue speaking.');}pendingByIndex=new Map();};
}
async function init(){
  const info=await request('/api/status');date=info.date;$('date').textContent=date;$('model').textContent=`Extraction: ${info.model} on your computer. Manual entry also works.`;
  try{const draft=JSON.parse(localStorage.getItem(draftKey));if(draft){submissionId=draft.submissionId;date=draft.date;$('date').textContent=date;$('transcript').value=draft.transcript;fill(draft.answers);frozen=draft.frozen;if(frozen){lock(true);$('confirmed').checked=true;}status('Restored your unfinished check-in. Review or retry saving.');}}catch{localStorage.removeItem(draftKey);}
  await history();
}
init().catch(e=>status(e.message));
