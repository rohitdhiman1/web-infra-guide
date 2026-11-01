import { useState } from 'react';
import DiagramFrame from './DiagramFrame';
import { ToggleGroup } from './shared';

type Mode = 'h1one' | 'h1six' | 'h2';
const RESOURCES = [
  { id: 'A', name: 'index.html', size: 3 },
  { id: 'B', name: 'app.css', size: 1 },
  { id: 'C', name: 'app.js', size: 2 },
  { id: 'D', name: 'logo.svg', size: 1 },
  { id: 'E', name: 'font.woff2', size: 2 },
  { id: 'F', name: 'orders.json', size: 1 },
  { id: 'G', name: 'icon-1.png', size: 1 },
  { id: 'H', name: 'icon-2.png', size: 1 },
  { id: 'I', name: 'icon-3.png', size: 1 },
];
const HANDSHAKE = 2; // TCP + TLS 1.3, in ticks (one tick = one round trip)

type Cell = { kind: 'hs' } | { kind: 'frame'; id: string } | { kind: 'wait' } | { kind: 'idle' };

/**
 * A tiny model: the link carries one frame per tick, shared by every connection.
 * A response starts flowing one tick after its request is sent (one round trip).
 */
function simulate(mode: Mode) {
  const conns = mode === 'h1six' ? 6 : 1;
  const grid: Cell[][] = Array.from({ length: conns }, () => []);
  type Stream = { id: string; conn: number; readyAt: number; left: number };
  const queue = [...RESOURCES];
  const active: Stream[] = [];
  const free = Array(conns).fill(HANDSHAKE);
  const busy = Array(conns).fill(false);
  const done: Record<string, number> = {};
  let rr = 0;
  let t = 0;

  const assign = (now: number) => {
    if (mode === 'h2') {
      // Every request goes out at once, each on its own stream of the one connection.
      while (queue.length && now >= HANDSHAKE) {
        const r = queue.shift()!;
        active.push({ id: r.id, conn: 0, readyAt: HANDSHAKE + 1, left: r.size });
      }
      return;
    }
    for (let c = 0; c < conns; c++) {
      if (!busy[c] && queue.length && free[c] <= now) {
        const r = queue.shift()!;
        busy[c] = true;
        active.push({ id: r.id, conn: c, readyAt: now + 1, left: r.size });
      }
    }
  };

  while (Object.keys(done).length < RESOURCES.length && t < 80) {
    assign(t);
    const ready = active.filter((s) => s.left > 0 && s.readyAt <= t);
    let sent: Stream | null = null;
    if (ready.length) {
      sent = ready[rr % ready.length];
      rr++;
      sent.left--;
      if (sent.left === 0) {
        done[sent.id] = t + 1;
        if (mode !== 'h2') {
          busy[sent.conn] = false;
          free[sent.conn] = t + 1;
        }
      }
    }
    for (let c = 0; c < conns; c++) {
      if (t < HANDSHAKE) grid[c][t] = { kind: 'hs' };
      else if (sent && sent.conn === c) grid[c][t] = { kind: 'frame', id: sent.id };
      else if (active.some((s) => s.conn === c && s.left > 0)) grid[c][t] = { kind: 'wait' };
      else grid[c][t] = { kind: 'idle' };
    }
    t++;
  }
  return { grid, total: t, done };
}

const TEXT: Record<Mode, string> = {
  h1one:
    'HTTP/1.1 on one connection: one request at a time. Each response must finish before the next request can even be answered, so the page waits a round trip per resource, in series.',
  h1six:
    'Browsers work around that by opening up to 6 connections per host, which is about as fast here. But it costs six handshakes, six server sockets and six TCP slow starts, and resources 7 to 9 still have to queue until one of the connections is free.',
  h2: 'HTTP/2: one connection, one handshake. Every request goes out immediately as its own stream, and the responses’ frames interleave on the wire. It matches six HTTP/1.1 connections, with one connection instead of six, no queueing, and compressed headers (HPACK). On a real network, one warmed-up connection usually beats six cold ones.',
};

export default function FrameMux() {
  const [mode, setMode] = useState<Mode>('h2');
  const r = simulate(mode);
  const one = simulate('h1one').total;

  return (
    <DiagramFrame
      title="Loading a page: HTTP/1.1 vs HTTP/2"
      subtitle="9 resources; the link carries one frame per round trip"
      status={
        <>
          {TEXT[mode]} <span className="cs-stats">Page loaded after {r.total} round trips{mode !== 'h1one' ? ` (vs ${one} on one HTTP/1.1 connection)` : ''}.</span>
        </>
      }
      controls={
        <ToggleGroup
          label="Protocol"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'h1one', label: 'HTTP/1.1, 1 connection' },
            { value: 'h1six', label: 'HTTP/1.1, 6 connections' },
            { value: 'h2', label: 'HTTP/2, 1 connection' },
          ]}
        />
      }
    >
      <div className="fm" role="img" aria-label={`Timeline of ${r.grid.length} connection(s); the page finishes after ${r.total} round trips`}>
        {r.grid.map((row, c) => (
          <div key={c} className="fm-row">
            <span className="fm-name">conn {c + 1}</span>
            <div className="fm-cells" style={{ gridTemplateColumns: `repeat(${r.total}, minmax(0, 1fr))` }}>
              {row.map((cell, t) => (
                <span key={t} className={`fm-cell is-${cell.kind}${cell.kind === 'frame' ? ` res-${cell.id}` : ''}`}>
                  {cell.kind === 'frame' ? cell.id : cell.kind === 'hs' ? '🤝' : ''}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="ra-legend">
        Letters are frames of each resource ({RESOURCES.map((x) => `${x.id} ${x.name}`).join(', ')}). 🤝 handshake · dotted: waiting for a response.
      </p>
    </DiagramFrame>
  );
}
