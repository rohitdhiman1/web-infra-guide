import { useState, type ReactNode } from 'react';
import DiagramFrame from './DiagramFrame';
import Sequence, { type Message } from './Sequence';
import { StepControls, ToggleGroup, arrowKeys, useStepper } from './shared';

interface Step {
  msg?: Message;
  c: string;
  api: string;
  text: ReactNode;
}

const POLL: Step[] = [
  { c: '–', api: '–', text: <>A refund takes a couple of seconds at the bank, too long to hold an HTTP request open. Press Next.</> },
  {
    msg: { from: 'c', to: 'api', label: 'POST /refunds', sub: '{"orderId": "ord_1", "amount": 3000}' },
    c: 'waiting', api: 'ref_1: pending',
    text: <>The client asks for a refund. The API records it as pending and starts the work in the background.</>,
  },
  {
    msg: { from: 'api', to: 'c', label: '202 Accepted', sub: 'Location: /refunds/ref_1 · Retry-After: 1' },
    c: 'has ref_1', api: 'ref_1: pending',
    text: <><strong>202 Accepted</strong> means “received, not done”. <code>Location</code> points at a <em>status resource</em> the client can check, and <code>Retry-After</code> says how often to ask.</>,
  },
  {
    msg: { from: 'c', to: 'api', label: 'GET /refunds/ref_1' },
    c: 'polling', api: 'ref_1: pending',
    text: <>After a second, the client asks.</>,
  },
  {
    msg: { from: 'api', to: 'c', label: '200 {"status": "pending"}', sub: 'Retry-After: 1' },
    c: 'polling', api: 'ref_1: pending',
    text: <>Not yet. This request was wasted, the price of polling: most polls return “not yet”.</>,
  },
  {
    msg: { from: 'c', to: 'api', label: 'GET /refunds/ref_1' },
    c: 'polling', api: 'ref_1: succeeded',
    text: <>Meanwhile the refund finished. The next poll…</>,
  },
  {
    msg: { from: 'api', to: 'c', label: '200 {"status": "succeeded"}', tone: 'ok' },
    c: 'done ✓', api: 'ref_1: succeeded',
    text: <>…sees it. Polling is simple and works through any firewall, because the client always initiates. The costs: wasted requests, and a delay of up to one interval before the client notices.</>,
  },
];

const HOOK: Step[] = [
  { c: '–', api: '–', text: <>Same refund, but the client registered a webhook URL earlier and received a signing secret. Press Next.</> },
  {
    msg: { from: 'c', to: 'api', label: 'POST /refunds' },
    c: 'waiting', api: 'ref_1: pending',
    text: <>The client asks for the refund.</>,
  },
  {
    msg: { from: 'api', to: 'c', label: '202 Accepted', sub: 'Location: /refunds/ref_1' },
    c: 'gets on with life', api: 'ref_1: pending',
    text: <>202 as before. The status resource still exists (polling stays useful as a fallback), but the client doesn't need to poll.</>,
  },
  {
    msg: { from: 'api', to: 'h', label: 'POST refund.succeeded', sub: 'webhook-id: msg_1 · signed' },
    c: '–', api: 'delivering (1)',
    text: <>The refund completes and the API <strong>calls the client's server</strong>, the reverse of normal HTTP. The request is signed with HMAC so the receiver can prove it came from the API.</>,
  },
  {
    msg: { from: 'h', to: 'api', label: '500', tone: 'bad' },
    c: '–', api: 'retry in 1 s',
    text: <>The receiver is having a bad moment and answers 500. The API schedules a retry with exponential backoff (1 s, 2 s, 4 s…), just like any well-behaved client (A3).</>,
  },
  {
    msg: { from: 'api', to: 'h', label: 'POST refund.succeeded', sub: 'webhook-id: msg_1 (same) · signed' },
    c: '–', api: 'delivering (2)',
    text: <>Retry, with the <strong>same</strong> <code>webhook-id</code>. Delivery is at-least-once, so the receiver may see an event twice, for example if its 200 got lost. It must dedupe on that id.</>,
  },
  {
    msg: { from: 'h', to: 'api', label: '204 No Content', tone: 'ok' },
    c: 'notified ✓', api: 'delivered',
    text: <>Accepted. The receiver checked the signature and the timestamp (rejecting anything older than 5 minutes stops replays), recorded <code>msg_1</code> as processed, and answered quickly. Slow work belongs in its own queue, not in the webhook handler.</>,
  },
];

export default function AsyncFlow() {
  const [mode, setMode] = useState<'poll' | 'hook'>('poll');
  const steps = mode === 'poll' ? POLL : HOOK;
  const stepper = useStepper(steps.length);
  const cur = steps[Math.min(stepper.step, steps.length - 1)];
  const actors =
    mode === 'poll'
      ? [
          { id: 'c', label: 'Client' },
          { id: 'api', label: 'Orders API', short: 'API' },
        ]
      : [
          { id: 'c', label: 'Client app', short: 'Client' },
          { id: 'api', label: 'Orders API', short: 'API' },
          { id: 'h', label: 'Client webhook', short: 'Webhook', sub: 'POST /hooks' },
        ];

  return (
    <DiagramFrame
      title="Finishing long work"
      subtitle={mode === 'poll' ? '202 + polling' : '202 + webhook'}
      onKeyDown={arrowKeys(stepper.prev, stepper.next)}
      status={cur.text}
      controls={
        <>
          <ToggleGroup
            label="The client finds out by"
            value={mode}
            onChange={(m) => {
              setMode(m);
              stepper.reset();
            }}
            options={[
              { value: 'poll', label: 'Polling' },
              { value: 'hook', label: 'Webhook' },
            ]}
          />
          <StepControls stepper={stepper} intro />
        </>
      }
    >
      <Sequence
        label={`Sequence diagram of a refund that finishes later, reported by ${mode === 'poll' ? 'polling' : 'a webhook'}`}
        actors={actors}
        messages={steps.flatMap((s) => (s.msg ? [s.msg] : []))}
        shown={stepper.step}
        states={{ c: cur.c, api: cur.api }}
        colWidth={200}
      />
    </DiagramFrame>
  );
}
