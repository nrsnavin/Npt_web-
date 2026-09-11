/** Real React hook tests; deferred promises control network response ordering. */
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useRecord, useRecordList } from '../src/hooks/useRecords.js';
import { useBoard } from '../src/hooks/useBoard.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}

function harness(t, hook, initialProps) {
  let current, renderer;
  function Component(props) { current = hook(props); return null; }
  act(() => { renderer = TestRenderer.create(React.createElement(Component, initialProps)); });
  t.after(() => act(() => renderer.unmount()));
  return {
    get value() { return current; },
    update(props) { act(() => renderer.update(React.createElement(Component, props))); },
  };
}

test('CONTROL: the list ignores an earlier response arriving after the latest search', async t => {
  const a = deferred(), b = deferred();
  const fetcher = ({ search }) => (search === 'A' ? a : b).promise;
  const h = harness(t, ({ search }) => useRecordList(fetcher, { search }), { search: 'A' });
  h.update({ search: 'B' });
  await act(async () => b.resolve({ data: [{ _id: 'B' }] }));
  await act(async () => a.resolve({ data: [{ _id: 'A' }] }));
  assert.equal(h.value.data[0]._id, 'B');
});

test('W01: navigating A to B must not let a late A response replace record B', async t => {
  const a = deferred(), b = deferred();
  const fetcher = id => (id === 'A' ? a : b).promise;
  const h = harness(t, ({ id }) => useRecord(fetcher, id), { id: 'A' });
  h.update({ id: 'B' });
  await act(async () => b.resolve({ _id: 'B', name: 'Buyer B' }));
  await act(async () => a.resolve({ _id: 'A', name: 'Buyer A' }));
  t.diagnostic(JSON.stringify({ routeId: 'B', renderedRecord: h.value.data._id }));
  assert.equal(h.value.data._id, 'B', 'The page for B renders and can edit A');
});

test('W02: a refused board move must not undo a different successful move', async t => {
  const a = { _id: 'A', status: 'new' }, b = { _id: 'B', status: 'new' };
  const fetcher = async () => ({ columns: [
    { status: 'new', total: 2, value: 0, cards: [a, b] },
    { status: 'contacted', total: 0, value: 0, cards: [] },
  ] });
  const h = harness(t, () => useBoard(fetcher), {});
  await act(async () => {});
  const first = deferred(), second = deferred();
  let p1, p2;
  act(() => { p1 = h.value.move({ card: a, from: 'new', to: 'contacted', valueOf: () => 0, apply: () => first.promise }); });
  act(() => { p2 = h.value.move({ card: b, from: 'new', to: 'contacted', valueOf: () => 0, apply: () => second.promise }); });
  await act(async () => { second.resolve({ ...b, status: 'contacted' }); await p2; });
  await act(async () => { first.reject(new Error('A was changed by another user')); await p1; });
  const displayed = h.value.columns.find(c => c.cards.some(card => card._id === 'B')).status;
  t.diagnostic(JSON.stringify({ serverStatusForB: 'contacted', displayedStatusForB: displayed }));
  assert.equal(displayed, 'contacted', 'Rolling back A replaced all columns and reverted B on screen');
});

test('a late fetch cannot replace a freshly saved record', async t => {
  const pending = deferred(); const fetcher = () => pending.promise;
  const h = harness(t, () => useRecord(fetcher, 'A'), {});
  act(() => h.value.setData({ _id:'A', name:'Saved' }));
  await act(async () => pending.resolve({ _id:'A', name:'Old' }));
  assert.equal(h.value.data.name, 'Saved');
});

test('changing routes clears old data and ignores callbacks from the old route', async t => {
  const next = deferred(); const fetcher = id => id === 'A' ? Promise.resolve({_id:'A'}) : next.promise;
  const h = harness(t, ({id}) => useRecord(fetcher, id), {id:'A'});
  await act(async () => {}); const oldSave = h.value.setData;
  h.update({id:'B'}); assert.equal(h.value.data, null);
  act(() => oldSave({_id:'A',name:'Late save'})); assert.equal(h.value.data, null);
  await act(async () => next.resolve({_id:'B'})); assert.equal(h.value.data._id,'B');
});

test('the same board card cannot be moved twice while a write is pending', async t => {
  const a = {_id:'A',status:'new'}; const pending = deferred(); let calls=0;
  const fetcher = async () => ({columns:[{status:'new',total:1,value:0,cards:[a]},{status:'done',total:0,value:0,cards:[]}]});
  const h = harness(t, () => useBoard(fetcher), {}); await act(async () => {});
  let first; act(() => { first=h.value.move({card:a,from:'new',to:'done',apply:() => {calls++;return pending.promise;}}); });
  await act(async () => h.value.move({card:a,from:'done',to:'new',apply:() => {calls++;}}));
  assert.equal(calls,1);
  await act(async () => {pending.resolve({...a,status:'done'});await first;});
  assert.equal(h.value.columns[1].value,0);
});
