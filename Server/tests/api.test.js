const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
process.env.JWT_SECRET ||= 'test-secret-that-is-long-enough-for-auth-tests';
const app=require('../src/app');
let server,base;
before(async()=>{server=app.listen(0,'127.0.0.1');await once(server,'listening');base=`http://127.0.0.1:${server.address().port}`;});
after(async()=>{if(server)await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));});
test('health endpoint returns success',async()=>{const r=await fetch(base+'/');assert.equal(r.status,200);assert.equal((await r.json()).message,'Task Management API working');});
test('missing routes use centralized error response',async()=>{const r=await fetch(base+'/missing');assert.equal(r.status,404);assert.equal((await r.json()).code,'NOT_FOUND');});
test('protected task, job and export APIs reject unauthenticated requests',async()=>{for(const [url,method] of [['/api/tasks','GET'],['/api/jobs','GET'],['/api/reports/json','POST']]){const r=await fetch(base+url,{method});assert.equal(r.status,401);assert.equal((await r.json()).code,'UNAUTHORIZED');}});
test('malformed JSON returns 400',async()=>{const r=await fetch(base+'/api/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'});assert.equal(r.status,400);assert.equal((await r.json()).code,'VALIDATION_ERROR');});
test('email/password endpoints validate credentials and protected APIs accept bearer headers only',async()=>{
  for(const path of ['/api/auth/login','/api/auth/register']){
    const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    assert.equal(response.status,400);
  }
  const protectedWithoutToken=await fetch(base+'/api/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  assert.equal(protectedWithoutToken.status,401);
  const protectedWithInvalidBearer=await fetch(base+'/api/tasks',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer invalid'},body:'{}'});
  assert.equal(protectedWithInvalidBearer.status,401);
});
test('passkey endpoints are no longer available',async()=>{
  for(const path of ['/api/auth/passkeys/login/options','/api/auth/passkeys/login/verify','/api/auth/passkeys/register/options','/api/auth/passkeys/register/verify']){
    const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    assert.equal(response.status,404);
  }
});
