import { useEffect, useState, type ReactNode } from 'react';
import DiagramFrame from './DiagramFrame';
import { ToggleGroup } from './shared';

type CertId = 'root' | 'inter' | 'leaf';
type Served = 'fullchain' | 'leaf';
type Client = 'browser' | 'curl';

interface Cert {
  id: CertId;
  kind: string;
  subject: string;
  issuer: string;
  lives: ReactNode;
  fields: [string, ReactNode][];
}

const CERTS: Cert[] = [
  {
    id: 'root',
    kind: 'Root CA',
    subject: 'Example Root CA',
    issuer: 'itself (self-signed)',
    lives: <>Pre-installed in the client's trust store. Never sent by the server.</>,
    fields: [
      ['Subject', 'CN=Example Root CA'],
      ['Issuer', 'CN=Example Root CA (self-signed)'],
      ['Valid', '2015 → 2040'],
      ['Key', 'kept offline; signs only intermediates'],
    ],
  },
  {
    id: 'inter',
    kind: 'Intermediate CA',
    subject: 'Example TLS Issuing CA R3',
    issuer: 'Example Root CA',
    lives: (
      <>
        Sent by your server, after the leaf, in <code>fullchain.pem</code>.
      </>
    ),
    fields: [
      ['Subject', 'CN=Example TLS Issuing CA R3'],
      ['Issuer', 'CN=Example Root CA'],
      ['Valid', '2024 → 2027'],
      ['Key', "online at the CA; signs your leaf"],
    ],
  },
  {
    id: 'leaf',
    kind: 'Leaf (server) certificate',
    subject: 'www.example.com',
    issuer: 'Example TLS Issuing CA R3',
    lives: (
      <>
        First in <code>fullchain.pem</code> (<code>ssl_certificate</code>). Its private key stays on the server (
        <code>ssl_certificate_key</code>).
      </>
    ),
    fields: [
      ['Subject', 'CN=www.example.com'],
      ['SAN', 'example.com, www.example.com'],
      ['Issuer', 'CN=Example TLS Issuing CA R3'],
      ['Valid', '90 days'],
    ],
  },
];

/** The verification walk, leaf upwards. Each check lights up in turn. */
function checks(served: Served, client: Client) {
  const fetches = client === 'browser';
  const hasInter = served === 'fullchain' || fetches;
  return [
    { label: 'Leaf: name www.example.com is in the SAN list, dates are valid', ok: true },
    hasInter
      ? {
          label:
            served === 'fullchain'
              ? "Leaf's signature verifies with the intermediate's public key (intermediate was sent)"
              : "Intermediate wasn't sent, but the browser fetched it (AIA) or had it cached",
          ok: true,
          warn: served !== 'fullchain',
        }
      : { label: 'No intermediate sent: nothing to verify the leaf against', ok: false },
    hasInter
      ? { label: "Intermediate's signature verifies with the root's public key", ok: true }
      : null,
    hasInter ? { label: 'Root found in the trust store: chain trusted', ok: true } : null,
  ].filter(Boolean) as { label: string; ok: boolean; warn?: boolean }[];
}

export default function ChainOfTrust() {
  const [served, setServed] = useState<Served>('fullchain');
  const [client, setClient] = useState<Client>('curl');
  const [sel, setSel] = useState<CertId>('leaf');
  const [run, setRun] = useState(0);
  const list = checks(served, client);
  const ok = list.every((c) => c.ok);
  const cert = CERTS.find((c) => c.id === sel)!;
  const interMissing = served === 'leaf';

  // Re-run the verification animation whenever the setup changes.
  useEffect(() => setRun((r) => r + 1), [served, client]);

  const result = ok ? (
    interMissing ? (
      <>
        <span className="dg-pill warn">works in the browser</span> The page loads, but only because the browser
        papered over the missing intermediate. curl, Python and Java clients will fail. "It works in my browser" proves
        nothing.
      </>
    ) : (
      <>
        <span className="dg-pill ok">verified</span> Every link in the chain checks out, from your leaf up to a root the
        client already trusts.
      </>
    )
  ) : (
    <>
      <span className="dg-pill bad">certificate verify failed</span> curl:{' '}
      <code>unable to get local issuer certificate</code>. The fix is server-side: point <code>ssl_certificate</code>{' '}
      at <code>fullchain.pem</code>, not <code>cert.pem</code>.
    </>
  );

  return (
    <DiagramFrame
      title="Chain of trust"
      subtitle="root, intermediate, leaf"
      status={result}
      controls={
        <>
          <ToggleGroup
            label="Server sends"
            value={served}
            onChange={setServed}
            options={[
              { value: 'fullchain', label: 'fullchain.pem' },
              { value: 'leaf', label: 'leaf only (cert.pem)' },
            ]}
          />
          <ToggleGroup
            label="Client"
            value={client}
            onChange={setClient}
            options={[
              { value: 'curl', label: 'curl / Python / Java' },
              { value: 'browser', label: 'Browser' },
            ]}
          />
        </>
      }
    >
      <div className="ct">
        <div className="ct-chain" role="group" aria-label="Certificates in the chain; select one for details">
          {CERTS.map((c, i) => (
            <div key={c.id} className="ct-slot">
              {i > 0 && (
                <div className="ct-sign" aria-hidden="true">
                  <span>signs ↓</span>
                </div>
              )}
              <button
                type="button"
                className={`ct-cert ct-${c.id}${c.id === 'inter' && interMissing ? ' is-missing' : ''}`}
                aria-pressed={sel === c.id}
                onClick={() => setSel(c.id)}
              >
                <span className="ct-kind">{c.kind}</span>
                <span className="ct-subject">{c.subject}</span>
                <span className="ct-issuer">issued by {c.issuer}</span>
                {c.id === 'root' && <span className="dg-pill info">in trust store</span>}
                {c.id === 'inter' && interMissing && <span className="dg-pill bad">not sent</span>}
                {c.id !== 'root' && !(c.id === 'inter' && interMissing) && (
                  <span className="dg-pill muted">sent by server</span>
                )}
              </button>
            </div>
          ))}
        </div>
        <div className="ct-side">
          <div className="dg-card dg-detail">
            <strong>{cert.kind}</strong>
            <div>{cert.lives}</div>
            <dl>
              {cert.fields.map(([k, v]) => (
                <div key={k} style={{ display: 'contents' }}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <ol className="ct-checks" key={run} aria-label="Verification steps, leaf upwards">
            {list.map((c, i) => (
              <li
                key={i}
                className={c.ok ? (c.warn ? 'is-warn' : 'is-ok') : 'is-bad'}
                style={{ animationDelay: `${i * 0.35}s` }}
              >
                <span aria-hidden="true">{c.ok ? (c.warn ? '!' : '✓') : '✗'}</span> {c.label}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </DiagramFrame>
  );
}
