import { useState } from 'react';
import DiagramFrame from './DiagramFrame';
import { Switch } from './shared';

const VALID = 60; // proxy_cache_valid 200 60s
const WAIT = 40;

type CacheStatus = 'MISS' | 'HIT' | 'EXPIRED' | 'STALE' | 'ERROR';
interface Resp {
  n: number;
  t: number;
  cache: CacheStatus;
  code: number;
  backend: 'called' | 'not called' | 'failed';
}
interface State {
  t: number;
  /** Time the cached copy was stored, or null if empty. */
  storedAt: number | null;
  backendUp: boolean;
  useStale: boolean;
  log: Resp[];
}

const fresh = (): State => ({ t: 0, storedAt: null, backendUp: true, useStale: true, log: [] });

function request(s: State): State {
  const n = s.log.length + 1;
  const age = s.storedAt === null ? null : s.t - s.storedAt;
  const isFresh = age !== null && age < VALID;
  let r: Resp;
  let storedAt = s.storedAt;
  if (isFresh) {
    r = { n, t: s.t, cache: 'HIT', code: 200, backend: 'not called' };
  } else if (s.backendUp) {
    r = { n, t: s.t, cache: s.storedAt === null ? 'MISS' : 'EXPIRED', code: 200, backend: 'called' };
    storedAt = s.t;
  } else if (s.storedAt !== null && s.useStale) {
    r = { n, t: s.t, cache: 'STALE', code: 200, backend: 'failed' };
  } else {
    r = { n, t: s.t, cache: 'ERROR', code: 502, backend: 'failed' };
  }
  return { ...s, storedAt, log: [r, ...s.log].slice(0, 7) };
}

const EXPLAIN: Record<CacheStatus, string> = {
  MISS: 'Nothing cached yet, so nginx asked the backend and stored the response for 60 s.',
  HIT: "Served straight from nginx's cache. The backend never saw this request.",
  EXPIRED: 'The cached copy was too old, so nginx fetched a fresh one from the backend and stored it again.',
  STALE:
    'The copy had expired and the backend is down, but proxy_cache_use_stale served the old copy anyway. Users see a page, not an error.',
  ERROR: 'The copy expired, the backend is down and serving stale content is off: the user gets a 502.',
};

const PILL: Record<CacheStatus, string> = { MISS: 'info', HIT: 'ok', EXPIRED: 'warn', STALE: 'warn', ERROR: 'bad' };

export default function ProxyCache() {
  const [s, setS] = useState<State>(fresh);
  const age = s.storedAt === null ? null : s.t - s.storedAt;
  const expired = age !== null && age >= VALID;
  const last = s.log[0];
  const seen = new Set(s.log.map((r) => r.cache));

  return (
    <DiagramFrame
      title="Proxy cache simulator"
      subtitle="HIT, MISS, EXPIRED, STALE"
      status={
        last ? (
          <>
            <span className={`dg-pill ${PILL[last.cache]}`}>
              {last.cache === 'ERROR' ? '502' : `X-Cache-Status: ${last.cache}`}
            </span>{' '}
            {EXPLAIN[last.cache]}
          </>
        ) : (
          <>Try: send, send again, wait twice, take the backend down, send.</>
        )
      }
      controls={
        <>
          <div className="dg-toggle">
            <span className="dg-label">Actions</span>
            <div className="dg-btn-group">
              <button type="button" className="dg-btn is-primary" onClick={() => setS(request)}>
                Send request
              </button>
              <button type="button" className="dg-btn" onClick={() => setS((st) => ({ ...st, t: st.t + WAIT }))}>
                Wait {WAIT} s
              </button>
              <button type="button" className="dg-btn" onClick={() => setS(fresh())}>
                Reset
              </button>
            </div>
          </div>
          <div className="dg-toggle">
            <span className="dg-label">Setup</span>
            <div className="dg-btn-group">
              <Switch checked={s.backendUp} onChange={(v) => setS((st) => ({ ...st, backendUp: v }))}>
                Backend up
              </Switch>
              <Switch checked={s.useStale} onChange={(v) => setS((st) => ({ ...st, useStale: v }))}>
                proxy_cache_use_stale
              </Switch>
            </div>
          </div>
        </>
      }
    >
      <div className="pc">
        <div className="pc-path" key={last?.n ?? 0}>
          <div className="pc-node">
            <strong>Client</strong>
            <span>t = {s.t}s</span>
          </div>
          <div className={`pc-link${last ? ' is-active' : ''}`} aria-hidden="true" />
          <div className="pc-node is-cache">
            <strong>nginx cache</strong>
            {s.storedAt === null ? (
              <span className="dg-pill muted">empty</span>
            ) : (
              <>
                <span className={`dg-pill ${expired ? 'warn' : 'ok'}`}>
                  {expired ? `expired ${age! - VALID}s ago` : `fresh for ${VALID - age!}s`}
                </span>
                <span className="pc-ttl" aria-hidden="true">
                  <span style={{ width: `${Math.max(0, 100 - (age! / VALID) * 100)}%` }} />
                </span>
              </>
            )}
          </div>
          <div
            className={`pc-link${last?.backend === 'called' ? ' is-active' : ''}${last?.backend === 'failed' ? ' is-failed' : ''}`}
            aria-hidden="true"
          />
          <div className={`pc-node${s.backendUp ? '' : ' is-down'}`}>
            <strong>Backend</strong>
            <span className={`dg-pill ${s.backendUp ? 'ok' : 'bad'}`}>{s.backendUp ? 'up' : 'down'}</span>
          </div>
        </div>
        <pre className="dg-code" tabIndex={0} aria-label="nginx cache configuration">
          <code>{`proxy_cache_valid 200 ${VALID}s;
add_header X-Cache-Status $upstream_cache_status;
${s.useStale ? '' : '# '}proxy_cache_use_stale error timeout http_502 http_503;`}</code>
        </pre>
        <div className="pc-seen" aria-label="Cache statuses seen so far">
          {(['MISS', 'HIT', 'EXPIRED', 'STALE'] as CacheStatus[]).map((c) => (
            <span key={c} className={`dg-pill ${seen.has(c) ? PILL[c] : 'muted'}`}>
              {seen.has(c) ? '✓ ' : ''}
              {c}
            </span>
          ))}
        </div>
        {s.log.length > 0 && (
          <ol className="pc-log" aria-label="Responses, newest first">
            {s.log.map((r) => (
              <li key={r.n}>
                <span className="pc-log-n">
                  #{r.n} · t={r.t}s
                </span>
                <span className={`dg-pill ${PILL[r.cache]}`}>{r.cache === 'ERROR' ? '502' : r.cache}</span>
                <span className="pc-log-b">backend {r.backend}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </DiagramFrame>
  );
}
