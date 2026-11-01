import { useState } from 'react';
import DiagramFrame from './DiagramFrame';
import { ToggleGroup, useMeasuredWidth } from './shared';

type Case = 'good' | 'shell' | 'nohandler' | 'init';

interface Outcome {
  label: string;
  /** When the process exits, in seconds after docker stop. */
  exitAt: number;
  code: number;
  events: { t: number; text: string; tone: 'info' | 'ok' | 'bad' }[];
  text: string;
}

const CASES: Record<Case, Outcome> = {
  good: {
    label: 'Exec form, app handles SIGTERM',
    exitAt: 2.5,
    code: 0,
    events: [
      { t: 0, text: 'SIGTERM → java (PID 1)', tone: 'info' },
      { t: 0.1, text: 'stop accepting, drain in-flight requests', tone: 'ok' },
      { t: 2.5, text: 'exit 0', tone: 'ok' },
    ],
    text: 'CMD ["java", "-jar", "app.jar"] makes Java PID 1, and Spring Boot installs a SIGTERM handler (with server.shutdown=graceful it finishes in-flight requests). The container stops cleanly in a couple of seconds, and no request is cut off.',
  },
  shell: {
    label: 'Shell form: CMD java -jar app.jar',
    exitAt: 10,
    code: 137,
    events: [
      { t: 0, text: 'SIGTERM → /bin/sh (PID 1)', tone: 'info' },
      { t: 0.1, text: 'the shell doesn’t pass it to java', tone: 'bad' },
      { t: 10, text: 'SIGKILL: everything dies, exit 137', tone: 'bad' },
    ],
    text: 'The shell form runs /bin/sh -c "java -jar app.jar", so the shell is PID 1 and gets the SIGTERM. Many shells don’t forward it, so Java never hears about the shutdown. After 10 seconds Docker sends SIGKILL, and in-flight requests are cut off mid-response.',
  },
  nohandler: {
    label: 'PID 1 without a SIGTERM handler',
    exitAt: 10,
    code: 137,
    events: [
      { t: 0, text: 'SIGTERM → app (PID 1)', tone: 'info' },
      { t: 0.1, text: 'PID 1 ignores signals it has no handler for', tone: 'bad' },
      { t: 10, text: 'SIGKILL, exit 137', tone: 'bad' },
    ],
    text: 'Even in exec form, a program with no SIGTERM handler ignores the signal when it’s PID 1 (as a normal process, the default action would kill it). Docker waits the full 10 seconds, then SIGKILLs it.',
  },
  init: {
    label: 'docker run --init',
    exitAt: 0.2,
    code: 143,
    events: [
      { t: 0, text: 'SIGTERM → tini (PID 1)', tone: 'info' },
      { t: 0.05, text: 'tini forwards it to the app (PID 7)', tone: 'ok' },
      { t: 0.2, text: 'default action: terminate, exit 143', tone: 'ok' },
    ],
    text: 'With --init, a tiny init (tini) is PID 1. It forwards signals and reaps zombies. The app is no longer PID 1, so even without a handler, SIGTERM’s default action ends it immediately (exit 143 = 128 + 15). Better still is a handler that drains first.',
  },
};

export default function StopTimeline() {
  const [c, setC] = useState<Case>('good');
  const o = CASES[c];
  const [wrapRef, measured] = useMeasuredWidth<HTMLDivElement>(600);
  const W = Math.min(760, measured);
  const H = 70;
  const pad = 10;
  const x = (t: number) => pad + (t / 11) * (W - pad * 2);

  return (
    <DiagramFrame
      title="docker stop, second by second"
      subtitle="SIGTERM, a 10-second grace period, then SIGKILL"
      status={
        <>
          <span className={`dg-pill ${o.code === 137 ? 'bad' : 'ok'}`}>
            exit {o.code} after {o.exitAt < 1 ? `${o.exitAt * 1000} ms` : `${o.exitAt} s`}
          </span>{' '}
          {o.text}
        </>
      }
      controls={<ToggleGroup label="How the container was built" value={c} onChange={setC} options={(Object.keys(CASES) as Case[]).map((k) => ({ value: k, label: CASES[k].label }))} />}
    >
      <div ref={wrapRef}>
        <svg className="dg-svg stop" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`The container exits after ${o.exitAt} seconds with code ${o.code}`}>
          {[0, 2, 4, 6, 8, 10].map((t) => (
            <g key={t}>
              <line className="stop-grid" x1={x(t)} x2={x(t)} y1={18} y2={46} />
              <text className="stop-axis" x={x(t)} y={62} textAnchor="middle">
                {t}s
              </text>
            </g>
          ))}
          <rect className="stop-grace" x={x(0)} y={24} width={x(10) - x(0)} height={16} rx={3} />
          <rect className={`stop-run${o.code === 137 ? ' is-bad' : ''}`} x={x(0)} y={24} width={Math.max(3, x(o.exitAt) - x(0))} height={16} rx={3} />
          <text className="stop-mark" x={x(0) + 2} y={14}>
            docker stop
          </text>
          <text className="stop-mark" x={x(10)} y={14} textAnchor="middle">
            SIGKILL
          </text>
        </svg>
      </div>
      <ol className="stop-events">
        {o.events.map((e) => (
          <li key={e.text}>
            <span className="stop-t">{e.t < 1 ? `${Math.round(e.t * 1000)} ms` : `${e.t} s`}</span>
            <span className={`dg-pill ${e.tone}`}>{e.text}</span>
          </li>
        ))}
      </ol>
    </DiagramFrame>
  );
}
