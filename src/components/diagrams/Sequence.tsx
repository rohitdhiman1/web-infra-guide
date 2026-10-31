/**
 * An animated sequence diagram: actors across the top, lifelines down, and one
 * arrow per message. Messages up to `shown` are drawn; the latest one animates
 * (the arrow draws itself and a packet travels along it).
 */
import { useEffect, useRef, useState } from 'react';

export interface Actor {
  id: string;
  label: string;
  /** Shorter label used when columns are narrow (phones). */
  short?: string;
  sub?: string;
}
export type Tone = 'default' | 'data' | 'enc' | 'bad' | 'ok' | 'muted';
export interface Message {
  from: string;
  to: string;
  label: string;
  /** Second, smaller line under the label. */
  sub?: string;
  tone?: Tone;
}
export interface Phase {
  label: string;
  /** Index of the first and last message in this phase. */
  start: number;
  end: number;
}

interface Props {
  actors: Actor[];
  messages: Message[];
  /** How many messages are visible (0 = none yet). */
  shown: number;
  /** Optional state label under each actor, keyed by actor id. */
  states?: Record<string, string | undefined>;
  phases?: Phase[];
  /** Accessible description of the whole diagram. */
  label: string;
  colWidth?: number;
}

const HEAD_H = 46;
const STATE_H = 30;
const ROW_H = 44;

/** Measures the element's content width, so the SVG can be laid out at 1:1 scale. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export default function Sequence({ actors, messages, shown, states, phases, label, colWidth = 120 }: Props) {
  const [wrapRef, measured] = useWidth<HTMLDivElement>();
  const ideal = Math.max(360, actors.length * colWidth);
  // Lay out at the real pixel width (down to 280px) so text never shrinks on phones.
  const width = measured ? Math.max(280, Math.min(ideal, measured)) : ideal;
  const col = width / actors.length;
  const narrow = col < 90;
  const x = (id: string) => {
    const i = actors.findIndex((a) => a.id === id);
    return col * (i + 0.5);
  };
  const top = HEAD_H + (states ? STATE_H + 8 : 8);
  const rowsTop = top + 14;
  // Each phase gets its own label strip above its first row, so labels never collide.
  const PH = phases?.length ? 18 : 0;
  const rowTop = (i: number) =>
    rowsTop + i * ROW_H + PH * (phases?.filter((p) => p.start <= i).length ?? 0);
  const height = rowTop(Math.max(0, messages.length - 1)) + (messages.length ? ROW_H : 0) + 6;
  const boxW = Math.min(col - 10, 132);

  return (
    <div ref={wrapRef} className="seq-wrap">
    <svg
      className={`dg-svg seq${narrow ? ' is-narrow' : ''}`}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={label}
    >
      {phases?.map((p) => {
        if (p.start >= shown) return null;
        const y1 = rowTop(p.start) - PH - 2;
        const y2 = rowTop(Math.min(p.end, shown - 1)) + ROW_H - 2;
        return (
          <g key={p.label} className="seq-phase">
            <rect x={2} y={y1} width={width - 4} height={y2 - y1} rx={6} />
            <text x={8} y={y1 + 13} className="seq-phase-label">
              {p.label}
            </text>
          </g>
        );
      })}

      {actors.map((a) => {
        const cx = x(a.id);
        return (
          <g key={a.id}>
            <line className="seq-lifeline" x1={cx} x2={cx} y1={HEAD_H} y2={height - 2} />
            <rect className="seq-actor" x={cx - boxW / 2} y={2} width={boxW} height={HEAD_H - 6} rx={8} />
            <text x={cx} y={a.sub && !narrow ? 20 : 27} textAnchor="middle" className="seq-actor-label">
              {narrow ? (a.short ?? a.label) : a.label}
            </text>
            {a.sub && !narrow && (
              <text x={cx} y={34} textAnchor="middle" className="seq-actor-sub">
                {a.sub}
              </text>
            )}
            {states && (
              <g>
                <rect
                  className={`seq-state${states[a.id] ? '' : ' is-empty'}`}
                  x={cx - boxW / 2 + 6}
                  y={HEAD_H + 4}
                  width={boxW - 12}
                  height={STATE_H - 6}
                  rx={12}
                />
                <text
                  key={states[a.id]}
                  x={cx}
                  y={HEAD_H + 4 + (STATE_H - 6) / 2 + 4}
                  textAnchor="middle"
                  className="seq-state-label"
                >
                  {states[a.id] ?? ''}
                </text>
              </g>
            )}
          </g>
        );
      })}

      {messages.slice(0, shown).map((m, i) => {
        const x1 = x(m.from);
        const x2 = x(m.to);
        const dir = x2 > x1 ? 1 : -1;
        const sx = x1 + dir * 4;
        const ex = x2 - dir * 4;
        const y = rowTop(i) + 26;
        const current = i === shown - 1;
        const tone = m.tone ?? 'default';
        const mid = (x1 + x2) / 2;
        return (
          <g key={i} className={`seq-msg tone-${tone}${current ? ' is-current' : ''}`}>
            <text x={mid} y={y - (m.sub ? 19 : 7)} textAnchor="middle" className="seq-msg-label">
              {m.label}
            </text>
            {m.sub && (
              <text x={mid} y={y - 6} textAnchor="middle" className="seq-msg-sub">
                {m.sub}
              </text>
            )}
            <line className="seq-line" x1={sx} x2={ex} y1={y} y2={y} pathLength={1} />
            <polygon
              className="seq-head"
              points={`${ex},${y} ${ex - dir * 9},${y - 5} ${ex - dir * 9},${y + 5}`}
            />
            {current && (
              <circle
                className="seq-dot"
                cx={sx}
                cy={y}
                r={5}
                style={{ ['--dx' as string]: `${ex - sx}px` }}
              />
            )}
          </g>
        );
      })}
    </svg>
    </div>
  );
}
