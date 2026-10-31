import { useMemo, useState } from 'react';
import DiagramFrame from './DiagramFrame';
import { ToggleGroup, useInterval } from './shared';

type Strategy = 'immediate' | 'fixed' | 'exp' | 'jitter';

const TICKS = 60; // one tick = 100 ms
const ARRIVALS = 7; // new requests per tick
const CAPACITY = 10; // requests the server can answer per tick
const OUTAGE: [number, number] = [10, 20]; // the server answers nothing in [10, 20)
const MAX_ATTEMPTS = 5;

/** A small seeded random generator, so every run of a strategy looks the same. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function delay(s: Strategy, attempt: number, rnd: () => number) {
  const exp = 2 ** (attempt - 1); // 1, 2, 4, 8 ticks
  switch (s) {
    case 'immediate':
      return 1;
    case 'fixed':
      return 3;
    case 'exp':
      return exp;
    case 'jitter':
      return 1 + Math.floor(rnd() * exp * 2); // random in [1, 2 × exp]: full jitter, never 0
  }
}

interface Tick {
  fresh: number;
  retries: number;
  ok: number;
  failed: number;
}

function simulate(s: Strategy) {
  const rnd = mulberry32(7);
  const due: number[][] = Array.from({ length: TICKS + 40 }, () => []); // attempt numbers due per tick
  const ticks: Tick[] = [];
  let gaveUp = 0;
  for (let t = 0; t < TICKS; t++) {
    const attempts = [...Array(ARRIVALS).fill(1), ...due[t]];
    const cap = t >= OUTAGE[0] && t < OUTAGE[1] ? 0 : CAPACITY;
    // The server can't tell new requests from retries: it answers the first `cap` it gets.
    const order = attempts.map((a) => ({ a, r: rnd() })).sort((x, y) => x.r - y.r);
    let ok = 0;
    let failed = 0;
    order.forEach(({ a }, i) => {
      if (i < cap) ok++;
      else {
        failed++;
        if (a >= MAX_ATTEMPTS) gaveUp++;
        else due[t + delay(s, a, rnd)].push(a + 1);
      }
    });
    ticks.push({ fresh: ARRIVALS, retries: due[t].length, ok, failed });
  }
  const peak = Math.max(...ticks.map((k) => k.fresh + k.retries));
  // Recovered: the first tick after the outage from which every request succeeds.
  let recovered: number | null = null;
  for (let t = OUTAGE[1]; t < TICKS; t++) {
    if (ticks.slice(t).every((k) => k.failed === 0)) {
      recovered = t;
      break;
    }
  }
  return { ticks, peak, gaveUp, recovered };
}

const LABELS: Record<Strategy, string> = {
  immediate: 'Retry at once',
  fixed: 'Fixed 300 ms',
  exp: 'Exponential',
  jitter: 'Exponential + jitter',
};

const VERDICT: Record<Strategy, string> = {
  immediate:
    'Every failure comes straight back, so during the outage the load jumps to several times normal, and each request burns all its attempts within half a second. The traffic clears quickly afterwards only because so many users have already given up.',
  fixed:
    'A fixed wait lowers the load, but everything that failed together comes back together: the retries arrive in synchronised waves 3 ticks apart.',
  exp: 'Waiting longer after each failure takes pressure off, but without randomness the retries still arrive in synchronised waves, and the biggest wave hits right as the server comes back.',
  jitter:
    'Random waits spread the retries out into a steady trickle that the spare capacity can absorb. The backlog takes a little longer to drain, but far fewer users give up: jitter trades a short, gentle tail for far fewer failures.',
};

export default function RetryStorm() {
  const [s, setS] = useState<Strategy>('immediate');
  const [shown, setShown] = useState(TICKS);
  const [playing, setPlaying] = useState(false);
  const sim = useMemo(() => simulate(s), [s]);
  useInterval(
    () =>
      setShown((n) => {
        if (n + 1 >= TICKS) setPlaying(false);
        return Math.min(TICKS, n + 1);
      }),
    90,
    playing,
  );

  const W = 600;
  const H = 210;
  const padL = 30;
  const padB = 22;
  const maxY = 50;
  const bw = (W - padL) / TICKS;
  const y = (v: number) => H - padB - (Math.min(v, maxY) / maxY) * (H - padB - 8);
  const done = shown >= TICKS;

  return (
    <DiagramFrame
      title="Retry storm simulator"
      subtitle={`${ARRIVALS} new requests per tick, capacity ${CAPACITY}, outage for 1 second`}
      status={
        done ? (
          <>
            <strong>{LABELS[s]}:</strong> peak load {sim.peak} requests per tick ({(sim.peak / CAPACITY).toFixed(1)}×
            capacity), {sim.gaveUp} requests gave up after {MAX_ATTEMPTS} tries,{' '}
            {sim.recovered === null
              ? 'and requests were still failing at the end.'
              : `and the last failure was ${((sim.recovered - OUTAGE[1]) / 10).toFixed(1)} s after the outage ended.`}{' '}
            {VERDICT[s]}
          </>
        ) : (
          <>Playing… tick {shown} of {TICKS}.</>
        )
      }
      controls={
        <>
          <ToggleGroup
            label="Client retry strategy"
            value={s}
            onChange={(v) => {
              setS(v);
              setShown(TICKS);
              setPlaying(false);
            }}
            options={(Object.keys(LABELS) as Strategy[]).map((k) => ({ value: k, label: LABELS[k] }))}
          />
          <div className="dg-row">
            <button
              type="button"
              className="dg-btn is-primary"
              onClick={() => {
                if (playing) setPlaying(false);
                else {
                  setShown(0);
                  setPlaying(true);
                }
              }}
            >
              {playing ? '❚❚ Stop' : '▶ Replay'}
            </button>
          </div>
        </>
      }
    >
      <svg
        className="dg-svg rs"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Bar chart of requests per tick for "${LABELS[s]}": peak ${sim.peak}, capacity ${CAPACITY}.`}
      >
        <rect className="rs-outage" x={padL + OUTAGE[0] * bw} y={4} width={(OUTAGE[1] - OUTAGE[0]) * bw} height={H - padB - 4} />
        <text className="rs-note" x={padL + OUTAGE[0] * bw + 4} y={16}>
          outage
        </text>
        {[0, 10, 20, 30, 40, 50].map((v) => (
          <g key={v}>
            <line className="rs-grid" x1={padL} x2={W} y1={y(v)} y2={y(v)} />
            <text className="rs-axis" x={padL - 4} y={y(v) + 3} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {sim.ticks.slice(0, shown).map((k, t) => {
          const x = padL + t * bw + 0.5;
          const w = Math.max(1, bw - 1);
          return (
            <g key={t}>
              <rect className="rs-ok" x={x} y={y(k.ok)} width={w} height={y(0) - y(k.ok)} />
              <rect className="rs-fail" x={x} y={y(k.ok + k.failed)} width={w} height={y(k.ok) - y(k.ok + k.failed)} />
            </g>
          );
        })}
        <line className="rs-cap" x1={padL} x2={W} y1={y(CAPACITY)} y2={y(CAPACITY)} />
        <text className="rs-note" x={W - 4} y={y(CAPACITY) - 4} textAnchor="end">
          capacity
        </text>
        {[0, 2, 4, 6].map((sec) => (
          <text key={sec} className="rs-axis" x={padL + sec * 10 * bw} y={H - 6} textAnchor="start">
            {sec}s
          </text>
        ))}
      </svg>
      <div className="rs-legend" aria-hidden="true">
        <span className="rs-key ok">answered</span>
        <span className="rs-key fail">failed (will retry or give up)</span>
      </div>
    </DiagramFrame>
  );
}
