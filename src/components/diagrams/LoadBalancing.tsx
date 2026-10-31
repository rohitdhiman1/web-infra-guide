import { useState } from 'react';
import DiagramFrame from './DiagramFrame';

const NAMES = ['A', 'B', 'C'] as const;
type Name = (typeof NAMES)[number];
const FAIL_TIMEOUT = 10; // seconds; one request = one second here

interface Backend {
  alive: boolean;
  /** nginx's view: marked failed until this time (max_fails=1). */
  downUntil: number;
  served: number;
}
interface LogLine {
  n: number;
  t: number;
  tried: { name: Name; ok: boolean }[];
}
interface State {
  t: number;
  /** Round-robin pointer. */
  ptr: number;
  backends: Record<Name, Backend>;
  log: LogLine[];
}

const fresh = (): State => ({
  t: 0,
  ptr: 0,
  backends: { A: { alive: true, downUntil: 0, served: 0 }, B: { alive: true, downUntil: 0, served: 0 }, C: { alive: true, downUntil: 0, served: 0 } },
  log: [],
});

/** Round robin with passive health checks and proxy_next_upstream. */
function send(s: State): State {
  const t = s.t + 1;
  const backends = structuredClone(s.backends);
  const available = (n: Name) => backends[n].downUntil <= t;
  const tried: LogLine['tried'] = [];
  // Pick: start at the pointer, skip servers nginx has marked failed.
  let idx = s.ptr;
  for (let k = 0; k < NAMES.length && tried.length < NAMES.length; k++) {
    const name = NAMES[(idx + k) % NAMES.length];
    if (!available(name) || tried.some((x) => x.name === name)) continue;
    const ok = backends[name].alive;
    tried.push({ name, ok });
    if (ok) {
      backends[name].served++;
      break;
    }
    // Passive health check: one failure marks it down for fail_timeout. Retry on the next one.
    backends[name].downUntil = t + FAIL_TIMEOUT;
  }
  return { t, ptr: (s.ptr + 1) % NAMES.length, backends, log: [{ n: s.log.length + 1, t, tried }, ...s.log].slice(0, 8) };
}

export default function LoadBalancing() {
  const [s, setS] = useState<State>(fresh);
  const total = NAMES.reduce((a, n) => a + s.backends[n].served, 0);
  const last = s.log[0];

  const toggle = (n: Name) =>
    setS((st) => ({ ...st, backends: { ...st.backends, [n]: { ...st.backends[n], alive: !st.backends[n].alive } } }));

  let status;
  if (!last) status = <>Send a few requests, kill B, then send again.</>;
  else {
    const failed = last.tried.filter((x) => !x.ok);
    const okOn = last.tried.find((x) => x.ok);
    status = (
      <>
        <strong>Request #{last.n}</strong>{' '}
        {failed.length === 0 && okOn && <>went to {okOn.name}, next in the rotation.</>}
        {failed.length > 0 && okOn && (
          <>
            hit {failed.map((f) => f.name).join(', ')}, which refused the connection. nginx marked it failed for{' '}
            {FAIL_TIMEOUT}s and retried on <strong>{okOn.name}</strong> (<code>proxy_next_upstream</code>). The user
            never saw an error, just a slightly slower response.
          </>
        )}
        {!okOn && (
          <>
            found no working backend: <span className="dg-pill bad">502</span> "no live upstreams".
          </>
        )}
        {okOn &&
          failed.length === 0 &&
          NAMES.some((n) => s.backends[n].downUntil > s.t) &&
          ` ${NAMES.filter((n) => s.backends[n].downUntil > s.t).join(', ')} is skipped, so its turn goes to the next server.`}
      </>
    );
  }

  return (
    <DiagramFrame
      title="Load balancing simulator"
      subtitle="round robin, 3 backends, passive failover"
      status={status}
      controls={
        <>
          <div className="dg-toggle">
            <span className="dg-label">Traffic</span>
            <div className="dg-btn-group">
              <button type="button" className="dg-btn is-primary" onClick={() => setS(send)}>
                Send request
              </button>
              <button
                type="button"
                className="dg-btn"
                onClick={() => setS((st) => Array.from({ length: 6 }).reduce<State>((a) => send(a), st))}
              >
                Send 6
              </button>
              <button type="button" className="dg-btn" onClick={() => setS(fresh())}>
                Reset
              </button>
            </div>
          </div>
          <div className="dg-toggle" role="group" aria-label="Backend power">
            <span className="dg-label">Backends</span>
            <div className="dg-btn-group">
              {NAMES.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`dg-btn${s.backends[n].alive ? '' : ' is-danger'}`}
                  onClick={() => toggle(n)}
                  aria-label={`${s.backends[n].alive ? 'Kill' : 'Revive'} backend ${n}`}
                >
                  {s.backends[n].alive ? `Kill ${n}` : `Revive ${n}`}
                </button>
              ))}
            </div>
          </div>
        </>
      }
    >
      <div className="lb">
        <div className="lb-top">
          <div className="lb-nginx">
            <strong>nginx</strong>
            <code className="lb-conf">
              upstream app {'{'} server A max_fails=1 fail_timeout={FAIL_TIMEOUT}s; … {'}'}
            </code>
            <span className="lb-clock">t = {s.t}s · next in rotation: {NAMES[s.ptr]}</span>
          </div>
        </div>
        <div className="lb-backends">
          {NAMES.map((n) => {
            const b = s.backends[n];
            const marked = b.downUntil > s.t;
            const share = total ? Math.round((b.served / total) * 100) : 0;
            const hitNow = last?.tried.find((x) => x.name === n);
            return (
              <div
                key={`${n}-${last?.n ?? 0}`}
                className={`lb-backend${b.alive ? '' : ' is-dead'}${hitNow ? (hitNow.ok ? ' hit-ok' : ' hit-bad') : ''}`}
              >
                <div className="lb-name">
                  <strong>{n}</strong>
                  <span className={`dg-pill ${b.alive ? 'ok' : 'bad'}`}>{b.alive ? 'up' : 'dead'}</span>
                </div>
                <div className="lb-view">
                  {marked ? (
                    <span className="dg-pill warn">nginx: failed until t={b.downUntil}s</span>
                  ) : !b.alive ? (
                    <span className="dg-pill muted">nginx doesn't know yet</span>
                  ) : (
                    <span className="dg-pill muted">nginx: available</span>
                  )}
                </div>
                <div className="lb-share">
                  <span className="lb-bar" aria-hidden="true">
                    <span style={{ width: `${share}%` }} />
                  </span>
                  <span>
                    {b.served} req · {share}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        {s.log.length > 0 && (
          <ol className="lb-log" aria-label="Recent requests, newest first">
            {s.log.map((l) => (
              <li key={l.n}>
                <span className="lb-log-n">#{l.n}</span>
                {l.tried.length === 0 && <span className="dg-pill bad">502 no live upstreams</span>}
                {l.tried.map((x, i) => (
                  <span key={i} className={`dg-pill ${x.ok ? 'ok' : 'bad'}`}>
                    {i > 0 && '↻ '}
                    {x.name} {x.ok ? '200' : 'refused'}
                  </span>
                ))}
                {l.tried.length > 0 && !l.tried.some((x) => x.ok) && <span className="dg-pill bad">502</span>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </DiagramFrame>
  );
}
