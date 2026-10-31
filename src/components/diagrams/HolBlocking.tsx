import { useState } from 'react';
import DiagramFrame from './DiagramFrame';
import { Switch, ToggleGroup, useInterval } from './shared';

type Proto = 'h1' | 'h2' | 'h3';
type Stream = 'A' | 'B' | 'C';

interface Pkt {
  stream: Stream;
  n: number; // 1..3 within its response
  /** Tick at which it reaches the receiver (null = lost, never). */
  arrives: number;
  lost?: boolean;
  retx?: boolean;
}

const STREAMS: Stream[] = ['A', 'B', 'C'];
const TICKS = 10;

/**
 * Nine packets, one per tick. With loss on, the 2nd packet sent is lost and its
 * retransmission arrives last, at tick 10 (after a retransmission timeout).
 */
function schedule(proto: Proto, loss: boolean): Pkt[] {
  const order: [Stream, number][] =
    proto === 'h1'
      ? STREAMS.flatMap((s) => [1, 2, 3].map((n) => [s, n] as [Stream, number]))
      : [1, 2, 3].flatMap((n) => STREAMS.map((s) => [s, n] as [Stream, number]));
  const pkts: Pkt[] = order.map(([stream, n], i) => ({ stream, n, arrives: i + 1 }));
  if (loss) {
    pkts[1] = { ...pkts[1], lost: true };
    pkts.push({ ...pkts[1], lost: false, retx: true, arrives: TICKS });
  }
  return pkts;
}

/**
 * When does each packet become usable by the application?
 * TCP (h1, h2): strictly in send order, so a gap holds back everything behind it.
 * QUIC (h3): in order only within its own stream.
 */
function deliveryTimes(proto: Proto, pkts: Pkt[]) {
  const sent = pkts.filter((p) => !p.retx);
  const arrival = (p: Pkt) =>
    p.lost ? pkts.find((r) => r.retx && r.stream === p.stream && r.n === p.n)!.arrives : p.arrives;
  const out = new Map<string, number>();
  if (proto === 'h3') {
    for (const s of STREAMS) {
      let t = 0;
      for (const p of sent.filter((x) => x.stream === s)) {
        t = Math.max(t, arrival(p));
        out.set(`${p.stream}${p.n}`, t);
      }
    }
  } else {
    let t = 0;
    for (const p of sent) {
      t = Math.max(t, arrival(p));
      out.set(`${p.stream}${p.n}`, t);
    }
  }
  return out;
}

const INFO: Record<Proto, { title: string; text: string; lossText: string }> = {
  h1: {
    title: 'HTTP/1.1, one connection',
    text: 'Responses go one after another. B cannot start until all of A is done: HTTP-level head-of-line blocking (3.9).',
    lossText: 'A lost packet in A stalls the TCP stream, and B and C are queued behind A anyway. Everything finishes late.',
  },
  h2: {
    title: 'HTTP/2, one TCP connection',
    text: 'Streams are interleaved on one connection, so B and C no longer wait for A to finish (6.2).',
    lossText:
      "One lost packet from B, and TCP holds back every byte behind it, A's and C's too, until the retransmission arrives. TCP head-of-line blocking remains (6.5).",
  },
  h3: {
    title: 'HTTP/3 over QUIC',
    text: 'Same interleaving as HTTP/2, but each stream is delivered independently (6.6).',
    lossText: 'The lost packet stalls only stream B. A and C keep being delivered and finish on time (6.6).',
  },
};

export default function HolBlocking() {
  const [proto, setProto] = useState<Proto>('h2');
  const [loss, setLoss] = useState(true);
  const [tick, setTick] = useState(0);
  const [playing, setPlaying] = useState(false);

  const pkts = schedule(proto, loss);
  const lastTick = Math.max(...pkts.map((p) => p.arrives));
  const deliver = deliveryTimes(proto, pkts);
  const finished = tick >= lastTick;
  const finishAt = (s: Stream) => Math.max(...[1, 2, 3].map((n) => deliver.get(`${s}${n}`)!));

  useInterval(() => setTick((t) => Math.min(lastTick, t + 1)), 650, playing && !finished);

  const restart = (fn: () => void) => {
    fn();
    setTick(0);
    setPlaying(false);
  };
  const info = INFO[proto];

  return (
    <DiagramFrame
      title="Head-of-line blocking"
      subtitle="HTTP/1.1 vs HTTP/2 vs HTTP/3"
      status={
        <>
          <strong>{info.title}.</strong> {loss ? info.lossText : info.text}{' '}
          <span className="hol-sum">
            {finished
              ? `Finished: ${STREAMS.map((s) => `${s} at tick ${finishAt(s)}`).join(', ')}.`
              : `Tick ${tick} of ${lastTick}.`}
          </span>
        </>
      }
      controls={
        <>
          <ToggleGroup
            label="Protocol"
            value={proto}
            onChange={(v) => restart(() => setProto(v))}
            options={[
              { value: 'h1', label: 'HTTP/1.1' },
              { value: 'h2', label: 'HTTP/2' },
              { value: 'h3', label: 'HTTP/3' },
            ]}
          />
          <div className="dg-toggle">
            <span className="dg-label">Network</span>
            <Switch checked={loss} onChange={(v) => restart(() => setLoss(v))}>
              Lose packet 2
            </Switch>
          </div>
          <div className="dg-toggle">
            <span className="dg-label">Run</span>
            <div className="dg-btn-group">
              <button
                type="button"
                className="dg-btn is-primary"
                aria-disabled={finished}
                onClick={() => !finished && setPlaying((p) => !p)}
              >
                {playing && !finished ? '❚❚ Pause' : '▶ Play'}
              </button>
              <button
                type="button"
                className="dg-btn"
                aria-disabled={finished}
                onClick={() => setTick((t) => Math.min(lastTick, t + 1))}
              >
                Step
              </button>
              <button type="button" className="dg-btn" onClick={() => restart(() => {})}>
                Reset
              </button>
            </div>
          </div>
        </>
      }
    >
      <div className="hol">
        <div className="hol-label">On the wire ({proto === 'h3' ? 'UDP / QUIC' : 'one TCP connection'})</div>
        <ol className="hol-wire" aria-label="Packets in the order they arrive">
          {Array.from({ length: lastTick }, (_, i) => {
            const p = pkts.find((x) => x.arrives === i + 1 && !x.lost) ?? pkts.find((x) => x.lost && i === 1);
            const lostSlot = loss && i === 1;
            const arrived = tick >= i + 1;
            return (
              <li
                key={`${proto}-${loss}-${i}`}
                className={`hol-slot${arrived ? ' is-in' : ''}${lostSlot ? ' is-lost' : ''} s-${p?.stream}`}
              >
                {arrived ? (
                  <span className="hol-pkt">
                    {lostSlot ? '✗' : ''}
                    {p?.stream}
                    {p?.n}
                    {p?.retx ? '↻' : ''}
                  </span>
                ) : (
                  <span className="hol-empty" aria-hidden="true">
                    ·
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        <div className="hol-label">Delivered to the browser</div>
        <div className="hol-lanes">
          {STREAMS.map((s) => {
            const done = tick >= finishAt(s);
            const held = [1, 2, 3].filter((n) => {
              const pk = pkts.find((x) => x.stream === s && x.n === n && !x.lost);
              return pk && pk.arrives <= tick && deliver.get(`${s}${n}`)! > tick;
            }).length;
            return (
              <div key={s} className={`hol-lane s-${s}`}>
                <span className="hol-lane-name">Response {s}</span>
                <span className="hol-boxes">
                  {[1, 2, 3].map((n) => {
                    const d = deliver.get(`${s}${n}`)!;
                    const pk = pkts.find((x) => x.stream === s && x.n === n && !x.lost);
                    const state = d <= tick ? 'is-done' : pk && pk.arrives <= tick ? 'is-held' : '';
                    return (
                      <span key={n} className={`hol-box ${state}`}>
                        {s}
                        {n}
                      </span>
                    );
                  })}
                </span>
                <span className={`dg-pill ${done ? 'ok' : held ? 'bad' : 'muted'}`}>
                  {done ? `done at tick ${finishAt(s)}` : held ? `${held} held: blocked` : 'waiting'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </DiagramFrame>
  );
}
