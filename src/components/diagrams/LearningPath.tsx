import { useEffect, useState } from 'react';
import DiagramFrame from './DiagramFrame';

interface Part {
  label: string;
  href: string;
  plan: string;
}
interface Phase {
  n: number;
  name: string;
  /** Relative bar width only (the guide gives ~18 weeks in total, not per phase). */
  weeks: number;
  parts: Part[];
  gate: string;
}

// Plans and gates are taken from each part's "Plan …" line and "You've got it when …" check.
const PHASES: Phase[] = [
  {
    n: 1,
    name: 'Foundations',
    weeks: 4,
    parts: [
      { label: 'Part 1 — Networking foundations', href: '/part-1-networking/', plan: 'about one week' },
      { label: 'Part 2 — The Linux layer', href: '/part-2-linux/', plan: 'about one week, overlapping with Part 4' },
      { label: 'Part 3 — HTTP/1.1 in depth', href: '/part-3-http11/', plan: 'about two weeks' },
    ],
    gate: 'Draw the packets for opening, using and closing a TCP connection, and write a valid HTTP/1.1 request and response from memory.',
  },
  {
    n: 2,
    name: 'Build a server',
    weeks: 3,
    parts: [{ label: 'Part 4 — Building raw web servers', href: '/part-4-raw-servers/', plan: 'two to three weeks' }],
    gate: 'Your event-loop server handles hundreds of concurrent connections, and you can explain from your own benchmark why it beats v1.',
  },
  {
    n: 3,
    name: 'Secure it',
    weeks: 3,
    parts: [
      { label: 'Part 5 — TLS and HTTPS', href: '/part-5-tls/', plan: 'about two weeks' },
      { label: 'Part 6 — HTTP/2 and HTTP/3', href: '/part-6-http2-http3/', plan: 'about one week' },
    ],
    gate: 'Explain each message of a TLS 1.3 handshake, and fix a "certificate verify failed" error by reading the chain.',
  },
  {
    n: 4,
    name: 'Master nginx',
    weeks: 5,
    parts: [
      { label: 'Part 7 — nginx core', href: '/part-7-nginx-core/', plan: 'two weeks' },
      { label: 'One hostname, three checks', href: '/one-hostname-three-checks/', plan: 'one lab' },
      { label: 'Part 8 — nginx as a reverse proxy', href: '/part-8-reverse-proxy/', plan: 'two weeks' },
      { label: 'Part 9 — Load balancing', href: '/part-9-load-balancing/', plan: 'one to two weeks' },
      { label: 'Part 10 — Caching, performance and security', href: '/part-10-caching-security/', plan: 'two weeks' },
    ],
    gate: 'Predict which server and location handle any request, map any 502, 504 or 413 to its directive, and kill any machine with no user errors.',
  },
  {
    n: 5,
    name: 'Production',
    weeks: 3,
    parts: [
      { label: 'Part 11 — Application servers', href: '/part-11-app-servers/', plan: 'one week' },
      { label: 'Part 12 — Observability and debugging', href: '/part-12-observability/', plan: 'a dedicated week' },
      { label: 'Field guide', href: '/field-guide/', plan: 'reference' },
      { label: 'Part 13 — The edge', href: '/part-13-edge/', plan: 'one week' },
      { label: 'Part 14 — nginx in production', href: '/part-14-production/', plan: 'one week' },
      { label: 'Part 15 — Capstone', href: '/part-15-capstone/', plan: 'two 6-hour sandbox windows' },
    ],
    gate: 'The capstone survives every drill, and you can tear it down and rebuild it from Git alone in under 30 minutes.',
  },
];

const KEY = 'web-infra-guide:gates';

function loadGates(): number[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'number') : [];
  } catch {
    return [];
  }
}

export default function LearningPath() {
  const [sel, setSel] = useState(1);
  const [passed, setPassed] = useState<number[]>([]);
  useEffect(() => setPassed(loadGates()), []);

  const toggleGate = (n: number) => {
    setPassed((p) => {
      const next = p.includes(n) ? p.filter((x) => x !== n) : [...p, n];
      try {
        window.localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable: progress just isn't remembered */
      }
      return next;
    });
  };

  const phase = PHASES.find((p) => p.n === sel)!;
  const done = passed.length;

  return (
    <DiagramFrame
      title="Learning path"
      subtitle="5 phases, 5 gates, about 18 weeks"
      status={
        <div className="dg-detail">
          <div>
            <strong>
              Phase {phase.n} — {phase.name}.
            </strong>{' '}
            Gate: {phase.gate}
          </div>
          <ul className="lp-parts">
            {phase.parts.map((p) => (
              <li key={p.href}>
                <a href={p.href}>{p.label}</a> <span>· {p.plan}</span>
              </li>
            ))}
          </ul>
        </div>
      }
      controls={
        <div className="dg-row">
          <button
            type="button"
            className="dg-btn dg-switch"
            aria-pressed={passed.includes(phase.n)}
            onClick={() => toggleGate(phase.n)}
          >
            <span className="dg-switch-track" aria-hidden="true">
              <span className="dg-switch-thumb" />
            </span>
            I passed gate {phase.n}, without notes
          </button>
          <span className="dg-progress">
            {done} of 5 gates passed{done === 5 && ' · finished!'}
          </span>
        </div>
      }
    >
      <div className="lp">
        <ol className="lp-road" aria-label="Phases">
          {PHASES.map((p) => {
            const isPassed = passed.includes(p.n);
            return (
              <li key={p.n} className="lp-item" style={{ flexGrow: p.weeks }}>
                <button
                  type="button"
                  className={`lp-phase${isPassed ? ' is-passed' : ''}`}
                  aria-pressed={sel === p.n}
                  onClick={() => setSel(p.n)}
                >
                  <span className="lp-n">{isPassed ? '✓' : p.n}</span>
                  <span className="lp-name">{p.name}</span>
                  <span className="lp-meta">
                    {p.parts.filter((x) => x.label.startsWith('Part')).length} part
                    {p.parts.filter((x) => x.label.startsWith('Part')).length > 1 ? 's' : ''}
                  </span>
                </button>
                <span className={`lp-gate${isPassed ? ' is-passed' : ''}`} aria-hidden="true" title={`Gate ${p.n}`}>
                  ◆
                </span>
              </li>
            );
          })}
        </ol>
        <div className="lp-under" aria-hidden="true">
          <span>Observability (Part 12) runs underneath every phase</span>
        </div>
        <div className="lp-scale" aria-hidden="true">
          <span>week 0</span>
          <span>about 18 weeks</span>
        </div>
      </div>
    </DiagramFrame>
  );
}
