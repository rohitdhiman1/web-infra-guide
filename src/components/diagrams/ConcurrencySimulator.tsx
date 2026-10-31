import { useState } from 'react';
import DiagramFrame from './DiagramFrame';
import { ToggleGroup, useInterval } from './shared';

type Model = 'blocking' | 'threads' | 'event';
type Kind = 'fast' | 'slow';

interface Client {
  id: number;
  kind: Kind;
  arrived: number;
  /** Tick at which the whole request has arrived in the kernel's buffer. */
  readyAt: number;
  /** Which worker (thread index) is handling it, if any. */
  worker: number | null;
  /** Tick at which the response was sent. */
  doneAt: number | null;
}

interface Sim {
  tick: number;
  nextId: number;
  clients: Client[];
  /** For each worker: the client id it's attached to. */
  workers: (number | null)[];
  /** Event loop only: the client whose handler ran this tick. */
  ran: number | null;
}

const SLOW_TICKS = 12; // a slow client trickles its request in over 12 ticks
const POOL = 4; // thread pool size
const MAX_CLIENTS = 14;

const workersFor = (m: Model) => (m === 'threads' ? POOL : 1);

function initial(model: Model): Sim {
  const sim: Sim = { tick: 0, nextId: 1, clients: [], workers: Array(workersFor(model)).fill(null), ran: null };
  // A slow client first, then three fast ones: the classic stall.
  return (['slow', 'fast', 'fast', 'fast'] as Kind[]).reduce((s, k) => addClient(s, k), sim);
}

function addClient(s: Sim, kind: Kind): Sim {
  if (s.clients.length >= MAX_CLIENTS) return s;
  const c: Client = {
    id: s.nextId,
    kind,
    arrived: s.tick,
    readyAt: s.tick + (kind === 'slow' ? SLOW_TICKS : 1),
    worker: null,
    doneAt: null,
  };
  return { ...s, nextId: s.nextId + 1, clients: [...s.clients, c] };
}

/** Advance one tick. Each model decides who the server's thread(s) spend this tick on. */
function step(s: Sim, model: Model): Sim {
  const t = s.tick + 1;
  const clients = s.clients.map((c) => ({ ...c }));
  const workers = [...s.workers];
  let ran: number | null = null;

  if (model === 'event') {
    // One thread. epoll reports which sockets have a full request; handle one per tick, oldest first.
    const ready = clients.find((c) => c.doneAt === null && c.readyAt <= s.tick);
    if (ready) {
      ready.doneAt = t;
      ran = ready.id;
    }
  } else {
    // Blocking / thread pool: each worker is stuck with its client until that client is done.
    for (let w = 0; w < workers.length; w++) {
      if (workers[w] === null) {
        const next = clients.find((c) => c.doneAt === null && c.worker === null);
        if (next) {
          next.worker = w;
          workers[w] = next.id;
        }
      }
      const cid = workers[w];
      if (cid === null) continue;
      const c = clients.find((x) => x.id === cid)!;
      // The worker sits in recv() until the full request is in, then spends one tick handling it.
      if (c.readyAt <= s.tick) {
        c.doneAt = t;
        workers[w] = null;
      }
    }
  }
  return { ...s, tick: t, clients, workers, ran };
}

function clientState(c: Client, s: Sim, model: Model) {
  if (c.doneAt !== null) return { label: `done in ${c.doneAt - c.arrived} ticks`, tone: 'ok' as const };
  const sending = c.readyAt > s.tick;
  if (model === 'event') {
    return sending
      ? { label: 'sending… (loop ignores it)', tone: 'muted' as const }
      : { label: 'ready, next in loop', tone: 'info' as const };
  }
  if (c.worker === null) return { label: 'waiting in backlog', tone: 'warn' as const };
  return sending
    ? { label: `worker ${c.worker + 1} blocked in recv()`, tone: 'bad' as const }
    : { label: `worker ${c.worker + 1} handling`, tone: 'info' as const };
}

const MODEL_INFO: Record<Model, { title: string; text: string }> = {
  blocking: {
    title: 'Iterative, blocking',
    text: 'One thread, one client at a time. While it waits in recv() for a slow client, everyone else waits in the backlog (4.5).',
  },
  threads: {
    title: `Thread pool (${POOL} threads)`,
    text: `Each client gets a thread until it's done. Slow clients each pin a thread; once all ${POOL} are pinned, new clients queue again, and every thread costs memory (4.6, 4.7).`,
  },
  event: {
    title: 'Event loop',
    text: "One thread asks epoll which sockets are ready and only touches those. A slow client costs a little memory for its buffer, not a thread. This is nginx's model (4.8).",
  },
};

export default function ConcurrencySimulator() {
  const [model, setModel] = useState<Model>('blocking');
  const [sim, setSim] = useState<Sim>(() => initial('blocking'));
  const [playing, setPlaying] = useState(false);

  const allDone = sim.clients.length > 0 && sim.clients.every((c) => c.doneAt !== null);
  useInterval(
    () => {
      setSim((s) => step(s, model));
    },
    450,
    playing && !allDone,
  );

  const changeModel = (m: Model) => {
    setModel(m);
    setSim(initial(m));
    setPlaying(false);
  };

  const done = sim.clients.filter((c) => c.doneAt !== null);
  const fastDone = done.filter((c) => c.kind === 'fast');
  const avgFast = fastDone.length
    ? (fastDone.reduce((a, c) => a + (c.doneAt! - c.arrived), 0) / fastDone.length).toFixed(1)
    : '–';
  const busy = sim.workers.filter((w) => w !== null).length;
  const info = MODEL_INFO[model];

  return (
    <DiagramFrame
      title="Concurrency simulator"
      subtitle="blocking, threads, event loop"
      status={
        <>
          <strong>{info.title}.</strong> {info.text}{' '}
          <span className="cs-stats">
            Tick {sim.tick} · {done.length}/{sim.clients.length} served · fast clients took {avgFast} ticks on average
            {allDone && ' · all served'}
          </span>
        </>
      }
      controls={
        <>
          <ToggleGroup
            label="Server model"
            value={model}
            onChange={changeModel}
            options={[
              { value: 'blocking', label: 'Blocking' },
              { value: 'threads', label: 'Threads' },
              { value: 'event', label: 'Event loop' },
            ]}
          />
          <div className="dg-toggle">
            <span className="dg-label">Clients</span>
            <div className="dg-btn-group">
              <button
                type="button"
                className="dg-btn"
                onClick={() => setSim((s) => addClient(s, 'fast'))}
                aria-disabled={sim.clients.length >= MAX_CLIENTS}
              >
                + Fast client
              </button>
              <button
                type="button"
                className="dg-btn"
                onClick={() => setSim((s) => addClient(s, 'slow'))}
                aria-disabled={sim.clients.length >= MAX_CLIENTS}
              >
                + Slow client
              </button>
            </div>
          </div>
          <div className="dg-toggle">
            <span className="dg-label">Run</span>
            <div className="dg-btn-group">
              <button type="button" className="dg-btn is-primary" onClick={() => !allDone && setPlaying((p) => !p)} aria-disabled={allDone}>
                {playing && !allDone ? '❚❚ Pause' : '▶ Play'}
              </button>
              <button type="button" className="dg-btn" onClick={() => !allDone && setSim((s) => step(s, model))} aria-disabled={allDone}>
                Step
              </button>
              <button
                type="button"
                className="dg-btn"
                onClick={() => {
                  setSim(initial(model));
                  setPlaying(false);
                }}
              >
                Reset
              </button>
            </div>
          </div>
        </>
      }
    >
      <div className="cs">
        <div className="cs-server">
          <div className="cs-server-head">
            <strong>Server</strong>
            <span className="dg-pill muted">
              {model === 'event' ? '1 thread · epoll' : `${busy}/${sim.workers.length} thread${sim.workers.length > 1 ? 's' : ''} busy`}
            </span>
          </div>
          <div className="cs-workers">
            {model === 'event' ? (
              <div className={`cs-worker${sim.ran ? ' is-busy' : ''}`}>
                <span className="cs-worker-name">event loop</span>
                <span>{sim.ran ? `handled C${sim.ran}` : 'idle in epoll_wait()'}</span>
              </div>
            ) : (
              sim.workers.map((cid, w) => {
                const c = sim.clients.find((x) => x.id === cid);
                const blocked = c && c.readyAt > sim.tick;
                return (
                  <div key={w} className={`cs-worker${c ? (blocked ? ' is-blocked' : ' is-busy') : ''}`}>
                    <span className="cs-worker-name">worker {w + 1}</span>
                    <span>{c ? (blocked ? `blocked on C${c.id}` : `handling C${c.id}`) : 'idle'}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
        <ul className="cs-clients" aria-label="Clients">
          {sim.clients.map((c) => {
            const st = clientState(c, sim, model);
            const total = c.readyAt - c.arrived;
            const sent = Math.min(total, Math.max(0, sim.tick - c.arrived));
            return (
              <li key={c.id} className={`cs-client is-${c.kind}`}>
                <span className="cs-client-name">
                  C{c.id} <span className="cs-kind">{c.kind}</span>
                </span>
                <span className="cs-bar" aria-hidden="true">
                  <span style={{ width: `${(sent / total) * 100}%` }} />
                </span>
                <span className={`dg-pill ${st.tone}`}>{st.label}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </DiagramFrame>
  );
}
