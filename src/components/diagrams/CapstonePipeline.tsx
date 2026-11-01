import { useState } from 'react';
import DiagramFrame from './DiagramFrame';
import { ToggleGroup } from './shared';

interface Stage {
  name: string;
  module: string;
  does: string;
}

const STAGES: Stage[] = [
  { name: 'Request id', module: 'A9', does: 'Accept a safe X-Request-Id or make one; it goes on the response and into every log line.' },
  { name: 'Rate limit', module: 'A9', does: 'Take a token from this caller’s bucket (keyed by its credential); set X-RateLimit-Remaining.' },
  { name: 'Authentication', module: 'A10', does: 'Verify the bearer token (ES256 signature, exp, iss, aud) or look up the API key’s hash: 401 + WWW-Authenticate if neither is valid.' },
  { name: 'Routing', module: 'A1', does: 'Match the path and method; unknown path 404, wrong method 405 + Allow.' },
  { name: 'Negotiation', module: 'A1', does: 'Check Accept and Content-Type: 406, 415.' },
  { name: 'Authorisation', module: 'A10', does: 'Does the token have orders:write (403)? Is this order the caller’s (404)? The ownership check is in the SQL.' },
  { name: 'Idempotency key', module: 'A3', does: 'Require the key, scope it to the caller, fingerprint the request, insert it or find the stored result.' },
  { name: 'Validation', module: 'A2', does: 'Parse (400) and validate (422) with JSON Pointers to each bad field.' },
  { name: 'Claim the order', module: 'A3', does: 'UPDATE … WHERE status = pending: exactly one payment wins.' },
  { name: 'Gateway', module: 'A3', does: 'Charge the card, passing our idempotency key down.' },
  { name: 'Store + respond', module: 'A3/A4', does: 'One transaction: payment row + order paid (new ETag). Save the response under the key.' },
];

interface Scenario {
  label: string;
  stopAt: number; // index of the stage that answers
  status: string;
  tone: 'ok' | 'warn' | 'bad';
  headers: string[];
  why: string;
}

const SCENARIOS: Scenario[] = [
  { label: 'First payment', stopAt: 10, status: '201 Created', tone: 'ok', headers: ['X-Request-Id: 7c1e…', 'X-RateLimit-Remaining: 99', 'Location: /orders/ord_1/payments/pay_1'], why: 'Every stage passes. The response is stored under the idempotency key before it is sent.' },
  { label: 'Retry, same key', stopAt: 6, status: '201 Created (replayed)', tone: 'ok', headers: ['X-Request-Id: 9d02…', 'Idempotent-Replayed: true', 'Location: /orders/ord_1/payments/pay_1'], why: 'The key and fingerprint match a completed request: the stored response is sent again, byte for byte. Nothing below runs, and the card isn’t charged.' },
  { label: 'Retry while still running', stopAt: 6, status: '409 Conflict', tone: 'warn', headers: ['Retry-After: 1', 'Content-Type: application/problem+json'], why: 'The first request holds the key in progress. The client should wait for Retry-After and try again.' },
  { label: 'Same key, other amount', stopAt: 6, status: '422 Unprocessable Content', tone: 'warn', headers: ['Content-Type: application/problem+json'], why: 'The fingerprint differs: the client reused a key for a different request. That is a client bug, not a retry.' },
  { label: 'No key', stopAt: 6, status: '400 Bad Request', tone: 'warn', headers: ['Content-Type: application/problem+json'], why: 'Payments require an Idempotency-Key: without one, a timeout can never be retried safely.' },
  { label: 'Wrong amount', stopAt: 7, status: '422 Unprocessable Content', tone: 'warn', headers: ['Content-Type: application/problem+json'], why: 'errors: [{pointer: "#/amount", …}]. The key is then released, so the client can fix the body and reuse it.' },
  { label: 'Second payment, new key', stopAt: 8, status: '409 Conflict', tone: 'warn', headers: ['Content-Type: application/problem+json'], why: 'A different key is a different operation, but the order is no longer pending: the atomic claim fails (order-not-payable).' },
  { label: 'No token', stopAt: 2, status: '401 Unauthorized', tone: 'bad', headers: ['WWW-Authenticate: Bearer realm="orders-api"', 'Content-Type: application/problem+json'], why: 'No Authorization header and no API key. The header tells the client how to authenticate; nothing behind this point ran.' },
  { label: 'Bob pays Alice’s order', stopAt: 5, status: '404 Not Found', tone: 'warn', headers: ['Content-Type: application/problem+json'], why: 'Bob’s token is valid and has orders:write, but ord_1 is Alice’s. The answer is the same 404 as for an order that doesn’t exist, and it comes before the idempotency key is stored.' },
  { label: 'Hammering', stopAt: 1, status: '429 Too Many Requests', tone: 'bad', headers: ['Retry-After: 1', 'X-RateLimit-Remaining: 0'], why: 'The bucket is empty. Refused before any real work, even before the token is checked, still with a request id and a problem body.' },
  { label: 'Plain-text body', stopAt: 4, status: '415 Unsupported Media Type', tone: 'warn', headers: ['Accept: application/json'], why: 'The body isn’t JSON. Negotiation runs before anything reads the body.' },
];

export default function CapstonePipeline() {
  const [s, setS] = useState(0);
  const sc = SCENARIOS[s];
  return (
    <DiagramFrame
      title="One payment request, every layer"
      subtitle="POST /orders/ord_1/payments through the capstone"
      status={
        <div className="dg-detail">
          <div>
            <span className={`dg-pill ${sc.tone}`}>{sc.status}</span> answered by <strong>{STAGES[sc.stopAt].name}</strong>. {sc.why}
          </div>
          <code className="cp-headers">{sc.headers.join('\n')}</code>
        </div>
      }
      controls={
        <ToggleGroup
          label="Scenario"
          value={String(s)}
          onChange={(v) => setS(Number(v))}
          options={SCENARIOS.map((x, i) => ({ value: String(i), label: x.label }))}
        />
      }
    >
      <ol className="df cp">
        {STAGES.map((st, i) => {
          const state = i < sc.stopAt ? 'pass' : i === sc.stopAt ? (sc.tone === 'ok' ? 'pass' : 'stop') : 'idle';
          return (
            <li key={st.name} className={`df-q is-${state}${i === sc.stopAt ? ' is-answer' : ''}`}>
              <span className="df-num" aria-hidden="true">
                {i + 1}
              </span>
              <div className="df-head">
                <span className="df-layer">{st.module}</span>
                <strong>{st.name}</strong>
                {i === sc.stopAt && <span className={`dg-pill ${sc.tone}`}>answers here</span>}
              </div>
              <div className="cp-does">{st.does}</div>
            </li>
          );
        })}
      </ol>
    </DiagramFrame>
  );
}
