import { useState } from 'react';
import DiagramFrame from './DiagramFrame';
import { Switch, ToggleGroup } from './shared';

const RATES = ['100', '300', '500', '1000'] as const;
type Rate = (typeof RATES)[number];
const TIME_WAIT = 60; // seconds, fixed in Linux
const DEFAULT_RANGE = 60999 - 32768 + 1; // net.ipv4.ip_local_port_range = 32768 60999
const WIDE_RANGE = 65535 - 1024 + 1; // 1024 65535
const REQS_PER_CONN = 1000; // with keep-alive, one connection serves many requests

export default function EphemeralPorts() {
  const [rate, setRate] = useState<Rate>('500');
  const [keepalive, setKeepalive] = useState(false);
  const [wide, setWide] = useState(false);
  const [backends, setBackends] = useState<'1' | '2' | '4'>('1');

  const reqs = Number(rate);
  const newConns = keepalive ? reqs / REQS_PER_CONN : reqs; // new connections per second
  const inTimeWait = Math.round(newConns * TIME_WAIT); // Little's law: L = λ × W
  const range = wide ? WIDE_RANGE : DEFAULT_RANGE;
  const capacity = range * Number(backends); // ports are per (src IP, dst IP, dst port)
  const pct = Math.min(100, (inTimeWait / capacity) * 100);
  const exhausted = inTimeWait >= capacity;
  const maxRate = Math.floor(capacity / TIME_WAIT);

  return (
    <DiagramFrame
      title="Ephemeral ports and TIME_WAIT"
      subtitle="a proxy opening connections to its backends"
      status={
        <>
          Each closed connection leaves its local port in <strong>TIME_WAIT</strong> for {TIME_WAIT} s (<a href="/part-1-networking/#concept-1-5">1.5</a>), on whichever side closed first: for a proxy that closes its backend connections, that's the proxy. So the ports
          held at any moment = new connections per second × {TIME_WAIT} s ={' '}
          <strong>
            {newConns.toLocaleString('en-US', { maximumFractionDigits: 1 })} × {TIME_WAIT} ≈ {inTimeWait.toLocaleString('en-US')}
          </strong>{' '}
          (that's Little's law). The usable ports: {range.toLocaleString('en-US')} per backend address × {backends} ={' '}
          {capacity.toLocaleString('en-US')}.{' '}
          {exhausted ? (
            <>
              <span className="dg-pill bad">exhausted</span> New connections fail with <code>EADDRNOTAVAIL</code>, “Cannot
              assign requested address”, and the proxy returns 502s. The ceiling is about {maxRate.toLocaleString('en-US')}{' '}
              new connections per second.
            </>
          ) : keepalive ? (
            <>
              <span className="dg-pill ok">fine</span> With keep-alive, connections are reused for many requests, so hardly
              any are opened or closed. This is the real fix.
            </>
          ) : (
            <>
              <span className="dg-pill warn">{Math.round(pct)}% used</span> Working, with headroom up to about{' '}
              {maxRate.toLocaleString('en-US')} new connections per second.
            </>
          )}
        </>
      }
      controls={
        <>
          <ToggleGroup label="Requests per second to the backends" value={rate} onChange={setRate} options={RATES.map((r) => ({ value: r, label: Number(r).toLocaleString('en-US') }))} />
          <ToggleGroup label="Backend addresses" value={backends} onChange={setBackends} options={[{ value: '1', label: '1' }, { value: '2', label: '2' }, { value: '4', label: '4' }]} />
          <div className="dg-toggle">
            <span className="dg-label">Fixes</span>
            <div className="dg-btn-group">
              <Switch checked={keepalive} onChange={setKeepalive}>
                Keep-alive to backends
              </Switch>
              <Switch checked={wide} onChange={setWide}>
                Wider port range
              </Switch>
            </div>
          </div>
        </>
      }
    >
      <div className="eph">
        <div className="eph-meter" role="meter" aria-label="Local ports held in TIME_WAIT" aria-valuemin={0} aria-valuemax={capacity} aria-valuenow={Math.min(inTimeWait, capacity)}>
          <span className={exhausted ? 'is-full' : pct > 70 ? 'is-high' : ''} style={{ width: `${pct}%` }} />
        </div>
        <div className="eph-legend">
          <span>
            <strong>{Math.min(inTimeWait, capacity).toLocaleString('en-US')}</strong> ports in TIME_WAIT
          </span>
          <span>{capacity.toLocaleString('en-US')} available</span>
        </div>
        <dl className="as-facts eph-facts">
          <div>
            <dt>Port range</dt>
            <dd>
              <code>net.ipv4.ip_local_port_range = {wide ? '1024 65535' : '32768 60999'}</code>
            </dd>
          </div>
          <div>
            <dt>Why more backends help</dt>
            <dd>A connection is a 4-tuple (<a href="/part-1-networking/#concept-1-6">1.6</a>): the same local port can be reused towards a different backend IP or port.</dd>
          </div>
          <div>
            <dt>Also helps</dt>
            <dd>
              <code>net.ipv4.tcp_tw_reuse=1</code> lets new outgoing connections reuse ports in TIME_WAIT safely (it relies on TCP timestamps).
            </dd>
          </div>
        </dl>
      </div>
    </DiagramFrame>
  );
}
