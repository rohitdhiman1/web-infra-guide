import { useState, type ReactNode } from 'react';
import DiagramFrame from './DiagramFrame';
import { Switch, ToggleGroup } from './shared';

type LayerId = 'eth' | 'ip' | 'tcp' | 'tls' | 'http';
type Model = 'osi' | 'tcpip';

interface Layer {
  id: LayerId;
  name: string;
  role: string;
  /** What the envelope carries in the packet strip. */
  header: string;
  /** How much each layer adds to the packet. */
  bytes: string;
  /** Its number in the OSI model, and its layer in the TCP/IP model. */
  osi: string;
  tcpip: { num: number; name: string };
  does: ReactNode;
  tool: ReactNode;
  fails: ReactNode;
  signature: string;
}

// Outermost first, as the envelopes nest.
const LAYERS: Layer[] = [
  {
    id: 'eth',
    name: 'Ethernet',
    role: 'link (one hop)',
    header: 'dst MAC 02:42:ac:11:00:02 · type IPv4',
    bytes: '14-byte header and a 4-byte checksum (Wi-Fi uses its own frame)',
    osi: '2',
    tcpip: { num: 1, name: 'link' },
    does: (
      <>
        Carries the frame across one local network to the next device: your router, a switch, a container bridge. Routers replace this envelope at
        every hop; the IP envelope inside travels end to end.
      </>
    ),
    tool: (
      <>
        <code>ip link</code>, <code>ip neigh</code>, <code>tcpdump -e</code>
      </>
    ),
    fails: <>The link is down, the host is on the wrong VLAN, or ARP can't find the MAC address of the next hop.</>,
    signature: 'Destination Host Unreachable · NO-CARRIER',
  },
  {
    id: 'ip',
    name: 'IP',
    role: 'routing packets',
    header: 'src 10.0.0.5 → dst 203.0.113.10',
    bytes: '20-byte header (IPv6: 40)',
    osi: '3',
    tcpip: { num: 2, name: 'internet' },
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
    bytes: '20 to 60-byte header (UDP: 8)',
    osi: '4',
    tcpip: { num: 3, name: 'transport' },
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
    bytes: '5-byte record header and 17 bytes at the end of each record',
    osi: '5–6',
    tcpip: { num: 4, name: 'application' },
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
    bytes: 'text headers, often a few hundred bytes',
    osi: '7',
    tcpip: { num: 4, name: 'application' },
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

interface ModelRow {
  num: string;
  name: string;
  /** What fills this layer on a real HTTPS request. */
  what: string;
  /** The envelopes that do this layer's work; empty when nothing on the wire belongs to it. */
  layers: LayerId[];
  /** True when the layer adds no header of its own. */
  noHeader?: boolean;
}

const MODELS: Record<Model, { caption: ReactNode; rows: ModelRow[] }> = {
  osi: {
    caption: (
      <>
        <strong>OSI: 7 layers on paper.</strong> Only 2, 3, 4 and 7 have a protocol of their own on the wire. TLS does most of the work of 5 and 6,
        and layer 1 is the signal itself.
      </>
    ),
    rows: [
      { num: '7', name: 'Application', what: 'HTTP', layers: ['http'] },
      { num: '6', name: 'Presentation', what: 'TLS encryption; gzip and JSON inside HTTP', layers: ['tls'], noHeader: true },
      { num: '5', name: 'Session', what: 'TLS session resumption; cookies and HTTP/2 streams', layers: ['tls'], noHeader: true },
      { num: '4', name: 'Transport', what: 'TCP or UDP', layers: ['tcp'] },
      { num: '3', name: 'Network', what: 'IP', layers: ['ip'] },
      { num: '2', name: 'Data link', what: 'Ethernet or Wi-Fi', layers: ['eth'] },
      { num: '1', name: 'Physical', what: 'the signal on copper, fibre or radio', layers: [], noHeader: true },
    ],
  },
  tcpip: {
    caption: (
      <>
        <strong>TCP/IP: 4 layers, the model the internet runs</strong> (RFC 1122). TLS has no layer of its own here; it sits at the bottom of the
        application layer.
      </>
    ),
    rows: [
      { num: '4', name: 'Application', what: 'HTTP, carried inside TLS', layers: ['http', 'tls'] },
      { num: '3', name: 'Transport', what: 'TCP or UDP', layers: ['tcp'] },
      { num: '2', name: 'Internet', what: 'IP', layers: ['ip'] },
      { num: '1', name: 'Link', what: 'Ethernet or Wi-Fi, and the signal itself', layers: ['eth'] },
    ],
  },
};

export default function LayerModel() {
  const [sel, setSel] = useState<LayerId>('tcp');
  const [broken, setBroken] = useState(false);
  const [model, setModel] = useState<Model>('osi');
  const layer = LAYERS.find((l) => l.id === sel)!;
  const selIndex = LAYERS.indexOf(layer);
  const num = (l: Layer) => (model === 'osi' ? l.osi : String(l.tcpip.num));

  // Render the envelopes recursively: Ethernet contains IP contains TCP contains TLS contains HTTP.
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
      subtitle="5 envelopes on the wire, the tool for each, how each fails"
      status={
        <div className="dg-detail">
          <div>
            <strong>
              {layer.name} · {layer.role}.
            </strong>{' '}
            {layer.does}
          </div>
          <dl>
            <dt>Layer</dt>
            <dd>
              OSI layer {layer.osi} · TCP/IP {layer.tcpip.name} layer
            </dd>
            <dt>Adds</dt>
            <dd>{layer.bytes}</dd>
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
      controls={
        <>
          <ToggleGroup
            label="Numbering"
            value={model}
            onChange={setModel}
            options={[
              { value: 'osi', label: 'OSI (7 layers)' },
              { value: 'tcpip', label: 'TCP/IP (4 layers)' },
            ]}
          />
          <Switch checked={broken} onChange={setBroken}>
            Damage this envelope
          </Switch>
        </>
      }
    >
      <div className="lm">
        <div className="lm-layers" role="group" aria-label="Choose a layer">
          {[...LAYERS].reverse().map((l) => (
            <button
              key={l.id}
              type="button"
              className={`dg-btn lm-btn lm-${l.id}`}
              aria-pressed={sel === l.id}
              onClick={() => setSel(l.id)}
            >
              <span className="lm-num">{num(l)}</span>
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
        <div className="lm-model">
          <div className="lm-model-caption">{MODELS[model].caption}</div>
          <ol className="lm-model-rows">
            {MODELS[model].rows.map((r) => {
              const lit = r.layers.includes(sel);
              const tint = r.layers[0];
              return (
                <li
                  key={r.num}
                  className={['lm-row', tint && `lm-${tint}`, r.noHeader && 'is-virtual', lit && 'is-lit'].filter(Boolean).join(' ')}
                >
                  <span className="lm-row-num">{r.num}</span>
                  <span className="lm-row-name">{r.name}</span>
                  <span className="lm-row-what">
                    {r.what}
                    {r.noHeader && <span className="dg-pill muted">no header of its own</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </DiagramFrame>
  );
}
