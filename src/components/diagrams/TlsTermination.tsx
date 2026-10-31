import { useState, type ReactNode } from 'react';
import DiagramFrame from './DiagramFrame';
import { ToggleGroup } from './shared';

type Mode = 'terminate' | 'reencrypt' | 'passthrough';

interface ModeInfo {
  label: string;
  hop1: 'tls' | 'plain';
  hop2: 'tls' | 'plain';
  /** What nginx sees in the middle. */
  sees: string;
  certs: ReactNode;
  can: string[];
  cannot: string[];
  config: string;
  summary: ReactNode;
}

const MODES: Record<Mode, ModeInfo> = {
  terminate: {
    label: 'Termination',
    hop1: 'tls',
    hop2: 'plain',
    sees: 'GET /cart · headers · body',
    certs: <>Public certificate and key on nginx. The backend has none.</>,
    can: ['Route by path and header', 'Cache responses', 'Add X-Forwarded-For', 'Rate limit, WAF, compress'],
    cannot: ['Protect traffic on the internal network'],
    config: `server {
    listen 443 ssl;
    ssl_certificate     fullchain.pem;
    ssl_certificate_key privkey.pem;
    location / {
        proxy_pass http://app;
    }
}`,
    summary: (
      <>
        nginx decrypts, sees the full HTTP request, and speaks plain HTTP to the backend. The most common setup, and
        the cheapest for the backend.
      </>
    ),
  },
  reencrypt: {
    label: 'Re-encryption',
    hop1: 'tls',
    hop2: 'tls',
    sees: 'GET /cart · headers · body',
    certs: <>Public certificate on nginx; an internal-CA certificate on the backend, which nginx verifies.</>,
    can: ['Everything termination can', 'Encrypt the internal hop too (zero trust, compliance)'],
    cannot: ['Avoid the cost of a second handshake'],
    config: `location / {
    proxy_pass https://app;
    proxy_ssl_verify on;
    proxy_ssl_trusted_certificate internal-ca.pem;
    proxy_ssl_server_name on;
}`,
    summary: (
      <>
        nginx decrypts, inspects, then opens a <em>new</em> TLS connection to the backend. Full visibility, encrypted
        everywhere, two handshakes.
      </>
    ),
  },
  passthrough: {
    label: 'Passthrough',
    hop1: 'tls',
    hop2: 'tls',
    sees: 'SNI only: www.example.com',
    certs: <>Certificate and key live only on the backend. nginx never holds them.</>,
    can: ['Route by hostname (SNI)', 'Keep keys off the proxy'],
    cannot: ['Route by path', 'Cache', 'Add headers (backend sees nginx as the client)', 'Log status codes or URLs'],
    config: `stream {
    map $ssl_preread_server_name $backend {
        www.example.com  app:443;
    }
    server {
        listen 443;
        ssl_preread on;
        proxy_pass $backend;
    }
}`,
    summary: (
      <>
        nginx forwards encrypted bytes at layer 4, peeking only at the SNI in the ClientHello. One end-to-end TLS
        session, from client to backend.
      </>
    ),
  },
};

function Link({ kind, label, delay }: { kind: 'tls' | 'plain'; label: string; delay: number }) {
  return (
    <div className={`tt-link is-${kind}`}>
      <span className="tt-link-label">{kind === 'tls' ? '🔒 TLS' : 'plain HTTP'}</span>
      <div className="tt-track">
        <span className="tt-packet" style={{ animationDelay: `${delay}s` }}>
          {kind === 'tls' ? '🔒 ▓▓▓▓' : label}
        </span>
      </div>
    </div>
  );
}

export default function TlsTermination() {
  const [mode, setMode] = useState<Mode>('terminate');
  const m = MODES[mode];

  return (
    <DiagramFrame
      title="TLS termination modes"
      subtitle="3 options"
      status={m.summary}
      controls={
        <ToggleGroup
          label="Where is TLS decrypted?"
          value={mode}
          onChange={setMode}
          options={(Object.keys(MODES) as Mode[]).map((k) => ({ value: k, label: MODES[k].label }))}
        />
      }
    >
      <div className="tt" key={mode}>
        <div className="tt-path" aria-label={`Client to nginx: ${m.hop1 === 'tls' ? 'encrypted' : 'plain'}. nginx to backend: ${m.hop2 === 'tls' ? 'encrypted' : 'plain'}.`} role="img">
          <div className="tt-node">
            <strong>Client</strong>
            <span>browser</span>
          </div>
          <Link kind={m.hop1} label="GET /cart" delay={0} />
          <div className={`tt-node is-proxy${mode === 'passthrough' ? ' is-blind' : ''}`}>
            <strong>nginx</strong>
            <span className="tt-sees">sees: {m.sees}</span>
          </div>
          <Link kind={m.hop2} label="GET /cart" delay={1.1} />
          <div className="tt-node">
            <strong>Backend</strong>
            <span>app</span>
          </div>
        </div>
        <div className="tt-info">
          <div className="dg-card">
            <div className="tt-h">Certificates</div>
            {m.certs}
            <div className="tt-lists">
              <ul className="tt-can">
                {m.can.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <ul className="tt-cannot">
                {m.cannot.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          </div>
          <pre className="dg-code" tabIndex={0} aria-label="nginx configuration">
            <code>{m.config}</code>
          </pre>
        </div>
      </div>
    </DiagramFrame>
  );
}
