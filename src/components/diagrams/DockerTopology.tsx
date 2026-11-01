import { useState, type ReactNode } from 'react';
import DiagramFrame from './DiagramFrame';

type Part = 'eth0' | 'docker0' | 'vethA' | 'vethB' | 'ctrA' | 'ctrB' | 'nat';

const INFO: Record<Part, { title: string; cmd: string; out: string; text: ReactNode }> = {
  eth0: {
    title: 'Host eth0',
    cmd: 'ip -brief addr show eth0',
    out: 'eth0  UP  10.0.1.25/24',
    text: <>The host's real network interface, and its default route out. Everything leaving the containers for the outside world goes out here, with its source rewritten to 10.0.1.25.</>,
  },
  docker0: {
    title: 'docker0 bridge',
    cmd: 'ip -brief addr show docker0; bridge link',
    out: 'docker0  UP  172.17.0.1/16\n7: veth3a1f@if6: master docker0 state forwarding\n9: veth9c2e@if8: master docker0 state forwarding',
    text: <>A virtual switch. The host ends of every container's cable plug into it, and its own address, 172.17.0.1, is every container's default gateway.</>,
  },
  vethA: {
    title: 'veth3a1f (host end)',
    cmd: 'ip -brief link | grep veth',
    out: 'veth3a1f@if6  UP\nveth9c2e@if8  UP',
    text: <>The host end of web's virtual cable. <code>@if6</code> is the interface index of the other end, eth0 inside web. It has no IP address: it's just a port on the switch.</>,
  },
  vethB: {
    title: 'veth9c2e (host end)',
    cmd: 'ip -brief link | grep veth',
    out: 'veth3a1f@if6  UP\nveth9c2e@if8  UP',
    text: <>The host end of db's cable, plugged into the same bridge, which is why web and db reach each other directly with no NAT.</>,
  },
  ctrA: {
    title: 'Container web',
    cmd: 'nsenter -t $(docker inspect -f {{.State.Pid}} web) -n ip route',
    out: 'default via 172.17.0.1 dev eth0\n172.17.0.0/16 dev eth0 scope link src 172.17.0.2',
    text: <>web's own network namespace: an eth0 with 172.17.0.2, and a routing table that sends everything outside its subnet to the bridge.</>,
  },
  ctrB: {
    title: 'Container db',
    cmd: 'nsenter -t $(docker inspect -f {{.State.Pid}} db) -n ss -ltn',
    out: 'State   Local Address:Port\nLISTEN  0.0.0.0:5432',
    text: <>db listens on 0.0.0.0:5432 in its own namespace. It wasn't published with <code>-p</code>, so only containers on this network can reach it.</>,
  },
  nat: {
    title: 'iptables nat rules',
    cmd: 'iptables -t nat -S | grep -E "MASQUERADE|DNAT"',
    out: '-A POSTROUTING -s 172.17.0.0/16 ! -o docker0 -j MASQUERADE\n-A DOCKER ! -i docker0 -p tcp --dport 8080 -j DNAT --to-destination 172.17.0.2:80',
    text: <>The two rules that connect the private network to the world. MASQUERADE rewrites sources on the way out; DNAT (from <code>-p 8080:80</code>) rewrites destinations on the way in.</>,
  },
};

export default function DockerTopology() {
  const [sel, setSel] = useState<Part>('docker0');
  const i = INFO[sel];
  const btn = (p: Part, cls: string, children: ReactNode) => (
    <button type="button" className={`topo-node ${cls}`} aria-pressed={sel === p} onClick={() => setSel(p)}>
      {children}
    </button>
  );

  return (
    <DiagramFrame
      title="One Docker host, taken apart"
      subtitle="click any part"
      status={
        <div className="dg-detail">
          <div>
            <strong>{i.title}.</strong> {i.text}
          </div>
          <pre className="dg-code tl-wire" tabIndex={0} aria-label={`Output of ${i.cmd}`}>
            <code>{`$ ${i.cmd}\n${i.out}`}</code>
          </pre>
        </div>
      }
    >
      <div className="topo">
        <div className="topo-outside">Internet / LAN</div>
        <div className="topo-wire" aria-hidden="true" />
        <div className="topo-host">
          <span className="topo-host-label">Host 10.0.1.25 (root network namespace)</span>
          <div className="topo-row">
            {btn('eth0', 'is-nic', <><strong>eth0</strong><small>10.0.1.25</small></>)}
            {btn('nat', 'is-nat', <><strong>iptables</strong><small>MASQUERADE · DNAT</small></>)}
          </div>
          <div className="topo-row">{btn('docker0', 'is-bridge', <><strong>docker0</strong><small>bridge · 172.17.0.1</small></>)}</div>
          <div className="topo-row">
            {btn('vethA', 'is-veth', <><strong>veth3a1f</strong><small>host end</small></>)}
            {btn('vethB', 'is-veth', <><strong>veth9c2e</strong><small>host end</small></>)}
          </div>
          <div className="topo-row topo-ctrs">
            {btn('ctrA', 'is-ctr', <><strong>web</strong><small>eth0 · 172.17.0.2</small><small>own namespace</small></>)}
            {btn('ctrB', 'is-ctr', <><strong>db</strong><small>eth0 · 172.17.0.3</small><small>own namespace</small></>)}
          </div>
        </div>
      </div>
    </DiagramFrame>
  );
}
