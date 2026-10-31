import { useState } from 'react';
import DiagramFrame from './DiagramFrame';
import { Switch, ToggleGroup } from './shared';

const THREADS_MAX = 200; // server.tomcat.threads.max
const MAX_CONN = 8192; // server.tomcat.max-connections
const ACCEPT_COUNT = 100; // server.tomcat.accept-count (listen backlog)
const SERVICE = 2; // /slow sleeps 2 seconds (blocking I/O)
const CARRIERS = 8; // CPU cores → carrier threads for virtual threads

const LOADS = ['100', '400', '1000', '10000'] as const;
type Load = (typeof LOADS)[number];

/** Closed-loop load test: `n` clients, each sending its next request as soon as the last one returns. */
function model(n: number, virtual: boolean) {
  const accepted = Math.min(n, MAX_CONN);
  const backlog = Math.min(Math.max(0, n - MAX_CONN), ACCEPT_COUNT);
  const refused = Math.max(0, n - MAX_CONN - ACCEPT_COUNT);
  const running = virtual ? accepted : Math.min(accepted, THREADS_MAX);
  const waiting = accepted - running; // accepted by the poller, waiting for a worker thread
  const throughput = running / SERVICE; // req/s
  const latency = accepted / throughput; // Little's law: in-flight / throughput
  const osThreads = virtual ? CARRIERS : THREADS_MAX;
  return { accepted, backlog, refused, running, waiting, throughput, latency, osThreads };
}

function Gauge({ label, value, max, tone, note }: { label: string; value: number; max: number; tone: string; note: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="tc-gauge">
      <div className="tc-gauge-head">
        <span>{label}</span>
        <strong>
          {value.toLocaleString('en-US')} / {max.toLocaleString('en-US')}
        </strong>
      </div>
      <div
        className="tc-bar"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
      >
        <span className={`tone-${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="tc-note">{note}</div>
    </div>
  );
}

export default function TomcatConnector() {
  const [load, setLoad] = useState<Load>('400');
  const [virtual, setVirtual] = useState(false);
  const n = Number(load);
  const m = model(n, virtual);
  const base = model(n, !virtual);
  const fullThreads = !virtual && m.running >= THREADS_MAX;
  const sat = m.refused > 0;

  let verdict;
  if (sat) {
    verdict = (
      <>
        <strong>Past max-connections.</strong> The poller holds {MAX_CONN.toLocaleString('en-US')} connections, the
        backlog holds {ACCEPT_COUNT} more, and {m.refused.toLocaleString('en-US')} clients get timeouts while{' '}
        <code>ListenOverflows</code> climbs. Virtual threads moved the limit, they didn't remove it.
      </>
    );
  } else if (virtual) {
    verdict = (
      <>
        <strong>Virtual threads.</strong> Each of the {m.accepted.toLocaleString('en-US')} requests gets its own cheap
        virtual thread. While it sleeps on I/O it parks and frees one of the {CARRIERS} carrier (OS) threads, so
        latency stays at {SERVICE}s. <code>max-connections</code> is now the real limit.
        {base.latency > SERVICE && <> With platform threads, this load took {base.latency.toFixed(1)}s.</>}
      </>
    );
  } else if (fullThreads && m.waiting > 0) {
    verdict = (
      <>
        <strong>Thread pool exhausted.</strong> All {THREADS_MAX} worker threads are blocked in the 2-second sleep, and{' '}
        {m.waiting.toLocaleString('en-US')} requests wait for one. Latency grows from {SERVICE}s to{' '}
        {m.latency.toFixed(1)}s. Flip virtual threads on.
      </>
    );
  } else {
    verdict = (
      <>
        <strong>Under the thread cap.</strong> {m.running} of {THREADS_MAX} worker threads are busy; every request
        gets a thread at once and takes {SERVICE}s. Try a bigger load.
      </>
    );
  }

  return (
    <DiagramFrame
      title="Tomcat connector simulator"
      subtitle="platform vs virtual threads"
      status={verdict}
      controls={
        <>
          <ToggleGroup
            label="Concurrent clients (wrk -c)"
            value={load}
            onChange={setLoad}
            options={LOADS.map((l) => ({ value: l, label: Number(l).toLocaleString('en-US') }))}
          />
          <div className="dg-toggle">
            <span className="dg-label">Spring Boot</span>
            <Switch checked={virtual} onChange={setVirtual}>
              spring.threads.virtual.enabled
            </Switch>
          </div>
        </>
      }
    >
      <div className="tc">
        <div className="tc-flow" aria-hidden="true">
          <span className="tc-stage">listen backlog</span>
          <span className="tc-arrow">→</span>
          <span className="tc-stage">NIO poller (epoll)</span>
          <span className="tc-arrow">→</span>
          <span className="tc-stage is-acc">{virtual ? 'virtual threads' : 'worker pool'}</span>
          <span className="tc-arrow">→</span>
          <span className="tc-stage">your /slow code</span>
        </div>
        <div className="tc-gauges">
          <Gauge
            label="accept-count (listen backlog)"
            value={m.backlog}
            max={ACCEPT_COUNT}
            tone={m.backlog >= ACCEPT_COUNT ? 'bad' : 'info'}
            note={sat ? `full: ${m.refused.toLocaleString('en-US')} more connections dropped` : 'only used once max-connections is full'}
          />
          <Gauge
            label="max-connections (poller)"
            value={m.accepted}
            max={MAX_CONN}
            tone={m.accepted >= MAX_CONN ? 'bad' : 'info'}
            note="open connections watched with epoll; cheap"
          />
          <Gauge
            label={virtual ? 'requests running on virtual threads' : 'threads.max (platform worker threads)'}
            value={m.running}
            max={virtual ? MAX_CONN : THREADS_MAX}
            tone={fullThreads ? 'bad' : 'ok'}
            note={
              virtual
                ? `${m.running.toLocaleString('en-US')} virtual threads on ${CARRIERS} carrier OS threads`
                : `${m.waiting.toLocaleString('en-US')} requests waiting for a free thread`
            }
          />
        </div>
        <dl className="tc-stats">
          <div>
            <dt>Latency</dt>
            <dd className={m.latency > SERVICE + 0.01 ? 'is-bad' : 'is-ok'}>{m.latency.toFixed(1)} s</dd>
          </div>
          <div>
            <dt>Throughput</dt>
            <dd>{Math.round(m.throughput).toLocaleString('en-US')} req/s</dd>
          </div>
          <div>
            <dt>OS threads</dt>
            <dd>{m.osThreads}</dd>
          </div>
          <div>
            <dt>Errors</dt>
            <dd className={m.refused ? 'is-bad' : 'is-ok'}>{m.refused.toLocaleString('en-US')}</dd>
          </div>
        </dl>
        <p className="tc-foot">
          Assumes an I/O-bound endpoint that sleeps {SERVICE}s. For CPU-bound work, virtual threads don't help: the{' '}
          {CARRIERS} cores are the limit either way.
        </p>
      </div>
    </DiagramFrame>
  );
}
