import { useState, type ReactNode } from 'react';
import DiagramFrame from './DiagramFrame';

type Seg = 'c1' | 'c2' | 'r2' | 'r1';

interface Scenario {
  code: string;
  name: string;
  /** Which of the two connections failed. */
  conn: 1 | 2 | 0;
  /** The path the request takes; the last segment is where it stops if `failAt` is set. */
  path: Seg[];
  failAt?: Seg;
  cause: ReactNode;
  directive: ReactNode;
  status: string;
  upstream: string;
  errorLog?: string;
  fix: ReactNode;
}

const SCENARIOS: Scenario[] = [
  {
    code: '502',
    name: 'Bad Gateway',
    conn: 2,
    path: ['c1', 'c2'],
    failAt: 'c2',
    cause: <>The backend is down, crashed or on the wrong port: nginx's connect() was refused.</>,
    directive: <>no timeout involved: the TCP connect got an RST</>,
    status: '502',
    upstream: '502',
    errorLog: 'connect() failed (111: Connection refused) while connecting to upstream',
    fix: <>Start the app, or fix the port in <code>proxy_pass</code>. Check with curl from the nginx host.</>,
  },
  {
    code: '504',
    name: 'Gateway Timeout',
    conn: 2,
    path: ['c1', 'c2'],
    failAt: 'r2',
    cause: <>The backend accepted the request but didn't send response headers in time.</>,
    directive: (
      <>
        <code>proxy_read_timeout</code> (default 60s); <code>proxy_connect_timeout</code> if it never connects
      </>
    ),
    status: '504',
    upstream: '504',
    errorLog: 'upstream timed out (110: Connection timed out) while reading response header from upstream',
    fix: <>Find the slow query or call (<code>$upstream_response_time</code>), or raise the timeout on purpose.</>,
  },
  {
    code: '503',
    name: 'Service Unavailable',
    conn: 0,
    path: ['c1', 'c2', 'r2', 'r1'],
    cause: <>The app itself answered 503 (overloaded, in maintenance) and nginx passed it through.</>,
    directive: <>none: both connections worked</>,
    status: '503',
    upstream: '503',
    fix: <>When $status and $upstream_status match, the backend said it. Look in the app's logs, not nginx's.</>,
  },
  {
    code: '499',
    name: 'Client Closed Request',
    conn: 1,
    path: ['c1', 'c2'],
    failAt: 'r1',
    cause: <>The client (or a load balancer in front) gave up and closed the connection before nginx could reply.</>,
    directive: <>the client's own timeout, shorter than the app's response time</>,
    status: '499',
    upstream: '- (or 200 later)',
    errorLog: 'client prematurely closed connection while reading upstream (info level)',
    fix: <>Compare <code>$request_time</code> with the client or load balancer timeout. Something in front is less patient than the app.</>,
  },
  {
    code: '413',
    name: 'Content Too Large',
    conn: 1,
    path: ['c1'],
    failAt: 'c1',
    cause: <>The upload is bigger than nginx allows. nginx rejects it before contacting the backend at all.</>,
    directive: (
      <>
        <code>client_max_body_size</code> (default 1m)
      </>
    ),
    status: '413',
    upstream: '-',
    errorLog: 'client intended to send too large body: 5242880 bytes',
    fix: <>Raise <code>client_max_body_size</code> for that location, if large uploads are expected.</>,
  },
  {
    code: '408',
    name: 'Request Timeout',
    conn: 1,
    path: ['c1'],
    failAt: 'c1',
    cause: <>The client connected but sent its headers or body too slowly (a slow client or Slowloris).</>,
    directive: (
      <>
        <code>client_header_timeout</code> / <code>client_body_timeout</code> (default 60s)
      </>
    ),
    status: '408',
    upstream: '-',
    errorLog: 'client timed out (110: Connection timed out) while reading client request headers',
    fix: <>Usually nothing: nginx is protecting the backend. Lots of them can mean an attack or a broken client.</>,
  },
];

const SEG_LABEL: Record<Seg, string> = {
  c1: 'request',
  c2: 'proxied request',
  r2: 'response',
  r1: 'response',
};

export default function ReverseProxyErrors() {
  const [code, setCode] = useState('502');
  const s = SCENARIOS.find((x) => x.code === code)!;
  const segs: Seg[] = s.failAt && !s.path.includes(s.failAt) ? [...s.path, s.failAt] : s.path;
  const segState = (seg: Seg) => {
    const i = segs.indexOf(seg);
    if (i < 0) return { cls: 'is-unused', delay: 0 };
    return { cls: seg === s.failAt ? 'is-fail' : 'is-ok', delay: i * 0.7 };
  };

  const lane = (seg: Seg, dir: 'right' | 'left') => {
    const st = segState(seg);
    return (
      <div className={`rp-lane dir-${dir} ${st.cls}`} style={{ ['--d' as string]: `${st.delay}s` }}>
        <span className="rp-arrow" />
        {st.cls !== 'is-unused' && <span className="rp-dot" />}
        {st.cls === 'is-fail' && <span className="rp-x">✗</span>}
        <span className="rp-lane-label">{SEG_LABEL[seg]}</span>
      </div>
    );
  };

  return (
    <DiagramFrame
      title="Reverse proxy"
      subtitle="2 connections, 6 error codes, their timeouts"
      status={
        <div className="dg-detail">
          <div>
            <strong>
              {s.code} {s.name}.
            </strong>{' '}
            {s.cause}
          </div>
          <dl>
            <dt>Timeout / limit</dt>
            <dd>{s.directive}</dd>
            <dt>access.log</dt>
            <dd>
              <code>
                $status={s.status} $upstream_status={s.upstream}
              </code>
            </dd>
            {s.errorLog && (
              <>
                <dt>error.log</dt>
                <dd>
                  <code>{s.errorLog}</code>
                </dd>
              </>
            )}
            <dt>Fix</dt>
            <dd>{s.fix}</dd>
          </dl>
        </div>
      }
      controls={
        <div className="dg-toggle" role="group" aria-label="Status code">
          <span className="dg-label">Status code</span>
          <div className="dg-btn-group">
            {SCENARIOS.map((x) => (
              <button key={x.code} type="button" className="dg-btn" aria-pressed={code === x.code} onClick={() => setCode(x.code)}>
                {x.code}
              </button>
            ))}
          </div>
        </div>
      }
    >
      <div
        className="rp"
        key={code}
        role="img"
        aria-label={`${s.code}: ${s.conn === 0 ? 'both connections succeed' : `connection ${s.conn} fails`}`}
      >
        <div className="rp-node">
          <strong>Client</strong>
          <span>browser</span>
        </div>
        <div className={`rp-conn${s.conn === 1 ? ' is-bad' : ''}`}>
          <span className="rp-conn-label">connection 1</span>
          {lane('c1', 'right')}
          {lane('r1', 'left')}
        </div>
        <div className="rp-node is-proxy">
          <strong>nginx</strong>
          <span>proxy</span>
        </div>
        <div className={`rp-conn${s.conn === 2 ? ' is-bad' : ''}`}>
          <span className="rp-conn-label">connection 2</span>
          {lane('c2', 'right')}
          {lane('r2', 'left')}
        </div>
        <div className={`rp-node${s.code === '502' ? ' is-down' : ''}`}>
          <strong>Backend</strong>
          <span>{s.code === '502' ? 'down' : s.code === '504' ? 'slow' : 'app'}</span>
        </div>
      </div>
      <div className="rp-codes" aria-hidden="true">
        {SCENARIOS.map((x) => (
          <span key={x.code} className={`rp-code-chip conn-${x.conn}${x.code === code ? ' is-sel' : ''}`}>
            {x.code} · {x.conn === 0 ? 'from app' : `conn ${x.conn}`}
          </span>
        ))}
      </div>
    </DiagramFrame>
  );
}
