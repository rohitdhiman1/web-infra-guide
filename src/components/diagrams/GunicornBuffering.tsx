import { useState } from 'react';
import DiagramFrame from './DiagramFrame';
import { Switch, useInterval } from './shared';

type Kind = 'fast' | 'slow';
const SEND: Record<Kind, number> = { fast: 1, slow: 8 }; // ticks to deliver the response to the client
const APP = 1; // ticks of Django work per request
const WORKERS = 2;

interface Client {
  id: number;
  kind: Kind;
  worker: number | null;
  /** Tick the worker finished (handed off to nginx, or finished writing). */
  freedAt: number | null;
  doneAt: number | null;
}
interface Worker {
  client: number | null;
  started: number;
  rem: number;
}
interface Sim {
  tick: number;
  clients: Client[];
  workers: Worker[];
}

const PRESET: Kind[] = ['slow', 'slow', 'fast', 'fast', 'fast', 'fast'];

const initial = (): Sim => ({
  tick: 0,
  clients: PRESET.map((kind, i) => ({ id: i + 1, kind, worker: null, freedAt: null, doneAt: null })),
  workers: Array.from({ length: WORKERS }, () => ({ client: null, started: 0, rem: 0 })),
});

function step(s: Sim, nginx: boolean): Sim {
  const t = s.tick + 1;
  const clients = s.clients.map((c) => ({ ...c }));
  const workers = s.workers.map((w) => ({ ...w }));
  for (let i = 0; i < workers.length; i++) {
    const w = workers[i];
    if (w.client === null) {
      const next = clients.find((c) => c.worker === null && c.freedAt === null);
      if (next) {
        next.worker = i;
        // Without nginx, the sync worker also writes the response to the client itself.
        w.client = next.id;
        w.started = s.tick;
        w.rem = nginx ? APP : APP + SEND[next.kind];
      }
    }
    if (w.client !== null) {
      w.rem -= 1;
      if (w.rem <= 0) {
        const c = clients.find((x) => x.id === w.client)!;
        c.freedAt = t;
        // With nginx, the response sits in nginx's buffer and nginx feeds the client.
        c.doneAt = nginx ? t + SEND[c.kind] : t;
        w.client = null;
      }
    }
  }
  return { tick: t, clients, workers };
}

export default function GunicornBuffering() {
  const [nginx, setNginx] = useState(false);
  const [sim, setSim] = useState<Sim>(initial);
  const [playing, setPlaying] = useState(false);
  const allDone = sim.clients.every((c) => c.doneAt !== null && c.doneAt <= sim.tick);
  useInterval(() => setSim((s) => step(s, nginx)), 500, playing && !allDone);

  const reset = (n = nginx) => {
    setNginx(n);
    setSim(initial());
    setPlaying(false);
  };
  const add = (kind: Kind) =>
    setSim((s) => ({
      ...s,
      clients: [...s.clients, { id: s.clients.length + 1, kind, worker: null, freedAt: null, doneAt: null }].slice(0, 12),
    }));

  const fast = sim.clients.filter((c) => c.kind === 'fast' && c.doneAt !== null && c.doneAt <= sim.tick);
  const avgFast = fast.length ? (fast.reduce((a, c) => a + c.doneAt!, 0) / fast.length).toFixed(1) : '–';
  const workerBusy = (w: Worker) => {
    if (w.client === null) return { label: 'idle, ready for the next request', cls: '' };
    const elapsed = sim.tick - w.started;
    const c = sim.clients.find((x) => x.id === w.client)!;
    if (elapsed < APP) return { label: `C${c.id}: running Django code`, cls: 'is-app' };
    return { label: `C${c.id}: writing to a ${c.kind} client…`, cls: c.kind === 'slow' ? 'is-stuck' : 'is-app' };
  };

  return (
    <DiagramFrame
      title="App server simulator"
      subtitle={`${WORKERS} Gunicorn workers, ${nginx ? 'with' : 'without'} nginx`}
      status={
        <>
          {nginx ? (
            <>
              <strong>With nginx.</strong> Each worker runs Django for one tick, hands the whole response to nginx over
              the fast local socket, and moves on. nginx's event loop feeds the slow clients.
            </>
          ) : (
            <>
              <strong>Without nginx.</strong> A sync worker must write the response to the client itself, so a slow
              client holds a whole worker hostage while the fast clients wait in line.
            </>
          )}{' '}
          <span className="cs-stats">
            Tick {sim.tick} · fast clients finished at tick {avgFast} on average{allDone && ' · all done'}
          </span>
        </>
      }
      controls={
        <>
          <div className="dg-toggle">
            <span className="dg-label">Setup</span>
            <Switch checked={nginx} onChange={(v) => reset(v)}>
              nginx in front
            </Switch>
          </div>
          <div className="dg-toggle">
            <span className="dg-label">Clients</span>
            <div className="dg-btn-group">
              <button type="button" className="dg-btn" onClick={() => add('fast')}>
                + Fast
              </button>
              <button type="button" className="dg-btn" onClick={() => add('slow')}>
                + Slow
              </button>
            </div>
          </div>
          <div className="dg-toggle">
            <span className="dg-label">Run</span>
            <div className="dg-btn-group">
              <button
                type="button"
                className="dg-btn is-primary"
                aria-disabled={allDone}
                onClick={() => !allDone && setPlaying((p) => !p)}
              >
                {playing && !allDone ? '❚❚ Pause' : '▶ Play'}
              </button>
              <button type="button" className="dg-btn" aria-disabled={allDone} onClick={() => !allDone && setSim((s) => step(s, nginx))}>
                Step
              </button>
              <button type="button" className="dg-btn" onClick={() => reset()}>
                Reset
              </button>
            </div>
          </div>
        </>
      }
    >
      <div className="gb">
        <div className="gb-stack">
          <div className={`gb-layer gb-nginx${nginx ? '' : ' is-off'}`}>
            <strong>nginx</strong>
            <span>
              {nginx
                ? `buffering ${sim.clients.filter((c) => c.freedAt !== null && c.freedAt <= sim.tick && c.doneAt! > sim.tick).length} response(s) to clients`
                : 'not in front: clients talk to Gunicorn directly'}
            </span>
          </div>
          <div className="gb-layer gb-workers">
            <strong>Gunicorn (sync)</strong>
            {sim.workers.map((w, i) => {
              const b = workerBusy(w);
              return (
                <div key={i} className={`gb-worker ${b.cls}`}>
                  <span className="gb-worker-name">worker {i + 1}</span>
                  <span>{b.label}</span>
                </div>
              );
            })}
          </div>
        </div>
        <ul className="gb-clients" aria-label="Clients">
          {sim.clients.map((c) => {
            const done = c.doneAt !== null && c.doneAt <= sim.tick;
            let label: string;
            let tone: string;
            if (done) {
              label = `done at tick ${c.doneAt}`;
              tone = 'ok';
            } else if (c.freedAt !== null && c.freedAt <= sim.tick) {
              label = 'nginx is sending it';
              tone = 'info';
            } else if (c.worker !== null) {
              label = `worker ${c.worker + 1}`;
              tone = c.kind === 'slow' ? 'bad' : 'info';
            } else {
              label = 'waiting for a worker';
              tone = 'warn';
            }
            return (
              <li key={c.id} className={`cs-client is-${c.kind}`}>
                <span className="cs-client-name">
                  C{c.id} <span className="cs-kind">{c.kind}</span>
                </span>
                <span className={`dg-pill ${tone}`}>{label}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </DiagramFrame>
  );
}
