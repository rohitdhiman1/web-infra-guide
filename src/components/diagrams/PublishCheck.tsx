import { useState } from 'react';
import DiagramFrame from './DiagramFrame';
import { Switch, ToggleGroup } from './shared';

type Publish = 'all' | 'local' | 'none';
type From = 'host' | 'container' | 'lan' | 'internet';

const PUBLISH: Record<Publish, string> = {
  all: '-p 8080:80',
  local: '-p 127.0.0.1:8080:80',
  none: 'no -p',
};
const FROM: Record<From, string> = {
  host: 'The host itself',
  container: 'Another container (same network)',
  lan: 'A machine on the LAN',
  internet: 'The internet',
};

function reach(p: Publish, f: From, ufw: boolean, sg: boolean) {
  if (f === 'container') return { ok: true, how: 'directly to 172.17.0.2:80 over the bridge. Containers on the same network never need -p.' };
  if (p === 'none') return { ok: false, how: f === 'host' ? 'nothing listens on the host’s port 8080. (The host could still reach 172.17.0.2:80 directly.)' : 'nothing is published, so there is nothing to reach on the host.' };
  if (p === 'local') return { ok: f === 'host', how: f === 'host' ? 'through 127.0.0.1:8080: only the host itself can use it. Put a reverse proxy in front to expose it on purpose.' : 'the port is bound to 127.0.0.1 only, so it isn’t reachable from other machines.' };
  if (f === 'host') return { ok: true, how: 'through localhost:8080 or 10.0.1.25:8080.' };
  if (f === 'internet' && sg) return { ok: false, how: 'the cloud security group drops it before it reaches the host: that firewall sits outside the machine, so Docker can’t bypass it.' };
  if (ufw) return { ok: true, how: 'ufw’s “deny 8080” is a rule in the INPUT chain, for traffic to the host itself. But Docker’s DNAT rewrites the packet first, in PREROUTING, so it is forwarded to the container through the FORWARD chain, where Docker’s rules come first, and never touches INPUT. The port is open even though ufw says “deny”.', surprise: true };
  return { ok: true, how: 'through the DNAT rule on the host’s port 8080.' };
}

export default function PublishCheck() {
  const [p, setP] = useState<Publish>('all');
  const [f, setF] = useState<From>('internet');
  const [ufw, setUfw] = useState(true);
  const [sg, setSg] = useState(false);
  const r = reach(p, f, ufw, sg);

  return (
    <DiagramFrame
      title="Who can reach a published port?"
      subtitle={`docker run ${PUBLISH[p]} nginx`}
      status={
        <>
          <span className={`dg-pill ${r.ok ? (('surprise' in r && r.surprise) ? 'warn' : 'ok') : 'bad'}`}>{r.ok ? 'reachable' : 'not reachable'}</span>{' '}
          <strong>{FROM[f]}</strong> {r.ok ? 'can reach it' : 'can’t reach it'}: {r.how}
          {'surprise' in r && r.surprise && (
            <>
              {' '}To filter it, add rules to the <code>DOCKER-USER</code> chain, or publish on 127.0.0.1.
            </>
          )}
        </>
      }
      controls={
        <>
          <ToggleGroup label="How the port is published" value={p} onChange={setP} options={(Object.keys(PUBLISH) as Publish[]).map((k) => ({ value: k, label: PUBLISH[k] }))} />
          <ToggleGroup label="Who connects" value={f} onChange={setF} options={(Object.keys(FROM) as From[]).map((k) => ({ value: k, label: FROM[k] }))} />
          <div className="dg-toggle">
            <span className="dg-label">Firewalls</span>
            <div className="dg-btn-group">
              <Switch checked={ufw} onChange={setUfw}>
                ufw: deny 8080 on the host
              </Switch>
              <Switch checked={sg} onChange={setSg}>
                Cloud security group blocks 8080
              </Switch>
            </div>
          </div>
        </>
      }
    >
      <div className={`pub ${r.ok ? 'is-ok' : 'is-bad'}`} aria-hidden="true">
        <span className="pub-end">{FROM[f]}</span>
        <span className="pub-arrow">{r.ok ? '→' : '✕'}</span>
        <span className="pub-end">
          {f === 'container' ? '172.17.0.2:80' : p === 'local' ? '127.0.0.1:8080' : p === 'all' ? '0.0.0.0:8080' : 'host :8080 (nothing)'}
        </span>
      </div>
    </DiagramFrame>
  );
}
