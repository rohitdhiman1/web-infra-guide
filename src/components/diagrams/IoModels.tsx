import { useState } from 'react';
import DiagramFrame from './DiagramFrame';
import { ToggleGroup } from './shared';

type Mode = 'blocking' | 'polling' | 'select' | 'epoll';
type Scale = '3' | '1000' | '10000';

const TICKS = 12;
// When data arrives on each of three connections (A is a slow client).
const ARRIVE: Record<string, number> = { A: 8, B: 2, C: 5 };
const CONNS = ['A', 'B', 'C'];

type ThreadState = 'blocked' | 'spin' | 'sleep' | 'work';

function run(mode: Mode) {
  const thread: ThreadState[] = [];
  const served: Record<string, number> = {};
  let syscalls = 0;
  if (mode === 'blocking') {
    // read(A) blocks until A's data arrives; only then can it read B and C.
    let t = 0;
    for (const c of CONNS) {
      while (t < ARRIVE[c]) {
        thread[t] = 'blocked';
        t++;
      }
      thread[t] = 'work';
      served[c] = t;
      syscalls++;
      t++;
    }
    while (t < TICKS) thread[t++] = 'sleep';
  } else {
    for (let t = 0; t < TICKS; t++) {
      const ready = CONNS.filter((c) => ARRIVE[c] === t);
      if (ready.length) {
        thread[t] = 'work';
        for (const c of ready) served[c] = t;
      } else thread[t] = mode === 'polling' ? 'spin' : 'sleep';
      if (mode === 'polling') syscalls += CONNS.length; // read() every connection, every tick
      else if (ready.length) syscalls += 1; // one select / epoll_wait call per wake-up
    }
  }
  const busy = thread.filter((s) => s === 'spin' || s === 'work').length;
  return { thread, served, syscalls, busy };
}

const TEXT: Record<Mode, string> = {
  blocking:
    'Blocking read() on A: the thread is stuck until A sends something, even though B was ready at tick 2. B and C wait behind the slowest client. That’s why blocking servers need a thread per connection.',
  polling:
    'Non-blocking sockets, checked in a loop: read() returns EAGAIN (“nothing yet”) instantly, so each client is served as soon as its data arrives, but the thread spins at 100% CPU asking “anything yet?” over and over.',
  select:
    'select()/poll(): the thread sleeps until at least one socket is ready, so it serves each client promptly and uses no CPU while idle. But every wake-up hands the whole list of sockets to the kernel and scans it to find the ready ones.',
  epoll:
    'epoll: the thread registers its sockets once, then epoll_wait() sleeps until something is ready and returns only the ready sockets. Same prompt service as select, but the cost per wake-up depends on how many are ready, not how many are open.',
};

export default function IoModels() {
  const [mode, setMode] = useState<Mode>('blocking');
  const [scale, setScale] = useState<Scale>('10000');
  const r = run(mode);
  const n = Number(scale);
  const perWake = mode === 'select' ? n : mode === 'epoll' ? 1 : null;

  return (
    <DiagramFrame
      title="One thread, three connections"
      subtitle="blocking, polling, select and epoll"
      status={
        <>
          {TEXT[mode]}{' '}
          <span className="cs-stats">
            B served at tick {r.served.B} · CPU busy {Math.round((r.busy / TICKS) * 100)}% · {r.syscalls} system calls
          </span>
        </>
      }
      controls={
        <ToggleGroup
          label="I/O model"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'blocking', label: 'Blocking read()' },
            { value: 'polling', label: 'Non-blocking, polling' },
            { value: 'select', label: 'select() / poll()' },
            { value: 'epoll', label: 'epoll' },
          ]}
        />
      }
    >
      <div className="iom" role="img" aria-label={`Timeline over ${TICKS} ticks: B is served at tick ${r.served.B}, CPU busy ${Math.round((r.busy / TICKS) * 100)} percent`}>
        <div className="iom-row iom-head" aria-hidden="true">
          <span className="iom-name" />
          {Array.from({ length: TICKS }, (_, t) => (
            <span key={t} className="iom-tick">
              {t}
            </span>
          ))}
        </div>
        {CONNS.map((c) => (
          <div key={c} className="iom-row">
            <span className="iom-name">
              {c}
              {c === 'A' && <small> slow</small>}
            </span>
            {Array.from({ length: TICKS }, (_, t) => {
              const arrived = t >= ARRIVE[c];
              const servedAt = r.served[c];
              const cls = t === servedAt ? 'is-served' : arrived && (servedAt === undefined || t < servedAt) ? 'is-waiting' : t === ARRIVE[c] ? 'is-arrive' : '';
              return (
                <span key={t} className={`iom-cell ${cls}`}>
                  {t === servedAt ? '✓' : t === ARRIVE[c] ? '◆' : ''}
                </span>
              );
            })}
          </div>
        ))}
        <div className="iom-row">
          <span className="iom-name">thread</span>
          {r.thread.map((s, t) => (
            <span key={t} className={`iom-cell th-${s}`} title={s} />
          ))}
        </div>
      </div>
      <div className="rs-legend" aria-hidden="true">
        <span className="iom-key arrive">◆ data arrives</span>
        <span className="iom-key wait">waiting to be read</span>
        <span className="iom-key served">✓ served</span>
        <span className="iom-key th-blocked">thread blocked</span>
        <span className="iom-key th-spin">thread spinning</span>
        <span className="iom-key th-sleep">thread asleep</span>
        <span className="iom-key th-work">thread working</span>
      </div>
      {perWake !== null && (
        <div className="iom-scale">
          <ToggleGroup
            label="Open connections"
            value={scale}
            onChange={setScale}
            options={[
              { value: '3', label: '3' },
              { value: '1000', label: '1,000' },
              { value: '10000', label: '10,000' },
            ]}
          />
          <p>
            With <strong>{n.toLocaleString('en-US')}</strong> open connections and one ready, each wake-up costs{' '}
            <strong>{perWake.toLocaleString('en-US')}</strong> socket check{perWake === 1 ? '' : 's'}
            {mode === 'select' ? ' (and select() caps out at 1,024 file descriptors anyway)' : ': this is why nginx, Netty and Node handle 10,000 idle connections easily (C10k, Part 4)'}.
          </p>
        </div>
      )}
    </DiagramFrame>
  );
}
