import { useState, type ReactNode } from 'react';
import DiagramFrame from './DiagramFrame';
import { StepControls, ToggleGroup, arrowKeys, useStepper } from './shared';

type Scenario = 'inbound' | 'outbound' | 'peer' | 'trap';
type Where = 'outside' | 'eth0' | 'netfilter' | 'bridge' | 'veth' | 'container' | 'peer';

interface Step {
  at: Where;
  src: string;
  dst: string;
  /** Which address this step rewrote, if any. */
  changed?: 'src' | 'dst';
  /** Explains the rewrite, e.g. "reverse DNAT". */
  note?: string;
  bad?: boolean;
  text: ReactNode;
}

const PLACES: { id: Where; label: string; sub: string }[] = [
  { id: 'outside', label: 'Outside', sub: 'laptop / internet' },
  { id: 'eth0', label: 'Host eth0', sub: '10.0.1.25' },
  { id: 'netfilter', label: 'iptables', sub: 'nat + conntrack' },
  { id: 'bridge', label: 'Bridge', sub: 'docker0 172.17.0.1' },
  { id: 'veth', label: 'veth pair', sub: 'host end ↔ eth0' },
  { id: 'container', label: 'Container', sub: '172.17.0.2' },
];

const SCENARIOS: Record<Scenario, { label: string; steps: Step[] }> = {
  inbound: {
    label: 'Published port (-p 8080:80)',
    steps: [
      { at: 'outside', src: '203.0.113.9:51514', dst: '10.0.1.25:8080', text: <>Your laptop runs <code>curl http://10.0.1.25:8080</code>. It knows nothing about containers: it's talking to the host's IP and port 8080.</> },
      { at: 'eth0', src: '203.0.113.9:51514', dst: '10.0.1.25:8080', text: <>The packet arrives on the host's <code>eth0</code>. No process on the host is listening on 8080 (except possibly <code>docker-proxy</code>, a fallback), so the kernel's packet filter decides what happens.</> },
      { at: 'netfilter', src: '203.0.113.9:51514', dst: '172.17.0.2:80', changed: 'dst', text: <>In the <code>nat</code> table's PREROUTING chain, Docker's rule (<code>-p 8080:80</code>) does <strong>DNAT</strong>: the destination becomes <code>172.17.0.2:80</code>. <strong>conntrack</strong> records the translation so the reply can be reversed.</> },
      { at: 'bridge', src: '203.0.113.9:51514', dst: '172.17.0.2:80', text: <>The routing table says <code>172.17.0.0/16</code> lives on <code>docker0</code>, a virtual switch. The packet is forwarded there (the FORWARD chain must allow it; your own rules go in DOCKER-USER). An ARP lookup finds which port has 172.17.0.2.</> },
      { at: 'veth', src: '203.0.113.9:51514', dst: '172.17.0.2:80', text: <>The bridge sends it out of the host end of a <strong>veth pair</strong>, a virtual cable whose other end is the container's <code>eth0</code>, in another network namespace.</> },
      { at: 'container', src: '203.0.113.9:51514', dst: '172.17.0.2:80', text: <>The app, listening on <code>0.0.0.0:80</code> inside the container, accepts the connection. It sees the <strong>real client IP</strong>: DNAT changed only the destination.</> },
      { at: 'netfilter', src: '10.0.1.25:8080', dst: '203.0.113.9:51514', changed: 'src', note: 'source rewritten back (reverse DNAT)', text: <>The reply goes back out via the container's default gateway, 172.17.0.1, and the bridge. conntrack recognises the connection and <strong>reverses the DNAT</strong>: the source becomes <code>10.0.1.25:8080</code> again, so the laptop gets a reply from the address it called.</> },
      { at: 'outside', src: '10.0.1.25:8080', dst: '203.0.113.9:51514', text: <>The laptop receives the response. From the outside, port 8080 on the host simply works. Note: Docker inserts these rules ahead of ufw, so a published port is open <em>even if your host firewall says otherwise</em>. Publish on <code>127.0.0.1:8080:80</code> if it shouldn't be public.</> },
    ],
  },
  outbound: {
    label: 'Container calls the internet',
    steps: [
      { at: 'container', src: '172.17.0.2:40312', dst: '140.82.112.5:443', text: <>The app calls <code>https://api.github.com</code> (140.82.112.5). The source is the container's private IP. No router on the internet could send a reply to 172.17.0.2.</> },
      { at: 'veth', src: '172.17.0.2:40312', dst: '140.82.112.5:443', text: <>The container's routing table has one useful line, <code>default via 172.17.0.1</code>, so the packet leaves through <code>eth0</code>, which is its end of the veth pair.</> },
      { at: 'bridge', src: '172.17.0.2:40312', dst: '140.82.112.5:443', text: <>It arrives at <code>docker0</code>, the gateway. The host has IP forwarding switched on (<code>net.ipv4.ip_forward=1</code>, Docker sets it), so it routes the packet on towards its own default route via <code>eth0</code>.</> },
      { at: 'netfilter', src: '10.0.1.25:40312', dst: '140.82.112.5:443', changed: 'src', text: <>On the way out, the POSTROUTING <strong>MASQUERADE</strong> rule does <strong>source NAT</strong>: the source becomes the host's IP. conntrack remembers it (the port may change too, if 40312 is already taken on the host).</> },
      { at: 'outside', src: '10.0.1.25:40312', dst: '140.82.112.5:443', text: <>GitHub sees a connection from the host, 10.0.1.25. Behind a cloud NAT gateway it would be translated once more, to a public IP (<a href="/part-1-networking/#concept-1-11">1.11</a>).</> },
      { at: 'netfilter', src: '140.82.112.5:443', dst: '172.17.0.2:40312', changed: 'dst', note: 'destination rewritten back (reverse SNAT)', text: <>The reply comes back to 10.0.1.25:40312. conntrack finds the entry and <strong>reverses the SNAT</strong>: the destination becomes 172.17.0.2:40312, which is routed to docker0, the veth pair, and the app.</> },
    ],
  },
  peer: {
    label: 'Container to container',
    steps: [
      { at: 'container', src: '—', dst: 'db:5432', text: <>On a user-defined network (<code>docker network create shop</code>, or any Compose project), the <code>web</code> container connects to <code>db:5432</code> by name.</> },
      { at: 'container', src: '172.18.0.2', dst: '127.0.0.11:53', text: <>Its <code>/etc/resolv.conf</code> points at <code>127.0.0.11</code>, Docker's embedded DNS server, which answers <code>db → 172.18.0.3</code>. This only works on user-defined networks, not the default bridge.</> },
      { at: 'veth', src: '172.18.0.2:51900', dst: '172.18.0.3:5432', text: <>172.18.0.3 is on the same subnet, so there's no gateway and no NAT: the packet goes straight out of the veth pair onto the network's bridge, after an ARP for db's MAC address.</> },
      { at: 'bridge', src: '172.18.0.2:51900', dst: '172.18.0.3:5432', text: <>The bridge switches it to db's veth port, like a physical switch would. Addresses are never rewritten between containers on the same network.</> },
      { at: 'peer', src: '172.18.0.2:51900', dst: '172.18.0.3:5432', text: <>Postgres in <code>db</code> accepts it and sees the real source, 172.18.0.2. Nothing was published with <code>-p</code>: containers on the same network reach each other's ports directly.</> },
    ],
  },
  trap: {
    label: 'The 127.0.0.1 trap',
    steps: [
      { at: 'outside', src: '203.0.113.9:51514', dst: '10.0.1.25:8080', text: <>Same published port as before, but this time the app was started with <code>--host 127.0.0.1</code>, a default in some dev servers.</> },
      { at: 'netfilter', src: '203.0.113.9:51514', dst: '172.17.0.2:80', changed: 'dst', text: <>DNAT works exactly as before: destination 172.17.0.2:80.</> },
      { at: 'veth', src: '203.0.113.9:51514', dst: '172.17.0.2:80', text: <>The packet reaches the container's <code>eth0</code>, address 172.17.0.2.</> },
      { at: 'container', src: '203.0.113.9:51514', dst: '172.17.0.2:80', bad: true, text: <>But nothing listens on <strong>172.17.0.2</strong>:80. The app listens only on the container's own loopback, 127.0.0.1, which is a <em>different</em> interface inside the container. The kernel answers with a <strong>RST</strong>.</> },
      { at: 'outside', src: '10.0.1.25:8080', dst: '203.0.113.9:51514', bad: true, text: <>curl reports <code>Connection reset by peer</code> or <code>Empty reply from server</code>, while <code>docker exec … curl localhost</code> works fine. The fix: listen on <code>0.0.0.0</code> inside containers. <code>ss -ltn</code> inside the container shows which address it's really bound to.</> },
    ],
  },
};

export default function ContainerPacketPath() {
  const [sc, setSc] = useState<Scenario>('inbound');
  const steps = SCENARIOS[sc].steps;
  const stepper = useStepper(steps.length);
  const cur = steps[Math.min(stepper.step, steps.length - 1)];
  const places = sc === 'peer'
    ? [
        { id: 'container' as Where, label: 'web', sub: '172.18.0.2' },
        { id: 'veth' as Where, label: 'veth pair', sub: 'web ↔ bridge' },
        { id: 'bridge' as Where, label: 'Bridge', sub: 'br-shop 172.18.0.1' },
        { id: 'peer' as Where, label: 'db', sub: '172.18.0.3' },
      ]
    : PLACES;

  return (
    <DiagramFrame
      title="A packet’s path through Docker networking"
      subtitle={SCENARIOS[sc].label}
      onKeyDown={arrowKeys(stepper.prev, stepper.next)}
      status={cur.text}
      controls={
        <>
          <ToggleGroup
            label="Scenario"
            value={sc}
            onChange={(v) => {
              setSc(v);
              stepper.reset();
            }}
            options={(Object.keys(SCENARIOS) as Scenario[]).map((k) => ({ value: k, label: SCENARIOS[k].label }))}
          />
          <StepControls stepper={stepper} />
        </>
      }
    >
      <ol className="cpp-places" aria-label="Where the packet is">
        {places.map((p) => (
          <li key={p.id} className={`cpp-place${cur.at === p.id ? (cur.bad ? ' is-bad' : ' is-here') : ''}`}>
            <span className="cpp-place-label">{p.label}</span>
            <span className="cpp-place-sub">{p.sub}</span>
          </li>
        ))}
      </ol>
      <div className={`cpp-packet${cur.bad ? ' is-bad' : ''}`} aria-label={`Packet: from ${cur.src} to ${cur.dst}`}>
        <span className="dg-label">The packet now</span>
        <div className="cpp-addr">
          <span className={`cpp-field${cur.changed === 'src' ? ' is-changed' : ''}`}>
            <span className="cpp-k">src</span> <code>{cur.src}</code>
          </span>
          <span className="cpp-arrow" aria-hidden="true">→</span>
          <span className={`cpp-field${cur.changed === 'dst' ? ' is-changed' : ''}`}>
            <span className="cpp-k">dst</span> <code>{cur.dst}</code>
          </span>
        </div>
        {cur.changed && (
          <span className="cpp-note">
            {cur.note ?? (cur.changed === 'dst' ? 'destination rewritten (DNAT)' : 'source rewritten (SNAT)')}
          </span>
        )}
        {cur.bad && <span className="cpp-note is-bad">connection refused / reset</span>}
      </div>
    </DiagramFrame>
  );
}
