import { useState, type ReactNode } from 'react';
import DiagramFrame from './DiagramFrame';
import { ToggleGroup } from './shared';

type Era = 'shared' | 'servers' | 'vms' | 'containers';

interface App {
  name: string;
  deps: string[];
}

// The same three apps in every era. payments and orders want different Javas; payments and search want different OpenSSLs.
const APPS: App[] = [
  { name: 'orders', deps: ['Java 21', 'OpenSSL 3.0'] },
  { name: 'payments', deps: ['Java 17', 'OpenSSL 1.1'] },
  { name: 'search', deps: ['Python 3.12', 'OpenSSL 3.0'] },
];

interface Fact {
  label: string;
  value: string;
  tone: 'ok' | 'warn' | 'bad';
}

const ERAS: Record<Era, { label: string; text: ReactNode; facts: Fact[] }> = {
  shared: {
    label: 'Shared server',
    text: (
      <>
        Three apps on one server someone set up by hand. orders wants Java 21 and payments wants Java 17; payments wants OpenSSL 1.1 and the others
        want 3.0. A server has one system default of each, so <strong>upgrading one app breaks another</strong>. Deploys change the live machine, and
        after a few years nobody can rebuild it: a “snowflake” server.
      </>
    ),
    facts: [
      { label: 'Machines', value: '1', tone: 'ok' },
      { label: 'Kernels running', value: '1', tone: 'ok' },
      { label: 'Version conflicts', value: 'Yes: Java and OpenSSL', tone: 'bad' },
      { label: 'Same environment everywhere', value: 'No: set up by hand', tone: 'bad' },
      { label: 'Add another copy', value: 'Install it on a live server', tone: 'bad' },
      { label: 'Isolation between apps', value: 'None', tone: 'bad' },
    ],
  },
  servers: {
    label: 'Server per app',
    text: (
      <>
        Give each app its own server and the conflicts go away. Now there are <strong>three mostly idle machines</strong>, three operating systems to
        patch, and more capacity means ordering hardware. The environments still drift, because each server is still set up by hand.
      </>
    ),
    facts: [
      { label: 'Machines', value: '3, each mostly idle', tone: 'bad' },
      { label: 'Kernels running', value: '3', tone: 'warn' },
      { label: 'Version conflicts', value: 'None', tone: 'ok' },
      { label: 'Same environment everywhere', value: 'No: set up by hand', tone: 'bad' },
      { label: 'Add another copy', value: 'Order and set up a server: days', tone: 'bad' },
      { label: 'Isolation between apps', value: 'Separate hardware', tone: 'ok' },
    ],
  },
  vms: {
    label: 'VM per app',
    text: (
      <>
        A hypervisor splits one machine into three virtual ones. No conflicts, strong isolation, and a VM image can be rebuilt. But{' '}
        <strong>every app carries a whole operating system</strong>: its own kernel in memory, gigabytes of disk, and a boot that takes tens of
        seconds.
      </>
    ),
    facts: [
      { label: 'Machines', value: '1', tone: 'ok' },
      { label: 'Kernels running', value: '4: the host’s and one per VM', tone: 'warn' },
      { label: 'Version conflicts', value: 'None', tone: 'ok' },
      { label: 'Same environment everywhere', value: 'Yes, with heavy VM images', tone: 'warn' },
      { label: 'Add another copy', value: 'Boot a VM: tens of seconds', tone: 'warn' },
      { label: 'Isolation between apps', value: 'Strong: a hypervisor', tone: 'ok' },
    ],
  },
  containers: {
    label: 'Containers',
    text: (
      <>
        One kernel, shared. Each app ships as an <strong>image</strong> holding only its own runtime and libraries, so Java 17 and Java 21 sit side by
        side with no conflict. The image you tested is the one that runs, and a new copy is just a new process. The price: the isolation comes from
        kernel features, so it’s weaker than a VM’s (<a href="#concept-c1-10">C1.10</a>).
      </>
    ),
    facts: [
      { label: 'Machines', value: '1', tone: 'ok' },
      { label: 'Kernels running', value: '1, shared', tone: 'ok' },
      { label: 'Version conflicts', value: 'None: each image has its own', tone: 'ok' },
      { label: 'Same environment everywhere', value: 'Yes: the image is the artefact', tone: 'ok' },
      { label: 'Add another copy', value: 'Start a process: under a second', tone: 'ok' },
      { label: 'Isolation between apps', value: 'Good: kernel features, one kernel', tone: 'warn' },
    ],
  },
};

const ORDER: Era[] = ['shared', 'servers', 'vms', 'containers'];

/** A conflicting dependency on the shared server: another app needs a different version of it. */
const CONFLICTS = new Set(['Java 21', 'Java 17', 'OpenSSL 1.1', 'OpenSSL 3.0']);

const Block = ({ kind, children, bad }: { kind: string; children: ReactNode; bad?: boolean }) => (
  <div className={`de-block de-${kind}${bad ? ' is-bad' : ''}`}>{children}</div>
);

const Deps = ({ deps, shared }: { deps: string[]; shared?: boolean }) => (
  <div className="de-deps">
    {deps.map((d) => (
      <span key={d} className={`de-chip${shared && CONFLICTS.has(d) ? ' is-bad' : ''}`}>
        {d}
      </span>
    ))}
  </div>
);

const AppBox = ({ app }: { app: App }) => <Block kind="app">{app.name}</Block>;

/** One physical machine: contents on top, then its kernel, then the hardware at the bottom. */
const Machine = ({ children, kernel, label }: { children: ReactNode; kernel: string; label: string }) => (
  <div className="de-machine">
    <div className="de-top">{children}</div>
    <Block kind="kernel">{kernel}</Block>
    <Block kind="hw">{label}</Block>
  </div>
);

function Picture({ era }: { era: Era }) {
  if (era === 'shared') {
    const all = [...new Set(APPS.flatMap((a) => a.deps))];
    return (
      <div className="de-row">
        <Machine kernel="Linux kernel" label="1 physical server">
          <div className="de-apps">
            {APPS.map((a) => (
              <AppBox key={a.name} app={a} />
            ))}
          </div>
          <Block kind="libs" bad>
            <span className="de-sub">one set of system libraries</span>
            <Deps deps={all} shared />
          </Block>
          <Block kind="os">Ubuntu, set up by hand</Block>
        </Machine>
      </div>
    );
  }
  if (era === 'servers') {
    return (
      <div className="de-row is-three">
        {APPS.map((a) => (
          <Machine key={a.name} kernel="kernel" label="server, ~15% busy">
            <AppBox app={a} />
            <Block kind="libs">
              <Deps deps={a.deps} />
            </Block>
            <Block kind="os">OS</Block>
          </Machine>
        ))}
      </div>
    );
  }
  if (era === 'vms') {
    return (
      <div className="de-row">
        <Machine kernel="host kernel + hypervisor" label="1 physical server">
          <div className="de-guests">
            {APPS.map((a) => (
              <div key={a.name} className="de-guest">
                <span className="de-tag">VM</span>
                <AppBox app={a} />
                <Block kind="libs">
                  <Deps deps={a.deps} />
                </Block>
                <Block kind="os">guest OS</Block>
                <Block kind="kernel">guest kernel</Block>
              </div>
            ))}
          </div>
        </Machine>
      </div>
    );
  }
  return (
    <div className="de-row">
      <Machine kernel="one Linux kernel, shared" label="1 physical server">
        <div className="de-guests">
          {APPS.map((a) => (
            <div key={a.name} className="de-ctr">
              <span className="de-tag">container · image</span>
              <AppBox app={a} />
              <Block kind="libs">
                <Deps deps={a.deps} />
              </Block>
            </div>
          ))}
        </div>
        <Block kind="runtime">container runtime: containerd and runc</Block>
      </Machine>
    </div>
  );
}

export default function DeployEras() {
  const [era, setEra] = useState<Era>('shared');
  const e = ERAS[era];
  const step = (d: number) => setEra(ORDER[(ORDER.indexOf(era) + d + ORDER.length) % ORDER.length]);
  return (
    <DiagramFrame
      title="Four ways to run three apps"
      subtitle="orders, payments and search, with clashing versions of Java and OpenSSL"
      onKeyDown={(ev) => {
        if ((ev.target as HTMLElement).closest('a')) return;
        if (ev.key === 'ArrowRight') step(1);
        else if (ev.key === 'ArrowLeft') step(-1);
      }}
      status={e.text}
      controls={
        <ToggleGroup label="How it's deployed" value={era} onChange={setEra} options={ORDER.map((v) => ({ value: v, label: ERAS[v].label }))} />
      }
    >
      <div className="de">
        <Picture era={era} />
        <dl className="de-facts">
          {e.facts.map((f) => (
            <div key={f.label} className="de-fact">
              <dt>{f.label}</dt>
              <dd>
                <span className={`dg-pill ${f.tone}`}>{f.value}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </DiagramFrame>
  );
}
