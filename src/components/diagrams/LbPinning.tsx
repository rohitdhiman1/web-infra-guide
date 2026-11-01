import { useState } from 'react';
import DiagramFrame from './DiagramFrame';
import { Switch, ToggleGroup } from './shared';

type Lb = 'l4' | 'l7' | 'age';

// Three clients, each with ONE long-lived HTTP/2 (gRPC) connection carrying all its requests.
const CLIENTS = [
  { name: 'checkout-service', rps: 600 },
  { name: 'reporting-job', rps: 150 },
  { name: 'mobile-bff', rps: 150 },
];

function load(lb: Lb, backends: number, recycled: boolean) {
  const out = Array(backends).fill(0);
  if (lb === 'l7') {
    // Each request is balanced on its own: perfectly even.
    const total = CLIENTS.reduce((s, c) => s + c.rps, 0);
    return out.map(() => total / backends);
  }
  if (lb === 'age' && recycled) {
    // Connections are closed every few minutes and reopened; over time each client's traffic
    // spreads across the backends (here shown as the average over many reconnections).
    const total = CLIENTS.reduce((s, c) => s + c.rps, 0);
    return out.map(() => total / backends);
  }
  // Layer 4: each connection was assigned a backend when it opened, and stays there.
  CLIENTS.forEach((c, i) => {
    out[i % 3] += c.rps; // connections opened when there were 3 backends
  });
  return out;
}

export default function LbPinning() {
  const [lb, setLb] = useState<Lb>('l4');
  const [four, setFour] = useState(false);
  const [recycled, setRecycled] = useState(false);
  const backends = four ? 4 : 3;
  const l = load(lb, backends, recycled);
  const max = Math.max(...l, 1);
  const hot = Math.max(...l);
  const idle = l.filter((x) => x === 0).length;

  let text;
  if (lb === 'l7') {
    text = <>A layer-7 balancer (Envoy, nginx with <code>grpc_pass</code>, an ALB in gRPC mode) understands HTTP/2 and balances <strong>each request</strong> across backends, so the load is even, and a new backend gets traffic immediately.</>;
  } else if (lb === 'age') {
    text = recycled
      ? <>The server sets a <strong>maximum connection age</strong> (gRPC's <code>MAX_CONNECTION_AGE</code>): every few minutes it sends GOAWAY, and clients reconnect, possibly to a different backend. Averaged over time, load evens out, and new backends start receiving traffic within one connection lifetime.</>
      : <>Connection-age limits are configured, but no connections have been recycled yet: until they are, every client stays pinned exactly as with plain layer 4. Switch on “Time passes”.</>;
  } else {
    text = <>A layer-4 balancer (an NLB, a TCP proxy, kube-proxy) picks a backend <strong>once per connection</strong>. HTTP/2 puts all of a client's requests on one long-lived connection, so the busy checkout-service pins {CLIENTS[0].rps} req/s on one backend{four ? ', and the new fourth backend receives nothing, because no new connections were opened' : ''}. HTTP/1.1 clients open many connections, which hides this problem.</>;
  }

  return (
    <DiagramFrame
      title="Long-lived connections vs load balancing"
      subtitle="3 gRPC clients, one HTTP/2 connection each"
      status={
        <>
          {text}{' '}
          <span className="cs-stats">
            Busiest backend: {Math.round(hot)} req/s{idle ? ` · ${idle} backend${idle > 1 ? 's' : ''} idle` : ''}
          </span>
        </>
      }
      controls={
        <>
          <ToggleGroup
            label="Balancer"
            value={lb}
            onChange={setLb}
            options={[
              { value: 'l4', label: 'Layer 4 (per connection)' },
              { value: 'l7', label: 'Layer 7 (per request)' },
              { value: 'age', label: 'Layer 4 + max connection age' },
            ]}
          />
          <div className="dg-toggle">
            <span className="dg-label">Events</span>
            <div className="dg-btn-group">
              <Switch checked={four} onChange={setFour}>
                Scale out: add a 4th backend
              </Switch>
              {lb === 'age' && (
                <Switch checked={recycled} onChange={setRecycled}>
                  Time passes (connections recycle)
                </Switch>
              )}
            </div>
          </div>
        </>
      }
    >
      <div className="lbp">
        {l.map((v, i) => (
          <div key={i} className="lbp-row">
            <span className="lbp-name">backend {i + 1}{i === 3 ? ' (new)' : ''}</span>
            <div className="lbp-bar" role="meter" aria-label={`backend ${i + 1} load`} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(v)}>
              <span className={v === hot && hot > 400 ? 'is-hot' : v === 0 ? 'is-idle' : ''} style={{ width: `${(v / max) * 100}%` }} />
            </div>
            <span className="lbp-val">{Math.round(v)} req/s</span>
          </div>
        ))}
      </div>
    </DiagramFrame>
  );
}
