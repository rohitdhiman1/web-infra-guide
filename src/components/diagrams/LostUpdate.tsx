import { useState, type ReactNode } from 'react';
import DiagramFrame from './DiagramFrame';
import Sequence, { type Message } from './Sequence';
import { StepControls, ToggleGroup, arrowKeys, useStepper } from './shared';

interface Step {
  msg?: Message;
  alice: string;
  api: string;
  bob: string;
  text: ReactNode;
}

const PLAIN: Step[] = [
  {
    alice: '–', api: 'qty 2', bob: '–',
    text: <>Order <code>ord_1</code> has 2 copies of a book. Alice wants to add 1, Bob wants to add 2. Done one after the other, the order ends at 5. Press Next.</>,
  },
  {
    msg: { from: 'a', to: 'api', label: 'GET /orders/ord_1' },
    alice: 'sees qty 2', api: 'qty 2', bob: '–',
    text: <>Alice opens the order and sees quantity 2.</>,
  },
  {
    msg: { from: 'b', to: 'api', label: 'GET /orders/ord_1' },
    alice: 'sees qty 2', api: 'qty 2', bob: 'sees qty 2',
    text: <>Bob opens it too, a moment later. He also sees 2.</>,
  },
  {
    msg: { from: 'a', to: 'api', label: 'PATCH items: qty 3' },
    alice: 'saved', api: 'qty 3', bob: 'sees qty 2',
    text: <>Alice adds one and saves: quantity 3. Her client sends the new item list, computed from what she saw.</>,
  },
  {
    msg: { from: 'api', to: 'a', label: '200 OK', tone: 'ok' },
    alice: 'saved', api: 'qty 3', bob: 'sees qty 2',
    text: <>Saved.</>,
  },
  {
    msg: { from: 'b', to: 'api', label: 'PATCH items: qty 4', tone: 'bad' },
    alice: 'saved', api: 'qty 4 ✗', bob: 'saved',
    text: <>Bob adds two to the 2 <em>he</em> saw and saves: quantity 4. The server has no way to know his change was based on an old version.</>,
  },
  {
    msg: { from: 'api', to: 'b', label: '200 OK' },
    alice: 'saved?', api: 'qty 4 ✗', bob: 'saved',
    text: <>Both got 200, but the order says 4, not 5. <strong>Alice's update is lost</strong>, silently: no error, no log line, nobody knows. This is the <em>lost update</em> problem.</>,
  },
];

const GUARDED: Step[] = [
  {
    alice: '–', api: 'qty 2 · "1"', bob: '–',
    text: <>Same edits, but every response carries an <code>ETag</code> (the order's version), and the API requires <code>If-Match</code> on writes. Press Next.</>,
  },
  {
    msg: { from: 'a', to: 'api', label: 'GET /orders/ord_1' },
    alice: 'has "1"', api: 'qty 2 · "1"', bob: '–',
    text: <>Alice reads the order and gets <code>ETag: "1"</code> with it.</>,
  },
  {
    msg: { from: 'b', to: 'api', label: 'GET /orders/ord_1' },
    alice: 'has "1"', api: 'qty 2 · "1"', bob: 'has "1"',
    text: <>Bob reads it too, and also holds version <code>"1"</code>.</>,
  },
  {
    msg: { from: 'a', to: 'api', label: 'PATCH qty 3', sub: 'If-Match: "1"' },
    alice: 'saving', api: 'qty 3 · "2"', bob: 'has "1"',
    text: <>Alice saves with <code>If-Match: "1"</code>: “only if it's still version 1”. It is, so the write goes through and the version becomes 2. The check and the write are one SQL statement: <code>UPDATE … WHERE id = 1 AND version = 1</code>.</>,
  },
  {
    msg: { from: 'api', to: 'a', label: '200 OK', sub: 'ETag: "2"', tone: 'ok' },
    alice: 'has "2"', api: 'qty 3 · "2"', bob: 'has "1"',
    text: <>Saved, and Alice gets the new ETag.</>,
  },
  {
    msg: { from: 'b', to: 'api', label: 'PATCH qty 4', sub: 'If-Match: "1"' },
    alice: 'has "2"', api: 'qty 3 · "2"', bob: 'saving',
    text: <>Bob saves with <code>If-Match: "1"</code>. But the order is at version 2 now…</>,
  },
  {
    msg: { from: 'api', to: 'b', label: '412 Precondition Failed', tone: 'bad' },
    alice: 'has "2"', api: 'qty 3 · "2"', bob: 'conflict',
    text: <>…so the API refuses with <strong>412 Precondition Failed</strong>. Nothing is overwritten. Bob's client knows its copy is stale.</>,
  },
  {
    msg: { from: 'b', to: 'api', label: 'GET /orders/ord_1' },
    alice: 'has "2"', api: 'qty 3 · "2"', bob: 'sees qty 3',
    text: <>Bob's client fetches the current order (quantity 3, version 2) and reapplies his change: add two.</>,
  },
  {
    msg: { from: 'b', to: 'api', label: 'PATCH qty 5', sub: 'If-Match: "2"', tone: 'ok' },
    alice: 'has "2"', api: 'qty 5 · "3"', bob: 'has "3"',
    text: <>Quantity 5, version 3. Both changes survived. This is <strong>optimistic concurrency control</strong>: no locks are held while people think, and conflicts are detected at write time.</>,
  },
];

export default function LostUpdate() {
  const [mode, setMode] = useState<'plain' | 'guarded'>('plain');
  const steps = mode === 'plain' ? PLAIN : GUARDED;
  const stepper = useStepper(steps.length);
  const cur = steps[Math.min(stepper.step, steps.length - 1)];

  return (
    <DiagramFrame
      title="Two people edit one order"
      subtitle={mode === 'plain' ? 'no preconditions' : 'ETag + If-Match'}
      onKeyDown={arrowKeys(stepper.prev, stepper.next)}
      status={cur.text}
      controls={
        <>
          <ToggleGroup
            label="Writes"
            value={mode}
            onChange={(m) => {
              setMode(m);
              stepper.reset();
            }}
            options={[
              { value: 'plain', label: 'Unconditional' },
              { value: 'guarded', label: 'If-Match' },
            ]}
          />
          <StepControls stepper={stepper} intro />
        </>
      }
    >
      <Sequence
        label={`Sequence diagram of Alice and Bob editing the same order ${mode === 'plain' ? 'without' : 'with'} If-Match`}
        actors={[
          { id: 'a', label: 'Alice' },
          { id: 'api', label: 'Orders API', short: 'API' },
          { id: 'b', label: 'Bob' },
        ]}
        messages={steps.flatMap((s) => (s.msg ? [s.msg] : []))}
        shown={stepper.step}
        states={{ a: cur.alice, api: cur.api, b: cur.bob }}
        colWidth={190}
      />
    </DiagramFrame>
  );
}
