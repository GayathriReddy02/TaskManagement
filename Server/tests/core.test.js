const {test}=require('node:test');
const assert=require('node:assert/strict');
const {retry}=require('../src/utils/retry');
const {JobQueue}=require('../src/queues/jobQueue');
const {QueueWorker}=require('../src/workers/queueWorker');
const {csvCell}=require('../src/utils/csvUtils');
const {ValidationError,QueueError}=require('../src/errors/AppError');
const {setTimeout:sleep}=require('node:timers/promises');
async function until(fn){for(let i=0;i<200;i++){if(fn())return;await sleep(5);}throw Error('Timed out');}
test('retry uses exponential delays and preserves result',async()=>{const delays=[];const result=await retry(n=>{if(n<4)throw Error('temporary');return 42;},3,10,{wait:async ms=>delays.push(ms)});assert.equal(result,42);assert.deepEqual(delays,[10,20,40]);});
test('permanent failure stops at four total attempts',async()=>{let attempts=0;await assert.rejects(retry(()=>{attempts++;throw Error('failed');},3,0),/failed/);assert.equal(attempts,4);});
test('nonretryable failure is not repeated',async()=>{let attempts=0;await assert.rejects(retry(()=>{attempts++;throw new QueueError('invalid');},3,0),/invalid/);assert.equal(attempts,1);});
test('worker records failed attempts and continues to next FIFO job',async()=>{const q=new JobQueue();const w=new QueueWorker(q,{bad:()=>{throw Error('temporary');},good:()=>42},{concurrency:1,delay:0});const a=q.add('bad',{},'u');const b=q.add('good',{},'u');w.start();try{await until(()=>b.status==='completed');assert.equal(a.status,'failed');assert.equal(a.attempts,4);assert.equal(a.errors.length,4);assert.equal(b.result,42);}finally{await w.stop();}});
test('worker processes two jobs concurrently and stays within limit',async()=>{const q=new JobQueue();let active=0,peak=0;const w=new QueueWorker(q,{work:async()=>{active++;peak=Math.max(peak,active);await sleep(10);active--; }},{concurrency:2});for(let i=0;i<5;i++)q.add('work',{},'u');w.start();try{await until(()=>q.list().every(j=>j.status==='completed'));assert.equal(peak,2);}finally{await w.stop();}});
test('CSV quoting and spreadsheet formula protection',()=>{assert.equal(csvCell('a,"b"'),'"a,""b"""');assert.equal(csvCell('=1+1'),'"\'=1+1"');assert.equal(csvCell(null),'""');});
test('custom errors retain status and code',()=>{const e=new ValidationError('bad input');assert.equal(e.statusCode,400);assert.equal(e.code,'VALIDATION_ERROR');});
