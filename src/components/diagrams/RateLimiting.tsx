import { useState } from 'react';
import DiagramFrame from './DiagramFrame';
import { Switch, useInterval } from './shared';

const RATE = 1; // requests per second
const BURST = 3;
const WINDOW = 12; // seconds shown on the timeline
const DT = 0.1;

interface Req {
  id: number;
  at: number;
  serveAt: number | null; // null = rejected
}
interface State {
  t: number;
  /** nginx's per-key state: excess requests, as of `last`. */
  excess: number;
  last: number | null;
  reqs: Req[];
}

const fresh = (): State => ({ t: 0, excess: 0, last: null, reqs: [] });

/** limit_req's leaky bucket, as nginx implements it (excess drains at `rate`). */
function arrive(s: State, nodelay: boolean): State {
  const id = (s.reqs.at(-1)?.id ?? 0) + 1;
  const excess = s.last === null ? 0 : Math.max(0, s.excess - (s.t - s.last) * RATE) + 1;
  if (excess > BURST + 1e-9) {
    return { ...s, reqs: [...s.reqs, { id, at: s.t, serveAt: null }] };
  }
  const delay = nodelay ? 0 : excess / RATE;
  return { ...s, excess, last: s.t, reqs: [...s.reqs, { id, at: s.t, serveAt: s.t + delay }] };
}

const fmt = (x: number) => x.toFixed(1);

export default function RateLimiting() {
  const [nodelay, setNodelay] = useState(false);
  const [s, setS] = useState<State>(fresh);
  const [running, setRunning] = useState(false);

  const pending = s.reqs.some((r) => r.serveAt !== null && r.serveAt > s.t);
  const level = s.last === null ? 0 : Math.max(0, s.excess - (s.t - s.last) * RATE);
  // The clock runs while anything is queued or the bucket is draining, then stops.
  useInterval(
    () => setS((st) => ({ ...st, t: Math.round((st.t + DT) * 10) / 10 })),
    100,
    running && (pending || level > 0),
  );

  const fire = (n: number) => {
    setS((st) => {
      let x = st;
      for (let i = 0; i < n; i++) x = arrive(x, nodelay);
      return x;
    });
    setRunning(true);
  };
  const advance = (sec: number) => setS((st) => ({ ...st, t: Math.round((st.t + sec) * 10) / 10 }));

  const start = Math.max(0, s.t - WINDOW + 2);
  const pos = (time: number) => `${Math.min(100, Math.max(0, ((time - start) / WINDOW) * 100))}%`;
  const recent = s.reqs.slice(-8);
  const rejected = s.reqs.filter((r) => r.serveAt === null).length;
  const served = s.reqs.filter((r) => r.serveAt !== null && r.serveAt <= s.t);
  const waited = served.filter((r) => r.serveAt! > r.at);
  const maxWait = waited.length ? Math.max(...waited.map((r) => r.serveAt! - r.at)) : 0;

  return (
    <DiagramFrame
      title="Rate limiting simulator"
      subtitle={`rate ${RATE}r/s, burst ${BURST}, nodelay ${nodelay ? 'on' : 'off'}`}
      status={
        s.reqs.length === 0 ? (
          <>Fire a burst of 5 with nodelay off, then reset, turn it on and fire again.</>
        ) : (
          <>
            {served.length} served{waited.length > 0 && <> ({waited.length} delayed, up to {fmt(maxWait)}s)</>}
            {rejected > 0 && (
              <>
                , <strong>{rejected} rejected</strong> with <span className="dg-pill bad">429</span>
              </>
            )}
            {pending && <>, {s.reqs.filter((r) => r.serveAt !== null && r.serveAt > s.t).length} waiting in the queue</>}.{' '}
            {nodelay
              ? 'nodelay: the burst is served instantly, but the bucket only drains at 1 request per second, so another burst soon after is rejected.'
              : 'Without nodelay, excess requests are queued and released at the rate: spikes are smoothed, but users wait.'}
          </>
        )
      }
      controls={
        <>
          <div className="dg-toggle">
            <span className="dg-label">Traffic</span>
            <div className="dg-btn-group">
              <button type="button" className="dg-btn is-primary" onClick={() => fire(5)}>
                Fire burst of 5
              </button>
              <button type="button" className="dg-btn" onClick={() => fire(1)}>
                Send 1
              </button>
              <button type="button" className="dg-btn" onClick={() => advance(1)}>
                Wait 1 s
              </button>
              <button
                type="button"
                className="dg-btn"
                onClick={() => {
                  setS(fresh());
                  setRunning(false);
                }}
              >
                Reset
              </button>
            </div>
          </div>
          <div className="dg-toggle">
            <span className="dg-label">Config</span>
            <Switch checked={nodelay} onChange={setNodelay}>
              nodelay
            </Switch>
          </div>
        </>
      }
    >
      <div className="rl">
        <div className="rl-bucket-wrap">
          <div
            className="rl-bucket"
            role="meter"
            aria-label="Bucket fill (excess requests)"
            aria-valuemin={0}
            aria-valuemax={BURST}
            aria-valuenow={Number(level.toFixed(1))}
          >
            <span className="rl-water" style={{ height: `${(level / BURST) * 100}%` }} />
            {Array.from({ length: BURST }, (_, i) => (
              <span key={i} className="rl-mark" style={{ bottom: `${((i + 1) / BURST) * 100}%` }} />
            ))}
          </div>
          <div className="rl-bucket-label">
            <strong>{fmt(level)}</strong> / {BURST} excess
            <span>drains {RATE}/s</span>
          </div>

        </div>
        <div className="rl-timeline">
          <div className="rl-axis" aria-hidden="true">
            {Array.from({ length: WINDOW + 1 }, (_, i) => Math.ceil(start) + i)
              .filter((x) => x <= start + WINDOW)
              .map((x) => (
                <span key={x} style={{ left: pos(x) }}>
                  {x}s
                </span>
              ))}
          </div>
          <div className="rl-now-wrap" aria-hidden="true">
            <span className="rl-now" style={{ left: pos(s.t) }} />
          </div>
          <ol className="rl-rows" aria-label="Requests: arrival and when they were served">
            {recent.map((r) => {
              const done = r.serveAt !== null && r.serveAt <= s.t;
              const label =
                r.serveAt === null
                  ? `#${r.id} at ${fmt(r.at)}s: rejected (429)`
                  : done
                    ? `#${r.id} at ${fmt(r.at)}s: served at ${fmt(r.serveAt)}s`
                    : `#${r.id} at ${fmt(r.at)}s: queued until ${fmt(r.serveAt)}s`;
              return (
                <li key={r.id} className="rl-row" aria-label={label}>
                  <span className="rl-id">#{r.id}</span>
                  <span className="rl-track">
                    {r.serveAt !== null && r.serveAt > r.at && (
                      <span
                        className={`rl-wait${done ? '' : ' is-live'}`}
                        style={{ left: pos(r.at), width: `calc(${pos(Math.min(r.serveAt, s.t))} - ${pos(r.at)})` }}
                      />
                    )}
                    <span
                      className={`rl-dot ${r.serveAt === null ? 'is-rej' : done ? 'is-ok' : 'is-queued'}`}
                      style={{ left: pos(r.serveAt === null ? r.at : done ? r.serveAt : r.at) }}
                    >
                      {r.serveAt === null ? '✗' : ''}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
        <pre className="dg-code rl-conf" tabIndex={0} aria-label="nginx configuration">
          <code>{`limit_req_zone $binary_remote_addr
    zone=api:10m rate=${RATE}r/s;
limit_req zone=api burst=${BURST}${nodelay ? ' nodelay' : ''};
limit_req_status 429;`}</code>
        </pre>
      </div>
    </DiagramFrame>
  );
}
