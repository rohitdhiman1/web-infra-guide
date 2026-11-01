import { useState } from 'react';
import DiagramFrame from './DiagramFrame';
import { ToggleGroup } from './shared';

type Caller = 'none' | 'expired' | 'alice' | 'bob' | 'support' | 'admin';
type Action = 'read' | 'cancel' | 'refund' | 'list';

interface CallerInfo {
  label: string;
  token: string;
  who?: string;
  scopes: string[];
  role?: 'customer' | 'support' | 'admin';
}

const CALLERS: Record<Caller, CallerInfo> = {
  none: { label: 'No token', token: '(no Authorization header)', scopes: [] },
  expired: { label: 'Expired token', token: 'Bearer eyJ… (exp passed 10 minutes ago)', scopes: [] },
  alice: { label: 'Alice', token: 'Bearer eyJ… sub=alice', who: 'alice', scopes: ['orders:read', 'orders:write'], role: 'customer' },
  bob: { label: 'Bob', token: 'Bearer eyJ… sub=bob', who: 'bob', scopes: ['orders:read', 'orders:write'], role: 'customer' },
  support: { label: 'Support agent', token: 'Bearer eyJ… sub=sam, role=support', who: 'sam', scopes: ['orders:read', 'orders:read:any'], role: 'support' },
  admin: { label: 'Admin', token: 'Bearer eyJ… sub=ana, role=admin', who: 'ana', scopes: ['orders:read', 'orders:read:any', 'orders:write', 'refunds:write'], role: 'admin' },
};

const ACTIONS: Record<Action, { label: string; request: string; needs: string; anyOrder: boolean; touchesOrder: boolean }> = {
  read: { label: 'Read Alice’s order', request: 'GET /orders/ord_1', needs: 'orders:read', anyOrder: false, touchesOrder: true },
  cancel: { label: 'Cancel Alice’s order', request: 'PATCH /orders/ord_1 {"status":"cancelled"}', needs: 'orders:write', anyOrder: false, touchesOrder: true },
  refund: { label: 'Refund Alice’s order', request: 'POST /orders/ord_1/refunds', needs: 'refunds:write', anyOrder: true, touchesOrder: true },
  list: { label: 'List everyone’s orders', request: 'GET /admin/orders', needs: 'orders:read:any', anyOrder: true, touchesOrder: false },
};

const STAGES = [
  { name: 'Authentication', q: 'Who is calling? Is the credential valid and unexpired?', fail: '401 Unauthorized' },
  { name: 'Function-level authorisation', q: 'May this kind of caller do this kind of action? (scope or role)', fail: '403 Forbidden' },
  { name: 'Object-level authorisation', q: 'May this caller touch this particular order?', fail: '404 Not Found' },
  { name: 'Handler', q: 'Do the work.', fail: '' },
];

function decide(c: Caller, a: Action) {
  const caller = CALLERS[c];
  const action = ACTIONS[a];
  if (c === 'none') {
    return { stop: 0, status: '401 Unauthorized', tone: 'bad', header: 'WWW-Authenticate: Bearer', why: 'No credential at all. 401 says “authenticate first”, and WWW-Authenticate says how.' };
  }
  if (c === 'expired') {
    return { stop: 0, status: '401 Unauthorized', tone: 'bad', header: 'WWW-Authenticate: Bearer error="invalid_token"', why: 'The token’s exp is in the past, so it proves nothing any more. The error tells the client to get a fresh token, not to give up.' };
  }
  if (!caller.scopes.includes(action.needs)) {
    return { stop: 1, status: '403 Forbidden', tone: 'warn', header: 'Content-Type: application/problem+json', why: `We know who this is, and the answer is still no: the token lacks the ${action.needs} scope. Fetching a different order wouldn't help, so the order's existence isn't secret here.` };
  }
  if (action.touchesOrder && !action.anyOrder) {
    const ownsIt = caller.who === 'alice';
    // Admins may act on any order; support may only read any order.
    const seesAny = caller.role === 'admin' || (caller.scopes.includes('orders:read:any') && a === 'read');
    if (!ownsIt && !seesAny) {
      return { stop: 2, status: '404 Not Found', tone: 'warn', header: 'Content-Type: application/problem+json', why: 'Valid token and the right scope, but ord_1 belongs to Alice. The API answers 404, not 403, so Bob can’t even learn that ord_1 exists. Skipping this check is broken object-level authorisation, OWASP’s #1 API risk.' };
    }
  }
  return { stop: 3, status: a === 'refund' ? '201 Created' : '200 OK', tone: 'ok', header: a === 'refund' ? 'Location: /orders/ord_1/refunds/ref_1' : 'Content-Type: application/json', why: `Every check passed: authenticated as ${caller.who}, holds ${action.needs}${action.touchesOrder && !action.anyOrder ? (caller.who === 'alice' ? ', and owns ord_1' : caller.role === 'admin' ? ', and may act on any order' : ', and may read any order') : ''}.` };
}

export default function AuthMatrix() {
  const [c, setC] = useState<Caller>('alice');
  const [a, setA] = useState<Action>('read');
  const r = decide(c, a);
  const caller = CALLERS[c];

  return (
    <DiagramFrame
      title="Who may do what?"
      subtitle="the same request, checked layer by layer"
      status={
        <div className="dg-detail">
          <div>
            <span className={`dg-pill ${r.tone}`}>{r.status}</span> answered by <strong>{STAGES[r.stop].name}</strong>. {r.why}
          </div>
          <code className="cp-headers">{`${ACTIONS[a].request}\nAuthorization: ${caller.token}\n→ ${r.status}\n${r.header}`}</code>
        </div>
      }
      controls={
        <>
          <ToggleGroup
            label="Caller"
            value={c}
            onChange={setC}
            options={(Object.keys(CALLERS) as Caller[]).map((k) => ({ value: k, label: CALLERS[k].label }))}
          />
          <ToggleGroup
            label="Action"
            value={a}
            onChange={setA}
            options={(Object.keys(ACTIONS) as Action[]).map((k) => ({ value: k, label: ACTIONS[k].label }))}
          />
        </>
      }
    >
      <ol className="df cp">
        {STAGES.map((st, i) => {
          const state = i < r.stop ? 'pass' : i === r.stop ? (r.tone === 'ok' ? 'pass' : 'stop') : 'idle';
          return (
            <li key={st.name} className={`df-q is-${state}${i === r.stop ? ' is-answer' : ''}`}>
              <span className="df-num" aria-hidden="true">
                {i + 1}
              </span>
              <div className="df-head">
                {i < 3 && <span className="df-layer">{i === 0 ? 'authn' : 'authz'}</span>}
                <strong>{st.name}</strong>
                {i === r.stop && <span className={`dg-pill ${r.tone}`}>answers here</span>}
              </div>
              <div className="cp-does">
                {st.q}
                {st.fail && <> Failure: <code>{st.fail}</code>.</>}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="ra-legend">
        {caller.scopes.length ? (
          <>
            {caller.label}’s token carries: {caller.scopes.map((s) => <code key={s}>{s}</code>).reduce((x, y) => <>{x} {y}</>)}
          </>
        ) : (
          <>No valid token, so no scopes.</>
        )}
      </p>
    </DiagramFrame>
  );
}
