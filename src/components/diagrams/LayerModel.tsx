import { useState, type ReactNode } from 'react';
import DiagramFrame from './DiagramFrame';
import { Switch } from './shared';

type LayerId = 'http' | 'tls' | 'tcp' | 'ip';

interface Layer {
  id: LayerId;
  name: string;
  role: string;
  /** What the envelope carries in the packet strip. */
  header: string;
  does: ReactNode;
  tool: ReactNode;
  fails: ReactNode;
  signature: string;
}

// Outermost first, as the envelopes nest.
const LAYERS: Layer[] = [
  {
    id: 'ip',
    name: 'IP',
    role: 'routing packets',
    header: 'src 10.0.0.5 → dst 203.0.113.10',
    does: <>Carries each packet from one address to another, hop by hop across routers, NAT and firewalls.</>,
    tool: (
      <>
        <code>ping</code>, <code>mtr</code>, <code>ip route</code>
      </>
    ),
    fails: <>Packets are dropped or have no route: a security group, NACL, wrong subnet or packet loss.</>,
    signature: 'Connection timed out · Network is unreachable',
  },
  {
    id: 'tcp',
    name: 'TCP',
    role: 'transport',
    header: 'port 51514 → 443 · seq 1,201',
    does: <>Turns packets into a reliable, ordered byte stream between two ports, with retransmission and flow control.</>,
    tool: (
      <>
        <code>nc -vz</code>, <code>ss -tan</code>, <code>tcpdump</code>
      </>
    ),
    fails: <>Nothing listening on the port, a full backlog, or one side resetting the connection.</>,
    signature: 'Connection refused · Connection reset by peer',
  },
  {
    id: 'tls',
    name: 'TLS',
    role: 'security',
    header: 'TLS 1.3 record · encrypted',
    does: <>Encrypts the stream and proves the server's identity with a certificate chain.</>,
    tool: (
      <>
        <code>openssl s_client -connect host:443 -servername host</code>
      </>
    ),
    fails: <>An expired or untrusted certificate, a missing intermediate, a name not in the SAN, or a protocol mismatch.</>,
    signature: 'certificate verify failed · handshake failure',
  },
  {
    id: 'http',
    name: 'HTTP',
    role: 'application',
    header: 'GET /cart HTTP/1.1 · Host: shop.example.com',
    does: <>The request and response your app actually sees: method, path, headers, status code and body.</>,
    tool: (
      <>
        <code>curl -v</code>, browser DevTools, nginx and app logs
      </>
    ),
    fails: <>The connection is fine but the answer is wrong: a bad route, a crashed upstream, a slow app.</>,
    signature: '404 · 502 Bad Gateway · 504 Gateway Timeout',
  },
];

export default function LayerModel() {
  const [sel, setSel] = useState<LayerId>('tcp');
  const [broken, setBroken] = useState(false);
  const layer = LAYERS.find((l) => l.id === sel)!;
  const selIndex = LAYERS.indexOf(layer);

  // Render the envelopes recursively: IP contains TCP contains TLS contains HTTP.
  const envelope = (i: number): ReactNode => {
    if (i >= LAYERS.length) return null;
    const l = LAYERS[i];
    const isSel = l.id === sel;
    const cls = ['lm-env', `lm-${l.id}`, isSel && 'is-selected', isSel && broken && 'is-broken', i > selIndex && broken && 'is-unreachable']
      .filter(Boolean)
      .join(' ');
    return (
      <div className={cls}>
        <div className="lm-env-head">
          <span className="lm-env-name">{l.name}</span>
          <span className="lm-env-hdr">{l.header}</span>
        </div>
        {envelope(i + 1)}
      </div>
    );
  };

  return (
    <DiagramFrame
      title="The layer model"
      subtitle="4 layers, the tool for each, how each fails"
      status={
        <div className="dg-detail">
          <div>
            <strong>
              {layer.name} · {layer.role}.
            </strong>{' '}
            {layer.does}
          </div>
          <dl>
            <dt>First tool</dt>
            <dd>{layer.tool}</dd>
            <dt>How it fails</dt>
            <dd>{layer.fails}</dd>
            <dt>You see</dt>
            <dd>
              <span className={`dg-pill ${broken ? 'bad' : 'muted'}`}>{layer.signature}</span>
            </dd>
          </dl>
          {broken && selIndex < LAYERS.length - 1 && (
            <div className="lm-note">
              Everything inside the {layer.name} envelope never arrives, so {LAYERS.slice(selIndex + 1).map((l) => l.name).join(', ')} logs
              show nothing. Debug from the outside in.
            </div>
          )}
        </div>
      }
      controls={<Switch checked={broken} onChange={setBroken}>Damage this envelope</Switch>}
    >
      <div className="lm">
        <div className="lm-layers" role="group" aria-label="Choose a layer">
          {[...LAYERS].reverse().map((l, i) => (
            <button
              key={l.id}
              type="button"
              className={`dg-btn lm-btn lm-${l.id}`}
              aria-pressed={sel === l.id}
              onClick={() => setSel(l.id)}
            >
              <span className="lm-num">{4 - i}</span>
              <span className="lm-btn-text">
                <strong>{l.name}</strong>
                <span>{l.role}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="lm-packet" aria-hidden="true">
          <div className="lm-caption">One packet on the wire, as nested envelopes</div>
          {envelope(0)}
        </div>
      </div>
    </DiagramFrame>
  );
}
