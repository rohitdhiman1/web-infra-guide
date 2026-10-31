import { useState, type ReactNode } from 'react';
import DiagramFrame from './DiagramFrame';
import Sequence, { type Message } from './Sequence';
import { StepControls, ToggleGroup, arrowKeys, useStepper } from './shared';

interface Step {
  msg?: Message;
  text: ReactNode;
}

const COLD: Step[] = [
  {
    text: (
      <>
        The browser needs an IP for <code>shop.example.com</code>. Its own cache and the OS cache are empty, and so is
        the recursive resolver's. Press Next to follow the lookup.
      </>
    ),
  },
  {
    msg: { from: 'stub', to: 'res', label: 'A? shop.example.com' },
    text: (
      <>
        <strong>1.</strong> The OS's stub resolver sends the question to the configured recursive resolver (from{' '}
        <code>/etc/resolv.conf</code> or DHCP). The stub only ever asks one server and waits for a final answer.
      </>
    ),
  },
  {
    msg: { from: 'res', to: 'root', label: 'A? shop.example.com' },
    text: (
      <>
        <strong>2.</strong> The resolver has nothing cached, so it starts at the top: a root server, whose addresses
        it knows from built-in root hints.
      </>
    ),
  },
  {
    msg: { from: 'root', to: 'res', label: 'Referral: ask .com', sub: 'NS a.gtld-servers.net', tone: 'muted' },
    text: (
      <>
        <strong>3.</strong> The root doesn't know the answer, but it knows who runs <code>.com</code>. It replies with
        a referral: the NS records for <code>com.</code> plus their IPs (glue).
      </>
    ),
  },
  {
    msg: { from: 'res', to: 'tld', label: 'A? shop.example.com' },
    text: (
      <>
        <strong>4.</strong> The resolver asks a <code>.com</code> TLD server the same question.
      </>
    ),
  },
  {
    msg: { from: 'tld', to: 'res', label: 'Referral: ask example.com', sub: 'NS ns1.example.com', tone: 'muted' },
    text: (
      <>
        <strong>5.</strong> The TLD server returns the NS records for <code>example.com</code>, the ones set at your
        registrar. These often carry a TTL of one to two days, which is why changing name servers is slow.
      </>
    ),
  },
  {
    msg: { from: 'res', to: 'auth', label: 'A? shop.example.com' },
    text: (
      <>
        <strong>6.</strong> The resolver asks the zone's authoritative server, the one that actually holds the
        records.
      </>
    ),
  },
  {
    msg: { from: 'auth', to: 'res', label: 'A 203.0.113.10', sub: 'TTL 300 · authoritative', tone: 'ok' },
    text: (
      <>
        <strong>7.</strong> The authoritative server answers with the A record and its TTL. If the name were a CNAME,
        the resolver would now chase the target name the same way.
      </>
    ),
  },
  {
    msg: { from: 'res', to: 'stub', label: '203.0.113.10', sub: 'cached for 300 s', tone: 'ok' },
    text: (
      <>
        <strong>8.</strong> The resolver returns the answer and caches every step for its TTL. The browser can now
        open a TCP connection to <code>203.0.113.10</code>. Switch to a warm cache to see the next lookup.
      </>
    ),
  },
];

const WARM: Step[] = [
  {
    text: (
      <>
        A minute later, someone else asks the same resolver for <code>shop.example.com</code>. Press Next.
      </>
    ),
  },
  {
    msg: { from: 'stub', to: 'res', label: 'A? shop.example.com' },
    text: (
      <>
        <strong>1.</strong> Same question to the resolver.
      </>
    ),
  },
  {
    msg: { from: 'res', to: 'stub', label: '203.0.113.10', sub: 'from cache · TTL 240 left', tone: 'ok' },
    text: (
      <>
        <strong>2.</strong> Answered straight from the cache, with the TTL counted down. No root, TLD or authoritative
        servers are involved. It's also why a DNS change can take up to the old TTL to reach everyone.
      </>
    ),
  },
];

export default function DnsResolution() {
  const [cache, setCache] = useState<'cold' | 'warm'>('cold');
  const steps = cache === 'cold' ? COLD : WARM;
  const stepper = useStepper(steps.length);
  const cur = steps[Math.min(stepper.step, steps.length - 1)];
  const messages = steps.flatMap((s) => (s.msg ? [s.msg] : []));

  return (
    <DiagramFrame
      title="DNS resolution"
      subtitle={cache === 'cold' ? '8 steps, cold cache' : '2 steps, warm cache'}
      onKeyDown={arrowKeys(stepper.prev, stepper.next)}
      status={cur.text}
      controls={
        <>
          <StepControls stepper={stepper} intro />
          <ToggleGroup
            label="Resolver cache"
            value={cache}
            onChange={(v) => {
              setCache(v);
              stepper.setStep(0);
            }}
            options={[
              { value: 'cold', label: 'Cold' },
              { value: 'warm', label: 'Warm' },
            ]}
          />
        </>
      }
    >
      <Sequence
        label="Sequence diagram of a DNS lookup from the browser through the recursive resolver to the root, TLD and authoritative servers"
        actors={[
          { id: 'stub', label: 'Browser', short: 'You', sub: 'stub resolver' },
          { id: 'res', label: 'Resolver', short: 'Resolv.', sub: 'recursive' },
          { id: 'root', label: 'Root', sub: '.' },
          { id: 'tld', label: 'TLD', sub: '.com' },
          { id: 'auth', label: 'Authoritative', short: 'Auth', sub: 'ns1.example.com' },
        ]}
        messages={messages}
        shown={Math.min(stepper.step, messages.length)}
        colWidth={112}
      />
    </DiagramFrame>
  );
}
