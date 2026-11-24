const {retry} = require('../utils/retry');
const {QueueError} = require('../errors/AppError');
class QueueWorker {
  constructor(queue, handlers, {concurrency=2, delay=1000, retries=3, wait}={}) {
    if (!Number.isInteger(concurrency) || concurrency < 1) throw new TypeError('Invalid concurrency');
    Object.assign(this,{queue,handlers,concurrency,delay,retries,wait}); this.active=new Set(); this.running=false; this.scheduled=false;
    this.schedule=this.schedule.bind(this); // method passed as callback
  }
  start() { if(this.running)return; this.running=true; this.queue.on('ready',this.schedule); this.schedule(); }
  schedule() { if(!this.running || this.scheduled)return; this.scheduled=true; setImmediate(()=>{this.scheduled=false;this.drain();}); }
  drain() {
    while(this.running && this.active.size<this.concurrency) {
      const job=this.queue.take(); if(!job)break;
      const run=this.processJob(job).finally(()=>{this.active.delete(run);this.schedule();}); this.active.add(run);
    }
  }
  async processJob(job) {
    job.maxRetries=this.retries;
    try {
      job.result=await retry(async attempt=>{
        job.attempts=attempt; job.status='processing'; job.nextRetryAt=null;
        const handler=this.handlers[job.type]; if(typeof handler!=='function')throw new QueueError('Unknown job type');
        return handler(job.payload,job);
      },this.retries,this.delay,{...(this.wait?{wait:this.wait}:{}),shouldRetry:e=>e?.retryable!==false && !['ValidationError','CastError','ForbiddenError','NotFoundError'].includes(e?.name),onFailure:(error,attempt,nextDelay)=>{
        job.errors.push({attempt,message:String(error?.message||error),at:new Date().toISOString()});
        if(nextDelay!==null){job.status='pending';job.nextRetryAt=new Date(Date.now()+nextDelay).toISOString();}
      }});
      job.status='completed';
    } catch(error) {job.status='failed'; job.error=String(error?.message||error);}
    finally {job.finishedAt=new Date().toISOString();job.nextRetryAt=null;}
  }
  async stop(){this.running=false;this.queue.off('ready',this.schedule);await Promise.allSettled([...this.active]);}
}
module.exports={QueueWorker};
