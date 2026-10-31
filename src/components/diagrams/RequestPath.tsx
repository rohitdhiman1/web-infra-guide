import { useState, type ReactNode } from 'react';
import DiagramFrame from './DiagramFrame';
import { StepControls, ToggleGroup, arrowKeys, useStepper } from './shared';

interface Hop {
  id: string;
  name: string;
  example: string;
  does: ReactNode;
  timeout: ReactNode;
  /** If this hop fails, who answers the client, and with what. */
  fail: { what: string; answeredBy: number; client: string; why: ReactNode };
}

const CLIENT = { name: 'Client', example: 'browser' };

const HOPS: Hop[] = [
  {
    id: 'dns',
    name: 'DNS',
    example: 'Route 53',
    does: <>Turns the name into the CDN's IP, usually through a CNAME to the CDN's hostname.</>,
    timeout: <>the record's TTL decides how long old answers live</>,
    fail: { what: 'record missing', answeredBy: -1, client: 'Could not resolve host', why: <>No IP, so no HTTP request is ever sent. No server logs anything.</> },
  },
  {
    id: 'cdn',
    name: 'CDN',
    example: 'CloudFront / Cloudflare',
    does: <>Terminates TLS near the user, serves cached static assets, absorbs DDoS. Cache misses go on to the origin.</>,
    timeout: <>origin connect and read timeouts (often 30–60 s)</>,
    fail: { what: 'edge outage', answeredBy: -1, client: 'connection error / CDN error page', why: <>Rare, and out of your hands. Everything behind it is fine.</> },
  },
  {
    id: 'lb',
    name: 'Cloud load balancer',
    example: 'AWS ALB',
    does: <>Health-checks nginx nodes across zones, often terminates TLS with a managed certificate.</>,
    timeout: <>idle timeout 60 s (nginx's keep-alive must be longer)</>,
    fail: { what: 'no healthy targets', answeredBy: 1, client: '503', why: <>Every target failed its health check, so the CDN gets a 503 from the load balancer and passes it on.</> },
  },
  {
    id: 'nginx',
    name: 'nginx',
    example: 'reverse proxy',
    does: <>Routes by host and path, rate limits, microcaches, buffers slow clients, logs timings.</>,
    timeout: <>proxy_read_timeout 60 s, client_body_timeout 60 s</>,
    fail: { what: 'nginx down on one node', answeredBy: 2, client: '502', why: <>The load balancer's connection to that node fails. Until the health check marks it unhealthy, some users get a 502 from the load balancer.</> },
  },
  {
    id: 'appserver',
    name: 'App server',
    example: 'Gunicorn',
    does: <>Manages worker processes and turns HTTP into WSGI calls.</>,
    timeout: <>--timeout 30 s: kills a stuck worker</>,
    fail: { what: 'Gunicorn not running', answeredBy: 3, client: '502', why: <>nginx's connect() to the socket is refused. nginx answers 502 and logs "connect() failed (111: Connection refused)".</> },
  },
  {
    id: 'app',
    name: 'App',
    example: 'Django',
    does: <>Your code: routing, business logic, templates. Calls the database.</>,
    timeout: <>your own HTTP-client and query timeouts</>,
    fail: {
      what: 'slow view (90 s)',
      answeredBy: 3,
      client: '502',
      why: (
        <>
          Gunicorn's 30 s worker timeout fires first and kills the worker, so nginx sees the connection close and
          answers 502 ("upstream prematurely closed connection"), well before its own 60 s proxy_read_timeout. The
          inner timeout fired first and logged why, which is what the timeout chain wants (13.9).
        </>
      ),
    },
  },
  {
    id: 'db',
    name: 'Database',
    example: 'PostgreSQL',
    does: <>Stores the data. Often the real reason a request is slow.</>,
    timeout: <>statement_timeout, connection pool timeout</>,
    fail: { what: 'database down', answeredBy: 5, client: '500', why: <>Django raises an exception and returns 500. Every proxy above passes it through: $status and $upstream_status are both 500.</> },
  },
];

export default function RequestPath() {
  const [mode, setMode] = useState<'follow' | 'break'>('follow');
  const [broken, setBroken] = useState(6);
  const stepper = useStepper(HOPS.length + 1);
  const at = stepper.step; // 0 = at the client; 1..7 = reached hop at-1

  const brokenHop = HOPS[broken];
  const answeredBy = brokenHop.fail.answeredBy;

  const nodeState = (i: number) => {
    if (mode === 'follow') return i < at ? 'is-passed' : i === at - 1 ? 'is-current' : '';
    if (i === broken) return 'is-broken';
    if (i === answeredBy) return 'is-answers';
    if (i < broken && (answeredBy === -1 ? false : i < answeredBy)) return 'is-relay';
    if (i < broken) return 'is-passed';
    return 'is-unreached';
  };

  const status =
    mode === 'follow' ? (
      at === 0 ? (
        <>A user opens <code>https://shop.example.com/cart</code>. Press Next to follow the request inward, one connection at a time.</>
      ) : (
        <div className="dg-detail">
          <div>
            <strong>
              Hop {at}: {HOPS[at - 1].name}
            </strong>{' '}
            ({HOPS[at - 1].example}). {HOPS[at - 1].does}
          </div>
          <div>
            <span className="dg-pill muted">timeouts</span> {HOPS[at - 1].timeout}
          </div>
        </div>
      )
    ) : (
      <div className="dg-detail">
        <div>
          <strong>{brokenHop.name}: {brokenHop.fail.what}.</strong> The client sees{' '}
          <span className="dg-pill bad">{brokenHop.fail.client}</span>
          {answeredBy >= 0 && <>, generated by <strong>{HOPS[answeredBy].name}</strong></>}.
        </div>
        <div>{brokenHop.fail.why}</div>
      </div>
    );

  return (
    <DiagramFrame
      title="Request path"
      subtitle="7 hops from client to database"
      onKeyDown={mode === 'follow' ? arrowKeys(stepper.prev, stepper.next) : undefined}
      status={status}
      controls={
        <>
          <ToggleGroup
            label="Mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'follow', label: 'Follow the request' },
              { value: 'break', label: 'Break a hop' },
            ]}
          />
          {mode === 'follow' ? (
            <StepControls stepper={stepper} counter={at === 0 ? 'Start' : `Hop ${at} of ${HOPS.length}`} />
          ) : (
            <div className="dg-toggle" role="group" aria-label="Which hop fails">
              <span className="dg-label">Which hop fails?</span>
              <div className="dg-btn-group">
                {HOPS.map((h, i) => (
                  <button key={h.id} type="button" className="dg-btn" aria-pressed={broken === i} onClick={() => setBroken(i)}>
                    {h.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      }
    >
      <ol className="rq" aria-label="Hops from client to database" key={`${mode}-${broken}`}>
        <li className={`rq-node is-client${mode === 'break' && answeredBy === -1 ? ' is-answers' : ''}`}>
          <span className="rq-num">0</span>
          <span className="rq-text">
            <strong>{CLIENT.name}</strong>
            <span>{CLIENT.example}</span>
          </span>
          {mode === 'break' && <span className="dg-pill bad rq-sees">sees {brokenHop.fail.client}</span>}
        </li>
        {HOPS.map((h, i) => (
          <li key={h.id} className={`rq-node ${nodeState(i)}`} style={{ ['--i' as string]: i }}>
            <span className="rq-link" aria-hidden="true" />
            <span className="rq-num">{i + 1}</span>
            <span className="rq-text">
              <strong>{h.name}</strong>
              <span>{h.example}</span>
            </span>
            {mode === 'break' && i === broken && <span className="dg-pill bad">✗ {h.fail.what}</span>}
            {mode === 'break' && i === answeredBy && <span className="dg-pill warn">answers {h.fail.client}</span>}
          </li>
        ))}
      </ol>
    </DiagramFrame>
  );
}
