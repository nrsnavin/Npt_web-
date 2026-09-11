import test from 'node:test';
import assert from 'node:assert/strict';
import { beginFeedback, finishFeedback, subscribeFeedback, actionLabel } from '../src/api/feedback.js';

test('overlapping writes report pending count and each outcome exactly once', () => {
  const events=[]; const unsubscribe=subscribeFeedback(e=>events.push(e));
  try {
    const a={method:'post',url:'/customers'}, b={method:'patch',url:'/orders/123'};
    beginFeedback(a);beginFeedback(b);assert.equal(events.at(-1).pending,2);
    finishFeedback(a,{status:201});assert.equal(events.at(-1).message,'Customer created');assert.equal(events.at(-1).pending,1);
    finishFeedback(b,null,{message:'Changed by a colleague'});assert.equal(events.at(-1).tone,'danger');assert.equal(events.at(-1).pending,0);
    const count=events.length;finishFeedback(b,null,{message:'again'});assert.equal(events.length,count);
  } finally { unsubscribe(); }
});

test('partial completion is informational and does not claim success', () => {
  let event;const unsubscribe=subscribeFeedback(e=>event=e);
  try {const config={method:'post',url:'/dispatches/123/actions'};beginFeedback(config);finishFeedback(config,{status:202,data:{message:'Accounting will retry'}});assert.equal(event.tone,'info');assert.equal(event.detail,'Accounting will retry');assert.match(event.message,/pending/);} finally {unsubscribe();}
});

test('ordinary reads remain quiet and labels use business language', () => {
  let count=0;const unsubscribe=subscribeFeedback(()=>count++);
  try {const config={method:'get',url:'/customers'};beginFeedback(config);finishFeedback(config,{status:200});assert.equal(count,1);assert.equal(actionLabel({method:'delete',url:'/users/123'}),'User offboarded');assert.equal(actionLabel({method:'post',url:'/payments/123/receipts'}),'Receipt recorded');} finally {unsubscribe();}
});
