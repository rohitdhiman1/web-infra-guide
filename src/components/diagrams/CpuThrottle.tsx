import { useState } from 'react';
import DiagramFrame from './DiagramFrame';
import { ToggleGroup, useMeasuredWidth } from './shared';

const PERIOD = 100; // ms: the CFS period
const WORK = 200; // ms of CPU time one request needs
const LIMITS = ['none', '0.5', '1', '2'] as const;
const THREADS = ['1', '2', '4'] as const;
type Limit = (typeof LIMITS)[number];
type Threads = (typeof THREADS)[number];

interface Seg {
  start: number;
  end: number;
  kind: 'run' | 'throttled';
}

/**
 * The CFS quota model: in every 100 ms period the container may use `quota` ms of CPU time,
 * summed over all its threads. With T threads busy in parallel it burns quota T times as fast,
 * so it can exhaust the quota early and then sit throttled until the next period.
 */
function simulate(limit: Limit, threads: number) {
  const segs: Seg[] = [];
  let left = WORK;
  let t = 0;
  if (limit === 'none') {
    segs.push({ start: 0, end: WORK / threads, kind: 'run' });
    return { segs, total: WORK / threads, throttledPeriods: 0 };
  }
  const quota = Number(limit) * PERIOD;
  let throttledPeriods = 0;
  while (left > 1e-9) {
    const canUse = Math.min(quota, left); // CPU-ms this period
    const wall = Math.min(canUse / threads, PERIOD); // how long it takes with T threads
    segs.push({ start: t, end: t + wall, kind: 'run' });
    left -= Math.min(canUse, wall * threads);
    if (left > 1e-9 && wall < PERIOD) {
      segs.push({ start: t + wall, end: t + PERIOD, kind: 'throttled' });
      throttledPeriods++;
    }
    t += left > 1e-9 ? PERIOD : wall;
  }
  return { segs, total: t, throttledPeriods };
}

export default function CpuThrottle() {
  const [limit, setLimit] = useState<Limit>('1');
  const [threads, setThreads] = useState<Threads>('4');
  const [wrapRef, measured] = useMeasuredWidth<HTMLDivElement>(600);
  const T = Number(threads);
  const r = simulate(limit, T);
  const base = WORK / T;
  const span = Math.max(500, Math.ceil(r.total / 100) * 100);
  const W = Math.min(760, measured);
  const H = 92;
  const padL = 8;
  const x = (ms: number) => padL + (ms / span) * (W - padL * 2);

  return (
    <DiagramFrame
      title="CPU throttling"
      subtitle={`one request needs ${WORK} ms of CPU; the period is ${PERIOD} ms`}
      status={
        limit === 'none' ? (
          <>
            <strong>No limit:</strong> {T} thread{T > 1 ? 's' : ''} finish {WORK} ms of CPU work in{' '}
            <strong>{base} ms</strong>. Nothing stops the container from using every core it can get.
          </>
        ) : (
          <>
            <code>--cpus={limit}</code> means <strong>{Number(limit) * PERIOD} ms of CPU per {PERIOD} ms period</strong>,
            summed across all threads. {T > 1 && r.throttledPeriods > 0 ? <>With {T} threads running in parallel, that quota is used up in {Number(limit) * PERIOD / T} ms, then the container is frozen for the rest of the period. </> : null}
            The request takes <strong>{Math.round(r.total)} ms</strong> instead of {base} ms
            {r.throttledPeriods ? <>, throttled in {r.throttledPeriods} period{r.throttledPeriods > 1 ? 's' : ''}</> : null}. Average CPU use
            still looks modest, because the throttled time doesn't show up as usage.
          </>
        )
      }
      controls={
        <>
          <ToggleGroup label="CPU limit (docker run --cpus)" value={limit} onChange={setLimit} options={LIMITS.map((l) => ({ value: l, label: l === 'none' ? 'No limit' : `--cpus=${l}` }))} />
          <ToggleGroup label="Threads working on the request" value={threads} onChange={setThreads} options={THREADS.map((t) => ({ value: t, label: `${t} thread${t === '1' ? '' : 's'}` }))} />
        </>
      }
    >
      <div ref={wrapRef}>
        <svg className="dg-svg cpu" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Timeline: the request takes ${Math.round(r.total)} milliseconds`}>
          {Array.from({ length: span / PERIOD + 1 }, (_, i) => i * PERIOD).map((ms) => (
            <g key={ms}>
              <line className="cpu-period" x1={x(ms)} x2={x(ms)} y1={14} y2={70} />
              <text className="cpu-axis" x={Math.min(x(ms) + 2, W - 30)} y={84}>
                {ms} ms
              </text>
            </g>
          ))}
          {r.segs.map((s, i) => (
            <rect key={i} className={`cpu-${s.kind}`} x={x(s.start)} y={24} width={Math.max(1, x(s.end) - x(s.start))} height={36} rx={3} />
          ))}
          <line className="cpu-done" x1={x(r.total)} x2={x(r.total)} y1={10} y2={70} />
          <text className="cpu-label" x={Math.min(x(r.total) + 4, W - 70)} y={11}>
            done: {Math.round(r.total)} ms
          </text>
        </svg>
      </div>
      <div className="rs-legend" aria-hidden="true">
        <span className="cpu-key run">running</span>
        <span className="cpu-key throttled">throttled (quota used up)</span>
      </div>
    </DiagramFrame>
  );
}
