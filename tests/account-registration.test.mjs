import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../services/accountRegistrationService.js',import.meta.url),'utf8');
async function fixture(availability, response = {data:{session:null},error:null}) {
  const calls = [];
  globalThis.__registrationFixture = {
    supabase:{auth:{signUp:async args=>{calls.push(args);return response;}}},
    validateDisplayName:value=>{const name=value.trim();if(!name)throw Error('Invalid name');return name;},
    isDisplayNameAvailable:async()=>{const next=availability.shift();if(next instanceof Error)throw next;return next;},
    DISPLAY_NAME_TAKEN:'This display name is already taken. Please choose another.'
  };
  const prepared=source.replace(/^import .*;\n/gm,'')+'\n//'+Math.random();
  const api=await import('data:text/javascript;base64,'+Buffer.from('const {supabase, validateDisplayName, isDisplayNameAvailable, DISPLAY_NAME_TAKEN}=globalThis.__registrationFixture;\n'+prepared).toString('base64'));
  return {api,calls};
}
test('taken name stops before creating an Auth account',async()=>{
  const f=await fixture([false]);const result=await f.api.registerAccount('test@example.invalid','fixture-password',' Fisher ','free','https://example.invalid/login');
  assert.match(result.error.message,/already taken/);assert.equal(f.calls.length,0);
});
test('available name registers once, trimmed, preserving plan and email redirect',async()=>{
  const f=await fixture([true]);const result=await f.api.registerAccount('test@example.invalid','fixture-password',' New name ','premium','https://example.invalid/login');
  assert.equal(result.error,null);assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0].options,{data:{display_name:'New name',requested_tier:'premium'},emailRedirectTo:'https://example.invalid/login'});
});
test('concurrent name conflict maps generic Auth failure to useful feedback',async()=>{
 const f=await fixture([true,false],{data:null,error:{message:'Database error saving new user'}});
 assert.match((await f.api.registerAccount('a@b.invalid','fixture-password','Name','free','url')).error.message,/already taken/);
});
test('lookup failure fails closed; unrelated Auth errors remain intact',async()=>{
 const f=await fixture([Error('Check unavailable')]);assert.match((await f.api.registerAccount('a@b.invalid','fixture-password','Name','free','url')).error.message,/Check unavailable/);assert.equal(f.calls.length,0);
 const original={message:'Signup rate limited'};const g=await fixture([true,true],{data:null,error:original});assert.equal((await g.api.registerAccount('a@b.invalid','fixture-password','Name','free','url')).error,original);
});
