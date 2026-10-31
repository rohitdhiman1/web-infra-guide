import { useMemo, useState } from 'react';
import DiagramFrame from './DiagramFrame';
import { ToggleGroup, useMeasuredWidth } from './shared';

type Pattern = 'edge' | 'steady' | 'spike';
type Algo = 'fixed' | 'sliding' | 'token' | 'leaky';

const LIMIT = 5; // requests per second, for every algorithm
const SPAN = 3000; // ms shown

const PATTERNS: Record<Pattern, { label: string; times: number[]; note: string }> = {
  edge: {
    label: 'Burst at a window edge',
    times: [...Array.from({ length: 5 }, (_, i) => 900 + i * 20), ...Array.from({ length: 5 }, (_, i) => 1000 + i * 20), 2500, 2700],
    note: '5 requests just before the 1-second mark, 5 just after.',
  },
  steady: {
    label: 'Steady 8 per second',
    times: Array.from({ length: 24 }, (_, i) => Math.round(i * 125)),
    note: 'One request every 125 ms: 8 per second against a limit of 5.',
  },
  spike: {
    label: 'One big spike',
    times: [...Array.from({ length: 15 }, (_, i) => 400 + i * 10), 1800, 2200, 2600],
    note: '15 requests within 150 ms, then a trickle.',
  },
};

const ALGOS: { id: Algo; label: string; how: string }[] = [
  { id: 'fixed', label: 'Fixed window', how: 'Count requests per calendar second; reset the count at each boundary.' },
  { id: 'sliding', label: 'Sliding window', how: 'Allow a request if fewer than 5 were allowed in the last 1000 ms.' },
  { id: 'token', label: 'Token bucket', how: 'A bucket of 5 tokens refilled at 5/s; each request takes one. Allows bursts up to 5.' },
  { id: 'leaky', label: 'Leaky bucket (queue)', how: 'Requests queue (up to 5) and are released evenly every 200 ms; a full queue rejects. This is nginx limit_req without nodelay.' },
];

interface Result {
  t: number;
  ok: boolean;
  servedAt: number;
}

function run(algo: Algo, times: number[]): Result[] {
  const out: Result[] = [];
  if (algo === 'fixed') {
    const counts = new Map<number, number>();
    for (const t of times) {
      const w = Math.floor(t / 1000);
      const c = counts.get(w) ?? 0;
      const ok = c < LIMIT;
      if (ok) counts.set(w, c + 1);
      out.push({ t, ok, servedAt: t });
    }
  } else if (algo === 'sliding') {
    const accepted: number[] = [];
    for (const t of times) {
      const ok = accepted.filter((a) => a > t - 1000).length < LIMIT;
      if (ok) accepted.push(t);
      out.push({ t, ok, servedAt: t });
    }
  } else if (algo === 'token') {
    let tokens = LIMIT;
    let last = 0;
    for (const t of times) {
      tokens = Math.min(LIMIT, tokens + ((t - last) / 1000) * LIMIT);
      last = t;
      const ok = tokens >= 1;
      if (ok) tokens -= 1;
      out.push({ t, ok, servedAt: t });
    }
  } else {
    const interval = 1000 / LIMIT;
    let lastServed = -Infinity;
    const queue: number[] = []; // served times of requests still waiting
    for (const t of times) {
      while (queue.length && queue[0] <= t) queue.shift();
      const ok = queue.length < LIMIT;
      const servedAt = ok ? Math.max(t, lastServed + interval) : t;
      if (ok) {
        lastServed = servedAt;
        if (servedAt > t) queue.push(servedAt);
      }
      out.push({ t, ok, servedAt });
    }
  }
  return out;
}

/** Most requests let through in any 1-second span. */
function peak(results: Result[]) {
  const served = results.filter((r) => r.ok).map((r) => r.servedAt).sort((a, b) => a - b);
  let best = 0;
  for (let i = 0; i < served.length; i++) {
    let j = i;
    while (j < served.length && served[j] < served[i] + 1000) j++;
    best = Math.max(best, j - i);
  }
  return best;
}

export default function RateLimiterCompare() {
  const [p, setP] = useState<Pattern>('edge');
  const pattern = PATTERNS[p];
  const results = useMemo(() => ALGOS.map((a) => ({ ...a, res: run(a.id, pattern.times) })), [pattern]);

  const [wrapRef, measured] = useMeasuredWidth<HTMLDivElement>(600);
  const W = Math.min(720, measured);
  const rowH = 46;
  const padL = 8;
  const top = 18;
  const x = (t: number) => padL + (t / SPAN) * (W - padL * 2);
  const H = top + results.length * rowH + 4;

  const fixed = results[0];
  const fixedPeak = peak(fixed.res);

  return (
    <DiagramFrame
      title="Rate limiters compared"
      subtitle={`limit ${LIMIT} per second, same traffic for all four`}
      status={
        <>
          {pattern.note}{' '}
          {results.map((r) => (
            <span key={r.id} className="rlc-stat">
              <strong>{r.label}:</strong> {r.res.filter((x) => x.ok).length} allowed, {r.res.filter((x) => !x.ok).length} rejected,
              peak {peak(r.res)} in one second{r.id === 'leaky' && r.res.some((x) => x.ok && x.servedAt > x.t) ? ', some delayed' : ''}.{' '}
            </span>
          ))}
          {p === 'edge' && fixedPeak > LIMIT && (
            <>
              <br />
              The fixed window let <strong>{fixedPeak} requests through in 200 ms</strong>, twice the limit, because the count
              reset at 1.0 s. That's the weakness the other three fix.
            </>
          )}
        </>
      }
      controls={
        <ToggleGroup
          label="Traffic"
          value={p}
          onChange={setP}
          options={(Object.keys(PATTERNS) as Pattern[]).map((k) => ({ value: k, label: PATTERNS[k].label }))}
        />
      }
    >
      <div ref={wrapRef}>
      <svg className="dg-svg rlc" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Timeline of each request and whether each algorithm allowed it">
        {[0, 1000, 2000, 3000].map((t) => (
          <g key={t}>
            <line className="rlc-sec" x1={x(t)} x2={x(t)} y1={top - 4} y2={H - 4} />
            <text className="rlc-axis" x={Math.min(x(t) + 3, W - 18)} y={12}>
              {t / 1000}s
            </text>
          </g>
        ))}
        {results.map((r, i) => {
          const y = top + i * rowH;
          return (
            <g key={r.id}>
              <text className="rlc-label" x={padL} y={y + 13}>
                {r.label}
              </text>
              {r.res.map((q, k) => (
                <g key={k}>
                  {q.ok && q.servedAt > q.t && (
                    <line className="rlc-delay" x1={x(q.t)} x2={x(q.servedAt)} y1={y + 28} y2={y + 28} />
                  )}
                  <circle className={q.ok ? 'rlc-ok' : 'rlc-no'} cx={x(q.ok ? q.servedAt : q.t)} cy={y + 28} r={4.2} />
                </g>
              ))}
            </g>
          );
        })}
      </svg>
      </div>
      <div className="rs-legend" aria-hidden="true">
        <span className="rs-key ok">allowed</span>
        <span className="rs-key fail">rejected (429)</span>
        <span className="rlc-key-delay">delayed in the queue</span>
      </div>
      <dl className="as-facts rlc-how">
        {ALGOS.map((a) => (
          <div key={a.id}>
            <dt>{a.label}</dt>
            <dd>{a.how}</dd>
          </div>
        ))}
      </dl>
    </DiagramFrame>
  );
}
