import { useState, type ReactNode } from 'react';
import DiagramFrame from './DiagramFrame';
import Sequence, { type Message } from './Sequence';
import { StepControls, ToggleGroup, arrowKeys, useStepper } from './shared';

interface Step {
  msg?: Message;
  client: string;
  api: string;
  gw: string;
  text: ReactNode;
}

const NAIVE: Step[] = [
  {
    client: 'paying', api: 'ready', gw: '0 charges',
    text: <>The client pays for order <code>ord_1</code> (€30.00). Its HTTP client gives up after 2 seconds. The card gateway is slow today. Press Next.</>,
  },
  {
    msg: { from: 'c', to: 'api', label: 'POST /orders/ord_1/payments', sub: '{"amount": 3000}' },
    client: 'waiting…', api: 'working', gw: '0 charges',
    text: <>The payment request arrives. There's no idempotency key, so the API has no way to recognise this request if it comes again.</>,
  },
  {
    msg: { from: 'api', to: 'gw', label: 'charge €30.00' },
    client: 'waiting…', api: 'waiting', gw: 'charging…',
    text: <>The API asks the gateway to charge the card. The gateway takes 3 seconds.</>,
  },
  {
    msg: { from: 'gw', to: 'api', label: 'charged ch_1', tone: 'ok' },
    client: 'timed out ✗', api: 'saving', gw: '1 charge',
    text: <>The charge succeeds after 3 seconds. But the client stopped waiting at 2 seconds: as far as it knows, the payment <strong>may or may not</strong> have happened.</>,
  },
  {
    msg: { from: 'api', to: 'c', label: '201 Created', sub: 'nobody is listening', tone: 'muted' },
    client: 'timed out ✗', api: 'done', gw: '1 charge',
    text: <>The API sends 201, but the connection is gone. This is the crux: <strong>a timeout tells the client nothing about what happened on the server.</strong></>,
  },
  {
    msg: { from: 'c', to: 'api', label: 'POST /orders/ord_1/payments', sub: 'retry: same body' },
    client: 'retrying', api: 'working', gw: '1 charge',
    text: <>The client does the reasonable thing and retries. To the API this is a brand-new POST. POST isn't idempotent (A1.2).</>,
  },
  {
    msg: { from: 'api', to: 'gw', label: 'charge €30.00 again', tone: 'bad' },
    client: 'waiting…', api: 'waiting', gw: 'charging…',
    text: <>Nothing tells the API that this order was just paid. (The lab's atomic “claim” of the order would stop this one with a 409, but that guard only works per order. It can't help with “create a new transfer” requests, where every retry looks legitimate.)</>,
  },
  {
    msg: { from: 'gw', to: 'api', label: 'charged ch_2', tone: 'bad' },
    client: 'waiting…', api: 'saving', gw: '2 charges ✗',
    text: <>The customer is charged <strong>twice</strong>. Fixing it now takes a refund, a support ticket, and some trust.</>,
  },
];

const KEYED: Step[] = [
  {
    client: 'paying', api: 'no key yet', gw: '0 charges',
    text: <>Same situation, but the client generates a fresh UUID for this payment and sends it as <code>Idempotency-Key</code> on every attempt. Press Next.</>,
  },
  {
    msg: { from: 'c', to: 'api', label: 'POST …/payments', sub: 'Idempotency-Key: 7f3a…' },
    client: 'waiting…', api: 'key: running', gw: '0 charges',
    text: <>The API inserts the key with state <em>in progress</em>. The table's primary key makes this atomic: if two requests race, exactly one insert wins.</>,
  },
  {
    msg: { from: 'api', to: 'gw', label: 'charge €30.00', sub: 'gateway key 7f3a…' },
    client: 'timed out ✗', api: 'key: running', gw: 'charging…',
    text: <>The API charges the card, passing the same key down to the gateway, so even the gateway won't charge twice. Meanwhile the client hits its 2-second timeout.</>,
  },
  {
    msg: { from: 'c', to: 'api', label: 'POST …/payments', sub: 'retry · same key' },
    client: 'retrying', api: 'key: running', gw: 'charging…',
    text: <>The client retries with the <strong>same key</strong>. The API finds the key, and the request's fingerprint matches, so it's the same payment.</>,
  },
  {
    msg: { from: 'api', to: 'c', label: '409 Conflict', sub: 'Retry-After: 1', tone: 'bad' },
    client: 'backing off', api: 'key: running', gw: 'charging…',
    text: <>The original is still running, so the API answers <code>409</code> with <code>Retry-After: 1</code>: “not done yet, ask again in a second”. It doesn't start a second charge.</>,
  },
  {
    msg: { from: 'gw', to: 'api', label: 'charged ch_1', tone: 'ok' },
    client: 'backing off', api: 'key: stored', gw: '1 charge',
    text: <>The charge succeeds. The API stores the full response (201, body, Location) against the key in the same place it keeps the key.</>,
  },
  {
    msg: { from: 'c', to: 'api', label: 'POST …/payments', sub: 'retry after 1 s · same key' },
    client: 'retrying', api: 'key: stored', gw: '1 charge',
    text: <>After waiting, the client retries once more with the same key.</>,
  },
  {
    msg: { from: 'api', to: 'c', label: '201 Created', sub: 'Idempotent-Replayed: true', tone: 'ok' },
    client: 'paid ✓', api: 'key: stored', gw: '1 charge ✓',
    text: <>The API <strong>replays the stored response</strong>, the same bytes as the first time. The client gets its answer, and the card was charged exactly once.</>,
  },
];

export default function IdempotencyKeyFlow() {
  const [mode, setMode] = useState<'naive' | 'keyed'>('naive');
  const steps = mode === 'naive' ? NAIVE : KEYED;
  const stepper = useStepper(steps.length);
  const cur = steps[Math.min(stepper.step, steps.length - 1)];
  const messages = steps.flatMap((s) => (s.msg ? [s.msg] : []));

  return (
    <DiagramFrame
      title="A retried payment"
      subtitle={mode === 'naive' ? 'without an idempotency key' : 'with an idempotency key'}
      onKeyDown={arrowKeys(stepper.prev, stepper.next)}
      status={cur.text}
      controls={
        <>
          <ToggleGroup
            label="API"
            value={mode}
            onChange={(m) => {
              setMode(m);
              stepper.reset();
            }}
            options={[
              { value: 'naive', label: 'No key' },
              { value: 'keyed', label: 'Idempotency-Key' },
            ]}
          />
          <StepControls stepper={stepper} intro />
        </>
      }
    >
      <Sequence
        label={`Sequence diagram of a payment retried after a client timeout, ${mode === 'naive' ? 'without' : 'with'} an idempotency key`}
        actors={[
          { id: 'c', label: 'Client', sub: 'timeout 2 s' },
          { id: 'api', label: 'Orders API', short: 'API' },
          { id: 'gw', label: 'Card gateway', short: 'Gateway', sub: 'takes 3 s' },
        ]}
        messages={messages}
        shown={stepper.step}
        states={{ c: cur.client, api: cur.api, gw: cur.gw }}
        colWidth={190}
      />
    </DiagramFrame>
  );
}
