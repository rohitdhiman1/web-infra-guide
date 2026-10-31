import { useState, type ReactNode } from 'react';
import DiagramFrame from './DiagramFrame';

type CheckId = 'dns' | 'tls' | 'nginx';
type Guess = CheckId | 'none';

interface Result {
  ok: boolean;
  compared: ReactNode;
  detail: ReactNode;
}

interface Host {
  name: string;
  dns: Result;
  tls: Result;
  nginx: Result;
  /** Line ids to highlight in the zone / cert / config panels. */
  zone?: string;
  san?: string;
  server?: string;
}

const HOSTS: Host[] = [
  {
    name: 'example.com',
    zone: 'apex',
    san: 'example.com',
    server: 'main',
    dns: { ok: true, compared: <>A record</>, detail: <>A → 203.0.113.10</> },
    tls: { ok: true, compared: <>SNI vs SAN</>, detail: <>exact SAN entry <code>example.com</code></> },
    nginx: { ok: true, compared: <>Host vs server_name</>, detail: <>exact match in the main site's block</> },
  },
  {
    name: 'www.example.com',
    zone: 'www',
    san: 'wild',
    server: 'main',
    dns: { ok: true, compared: <>CNAME, then A</>, detail: <>CNAME → example.com → 203.0.113.10</> },
    tls: {
      ok: true,
      compared: <>SNI vs SAN</>,
      detail: (
        <>
          <code>*.example.com</code> covers one label. The CNAME didn't change the name being checked.
        </>
      ),
    },
    nginx: { ok: true, compared: <>Host vs server_name</>, detail: <>exact match in the main site's block</> },
  },
  {
    name: 'api.example.com',
    zone: 'api',
    san: 'wild',
    server: 'api',
    dns: { ok: true, compared: <>A record</>, detail: <>A → 203.0.113.10</> },
    tls: { ok: true, compared: <>SNI vs SAN</>, detail: <><code>*.example.com</code> covers it</> },
    nginx: { ok: true, compared: <>Host vs server_name</>, detail: <>exact match in the API block</> },
  },
  {
    name: 'beta.api.example.com',
    zone: 'beta',
    san: 'wild',
    dns: { ok: true, compared: <>A record</>, detail: <>A → 203.0.113.10</> },
    tls: {
      ok: false,
      compared: <>SNI vs SAN</>,
      detail: (
        <>
          A wildcard covers exactly one label, so <code>*.example.com</code> doesn't cover two.{' '}
          <code>ERR_CERT_COMMON_NAME_INVALID</code>
        </>
      ),
    },
    nginx: { ok: false, compared: <>Host vs server_name</>, detail: <>never reached: the browser aborts the handshake</> },
  },
  {
    name: 'shop.example.com',
    zone: 'shop',
    san: 'wild',
    server: 'default',
    dns: { ok: true, compared: <>A record</>, detail: <>A → 203.0.113.10</> },
    tls: { ok: true, compared: <>SNI vs SAN</>, detail: <><code>*.example.com</code> covers it</> },
    nginx: {
      ok: false,
      compared: <>Host vs server_name</>,
      detail: (
        <>
          No <code>server_name</code> matches, so the <code>default_server</code> answers: <code>444</code>, the
          connection closed with no response.
        </>
      ),
    },
  },
  {
    name: 'blog.example.com',
    dns: {
      ok: false,
      compared: <>A / AAAA / CNAME</>,
      detail: (
        <>
          No record for this name: NXDOMAIN. curl: <code>Could not resolve host</code>
        </>
      ),
    },
    tls: { ok: false, compared: <>SNI vs SAN</>, detail: <>never reached: there is no IP to connect to</> },
    nginx: { ok: false, compared: <>Host vs server_name</>, detail: <>never reached</> },
  },
];

const CHECKS: { id: CheckId; title: string }[] = [
  { id: 'dns', title: '1. DNS' },
  { id: 'tls', title: '2. TLS certificate' },
  { id: 'nginx', title: '3. nginx' },
];

const ZONE: [string, string][] = [
  ['apex', 'example.com.          A      203.0.113.10'],
  ['www', 'www.example.com.      CNAME  example.com.'],
  ['api', 'api.example.com.      A      203.0.113.10'],
  ['beta', 'beta.api.example.com. A      203.0.113.10'],
  ['shop', 'shop.example.com.     A      203.0.113.10'],
];
const SAN: [string, string][] = [
  ['example.com', 'DNS:example.com'],
  ['wild', 'DNS:*.example.com'],
];
const NGINX: [string, string][] = [
  ['default', 'server { listen 443 ssl default_server;\n         server_name _;  return 444; }'],
  ['main', 'server { listen 443 ssl;\n         server_name example.com www.example.com; … }'],
  ['api', 'server { listen 443 ssl;\n         server_name api.example.com; … }'],
];

function firstFail(h: Host): Guess {
  if (!h.dns.ok) return 'dns';
  if (!h.tls.ok) return 'tls';
  if (!h.nginx.ok) return 'nginx';
  return 'none';
}

function Panel({ title, lines, hl }: { title: string; lines: [string, string][]; hl?: string }) {
  return (
    <div className="hc-panel">
      <div className="hc-panel-title">{title}</div>
      <pre className="dg-code" tabIndex={0} aria-label={title}>
        {lines.map(([id, text]) => (
          <span key={id} className={`hc-line${hl === id ? ' is-hl' : ''}`}>
            {text}
            {'\n'}
          </span>
        ))}
      </pre>
    </div>
  );
}

export default function HostnameChecks() {
  const [sel, setSel] = useState<string | null>(null);
  const [guess, setGuess] = useState<Guess | null>(null);
  const [revealed, setRevealed] = useState(false);
  const host = HOSTS.find((h) => h.name === sel);
  const fail = host ? firstFail(host) : null;

  const pick = (name: string) => {
    setSel(name);
    setGuess(null);
    setRevealed(false);
  };
  const doGuess = (g: Guess) => {
    setGuess(g);
    setRevealed(true);
  };

  const failIndex = fail === 'none' ? 3 : CHECKS.findIndex((c) => c.id === fail);

  let status: ReactNode;
  if (!host) status = <>Click a hostname, then predict which of the three checks fails.</>;
  else if (!revealed) status = <>Opening <code>https://{host.name}</code>. Which check says no?</>;
  else
    status = (
      <>
        {guess && (
          <span className={`dg-pill ${guess === fail ? 'ok' : 'bad'}`}>{guess === fail ? 'Correct' : 'Not quite'}</span>
        )}{' '}
        {fail === 'none' ? (
          <strong>All three checks pass.</strong>
        ) : (
          <>
            <strong>The {CHECKS[failIndex].title.slice(3)} check fails.</strong> {host[fail as CheckId].detail}
          </>
        )}
      </>
    );

  return (
    <DiagramFrame
      title="One hostname, three checks"
      subtitle="6 names, 3 checks each"
      status={status}
      controls={
        <>
          <div className="dg-toggle" role="group" aria-label="Hostname">
            <span className="dg-label">Hostname</span>
            <div className="dg-btn-group">
              {HOSTS.map((h) => (
                <button key={h.name} type="button" className="dg-btn" aria-pressed={sel === h.name} onClick={() => pick(h.name)}>
                  {h.name}
                </button>
              ))}
            </div>
          </div>
          {host && (
            // Stays mounted after the reveal (buttons go aria-disabled) so keyboard focus isn't lost.
            <div className="dg-toggle" role="group" aria-label="Your prediction">
              <span className="dg-label">Your prediction: which check fails?</span>
              <div className="dg-btn-group">
                {(
                  [
                    ['dns', 'DNS'],
                    ['tls', 'TLS'],
                    ['nginx', 'nginx'],
                    ['none', 'None, it works'],
                  ] as [Guess, string][]
                ).map(([g, label]) => (
                  <button
                    key={g}
                    type="button"
                    className="dg-btn"
                    aria-pressed={guess === g}
                    aria-disabled={revealed}
                    onClick={() => !revealed && doGuess(g)}
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  className="dg-btn is-primary"
                  aria-disabled={revealed}
                  onClick={() => setRevealed(true)}
                >
                  Just show me
                </button>
              </div>
            </div>
          )}
        </>
      }
    >
      <div className="hc">
        <div className="hc-checks" key={`${sel}-${revealed}`}>
          {CHECKS.map((c, i) => {
            const r = host?.[c.id];
            const state = !host || !revealed ? 'pending' : i < failIndex ? 'pass' : i === failIndex ? 'fail' : 'skipped';
            return (
              <div key={c.id} className={`hc-check is-${state}`} style={{ animationDelay: `${i * 0.45}s` }}>
                <div className="hc-check-head">
                  <span className="hc-icon" aria-hidden="true">
                    {state === 'pass' ? '✓' : state === 'fail' ? '✗' : state === 'skipped' ? '–' : '?'}
                  </span>
                  <strong>{c.title}</strong>
                </div>
                <div className="hc-compared">{r ? r.compared : ' '}</div>
                <div className="hc-detail">
                  {state === 'pending' ? (host ? 'predict first…' : ' ') : state === 'skipped' ? 'not reached' : r!.detail}
                </div>
              </div>
            );
          })}
        </div>
        <div className="hc-panels">
          <Panel title="DNS zone: example.com" lines={ZONE} hl={revealed ? host?.zone : undefined} />
          <Panel title="Certificate SAN list" lines={SAN} hl={revealed ? host?.san : undefined} />
          <Panel title="nginx" lines={NGINX} hl={revealed ? host?.server : undefined} />
        </div>
      </div>
    </DiagramFrame>
  );
}
