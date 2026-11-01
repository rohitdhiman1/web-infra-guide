import { useState } from 'react';
import DiagramFrame from './DiagramFrame';

type Ns = 'pid' | 'uts' | 'net' | 'mnt' | 'user';

const NAMESPACES: { id: Ns; label: string; isolates: string }[] = [
  { id: 'pid', label: 'PID', isolates: 'process ids' },
  { id: 'uts', label: 'UTS', isolates: 'hostname' },
  { id: 'net', label: 'Network', isolates: 'interfaces, IPs, routes, ports' },
  { id: 'mnt', label: 'Mount', isolates: 'the filesystem tree' },
  { id: 'user', label: 'User', isolates: 'user and group ids' },
];

interface View {
  cmd: string;
  host: string;
  inside: string;
  explain: string;
}

function views(on: Record<Ns, boolean>): View[] {
  return [
    {
      cmd: 'ps -e | head -4',
      host: '  PID CMD\n    1 systemd\n  412 sshd\n  987 dockerd\n  …  (hundreds more)',
      inside: on.pid ? '  PID CMD\n    1 java -jar app.jar\n   42 ps' : '  PID CMD\n    1 systemd\n  412 sshd\n  987 dockerd\n  …  (the whole host)',
      explain: on.pid
        ? 'With a PID namespace, the app is PID 1 and sees only its own processes. On the host it has an ordinary PID, like 23817.'
        : 'Without a PID namespace, the process sees, and can signal, every process on the host.',
    },
    {
      cmd: 'hostname',
      host: 'build-vm-3',
      inside: on.uts ? 'a1b2c3d4e5f6' : 'build-vm-3',
      explain: on.uts ? 'Its own UTS namespace gives it its own hostname (Docker uses the container id).' : 'It shares the host’s hostname.',
    },
    {
      cmd: 'ip -brief addr',
      host: 'lo      127.0.0.1/8\neth0    10.0.1.25/24\ndocker0 172.17.0.1/16',
      inside: on.net ? 'lo      127.0.0.1/8\neth0    172.17.0.2/16' : 'lo      127.0.0.1/8\neth0    10.0.1.25/24\ndocker0 172.17.0.1/16',
      explain: on.net
        ? 'Its own network namespace: its own loopback, its own eth0 and IP, its own routing table, and its own ports, so two containers can both listen on :8080. C2 shows how it’s wired to the host.'
        : 'It uses the host’s network directly (Docker’s --network host): same IP, same ports, no isolation.',
    },
    {
      cmd: 'ls /',
      host: 'bin  boot  etc  home  opt  srv  usr  var …',
      inside: on.mnt ? 'app  bin  etc  lib  usr  (only what the image contains)' : 'bin  boot  etc  home  opt  srv  usr  var …',
      explain: on.mnt
        ? 'Its own mount namespace, with the image’s filesystem mounted as its root. It can’t see the host’s files unless you mount them in.'
        : 'It sees the host’s whole filesystem.',
    },
    {
      cmd: 'id',
      host: 'uid=1000(rohit)',
      inside: on.user ? 'uid=0(root)   …which is uid 100000 on the host' : 'uid=0(root)   …which is root on the host too',
      explain: on.user
        ? 'A user namespace maps root inside to an unprivileged id outside, so escaping the container doesn’t make you root. Docker doesn’t do this by default; rootless Docker and Podman do.'
        : 'Without a user namespace, root in the container is root on the host: one kernel bug away from owning the machine. Run as a non-root USER.',
    },
  ];
}

export default function NamespaceView() {
  const [on, setOn] = useState<Record<Ns, boolean>>({ pid: false, uts: false, net: false, mnt: false, user: false });
  const [sel, setSel] = useState(0);
  const list = views(on);
  const v = list[sel];
  const count = Object.values(on).filter(Boolean).length;
  const all = count === NAMESPACES.length;

  return (
    <DiagramFrame
      title="What a process sees"
      subtitle="switch namespaces on, one at a time"
      status={
        <>
          <strong>{v.cmd}:</strong> {v.explain}{' '}
          {count === 0
            ? 'With every namespace off, this is just a normal process on the host.'
            : all
              ? 'With all of them on (plus cgroups for limits), this is what Docker calls a container.'
              : `${count} of ${NAMESPACES.length} namespaces on.`}
        </>
      }
      controls={
        <div className="dg-toggle" role="group" aria-label="Namespaces">
          <span className="dg-label">Namespaces</span>
          <div className="dg-btn-group">
            {NAMESPACES.map((n) => (
              <button
                key={n.id}
                type="button"
                className="dg-btn dg-switch"
                aria-pressed={on[n.id]}
                onClick={() => setOn((o) => ({ ...o, [n.id]: !o[n.id] }))}
                title={`isolates ${n.isolates}`}
              >
                <span className="dg-switch-track" aria-hidden="true">
                  <span className="dg-switch-thumb" />
                </span>
                {n.label}
              </button>
            ))}
            <button
              type="button"
              className="dg-btn"
              onClick={() => setOn(all ? { pid: false, uts: false, net: false, mnt: false, user: false } : { pid: true, uts: true, net: true, mnt: true, user: true })}
            >
              {all ? 'All off' : 'All on'}
            </button>
          </div>
        </div>
      }
    >
      <div className="nsv">
        <div className="dg-btn-group nsv-cmds" role="group" aria-label="Command">
          {list.map((x, i) => (
            <button key={x.cmd} type="button" className="dg-btn" aria-pressed={sel === i} onClick={() => setSel(i)}>
              <code>{x.cmd}</code>
            </button>
          ))}
        </div>
        <div className="nsv-panes">
          <div className="nsv-pane">
            <div className="dg-label">On the host</div>
            <pre className="dg-code">
              <code>{`$ ${v.cmd}\n${v.host}`}</code>
            </pre>
          </div>
          <div className={`nsv-pane${v.inside !== v.host ? ' is-isolated' : ''}`}>
            <div className="dg-label">Inside the process</div>
            <pre className="dg-code">
              <code>{`$ ${v.cmd}\n${v.inside}`}</code>
            </pre>
          </div>
        </div>
      </div>
    </DiagramFrame>
  );
}
