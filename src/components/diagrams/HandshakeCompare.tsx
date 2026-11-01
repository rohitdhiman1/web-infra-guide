import { useState, type ReactNode } from 'react';
import DiagramFrame from './DiagramFrame';
import Sequence, { type Message } from './Sequence';
import { StepControls, ToggleGroup, arrowKeys, useStepper } from './shared';

type Version = 'rsa' | 'ecdhe' | 'tls13';

interface Step {
  msg?: Message;
  rtt: number;
  text: ReactNode;
}

const STEPS: Record<Version, Step[]> = {
  rsa: [
    { rtt: 0, text: <>TLS 1.2 with <strong>RSA key exchange</strong>, common until the mid-2010s. The TCP handshake has already cost one round trip. Press Next.</> },
    { msg: { from: 'c', to: 's', label: 'ClientHello', sub: 'versions · cipher suites · random' }, rtt: 0.5, text: <>The client lists what it supports. Nothing is encrypted.</> },
    { msg: { from: 's', to: 'c', label: 'ServerHello · Certificate · Done', sub: 'cipher chosen · cert chain (in clear)' }, rtt: 1, text: <>The server picks a cipher suite and sends its certificate chain <strong>in plain text</strong>: anyone watching sees which site you're visiting. That's the end of round trip 1.</> },
    { msg: { from: 'c', to: 's', label: 'ClientKeyExchange · Finished', sub: 'premaster secret, encrypted with the server’s RSA key', tone: 'bad' }, rtt: 1.5, text: <>The client makes a random <strong>premaster secret</strong> and encrypts it with the RSA public key from the certificate. Both sides derive the session keys from it. The catch: anyone who later gets the server's private key can decrypt this message from a recording, and with it <strong>every recorded session</strong>. No forward secrecy.</> },
    { msg: { from: 's', to: 'c', label: 'ChangeCipherSpec · Finished', tone: 'enc' }, rtt: 2, text: <>The server confirms. Round trip 2 is complete.</> },
    { msg: { from: 'c', to: 's', label: 'Application data', sub: 'GET /orders/ord_1', tone: 'data' }, rtt: 2, text: <>Only now can the request go out: <strong>2 TLS round trips</strong> after the TCP handshake (3 in total). TLS 1.3 removed RSA key exchange entirely.</> },
  ],
  ecdhe: [
    { rtt: 0, text: <>TLS 1.2 with <strong>ECDHE</strong>: the modern way to run 1.2, and what most 1.2 connections use today. Press Next.</> },
    { msg: { from: 'c', to: 's', label: 'ClientHello', sub: 'versions · cipher suites · random' }, rtt: 0.5, text: <>The client lists what it supports. It doesn't send a key share yet: it doesn't know which group the server will pick.</> },
    { msg: { from: 's', to: 'c', label: 'ServerHello · Certificate · KeyExchange · Done', sub: 'ECDHE public key, signed by the cert’s key' }, rtt: 1, text: <>The server sends its certificate (still in clear) and a fresh, <strong>ephemeral</strong> ECDHE public key, signed with its certificate's private key to prove it's genuine. End of round trip 1.</> },
    { msg: { from: 'c', to: 's', label: 'ClientKeyExchange · Finished', sub: 'client’s ECDHE public key' }, rtt: 1.5, text: <>The client sends its own ephemeral public key. Both sides compute the same secret without ever sending it, and the ephemeral keys are thrown away afterwards: <strong>forward secrecy</strong> (<a href="/part-5-tls/#concept-5-3">5.3</a>). A stolen certificate key can't decrypt recordings.</> },
    { msg: { from: 's', to: 'c', label: 'ChangeCipherSpec · Finished', tone: 'enc' }, rtt: 2, text: <>The server confirms. Round trip 2.</> },
    { msg: { from: 'c', to: 's', label: 'Application data', sub: 'GET /orders/ord_1', tone: 'data' }, rtt: 2, text: <>Secure, but still <strong>2 TLS round trips</strong>, because the client had to wait to learn the server's choice before sending its key.</> },
  ],
  tls13: [
    { rtt: 0, text: <><strong>TLS 1.3</strong> (RFC 8446, 2018). It drops RSA key exchange and old ciphers, and it saves a whole round trip. Press Next.</> },
    { msg: { from: 'c', to: 's', label: 'ClientHello + key_share', sub: 'guesses X25519 and sends its public key now' }, rtt: 0.5, text: <>The trick: the client <strong>guesses</strong> the key-exchange group (almost always X25519, or hybrid post-quantum) and sends its ephemeral public key in the first message.</> },
    { msg: { from: 's', to: 'c', label: 'ServerHello + key_share · {Cert, Verify, Finished}', sub: 'everything after ServerHello is encrypted', tone: 'enc' }, rtt: 1, text: <>The server answers with its own key share, so both sides have the keys already. Everything after ServerHello is <strong>encrypted</strong>, including the certificate. If the guess was wrong, the server asks again (HelloRetryRequest), which costs one extra round trip but is rare.</> },
    { msg: { from: 'c', to: 's', label: '{Finished} + application data', sub: 'GET /orders/ord_1', tone: 'data' }, rtt: 1, text: <>The client finishes and sends the request <strong>in the same flight</strong>: <strong>1 TLS round trip</strong> (2 in total with TCP). With resumption and 0-RTT (<a href="/part-5-tls/#concept-5-7">5.7</a>), a returning client can even send data in the first flight.</> },
  ],
};

const FACTS: Record<Version, { rtt: number; fs: boolean; certHidden: boolean }> = {
  rsa: { rtt: 2, fs: false, certHidden: false },
  ecdhe: { rtt: 2, fs: true, certHidden: false },
  tls13: { rtt: 1, fs: true, certHidden: true },
};

export default function HandshakeCompare() {
  const [v, setV] = useState<Version>('ecdhe');
  const steps = STEPS[v];
  const stepper = useStepper(steps.length);
  const cur = steps[Math.min(stepper.step, steps.length - 1)];
  const f = FACTS[v];

  return (
    <DiagramFrame
      title="TLS 1.2 vs TLS 1.3"
      subtitle="the handshake, flight by flight"
      onKeyDown={arrowKeys(stepper.prev, stepper.next)}
      status={
        <div className="dg-detail">
          <div>{cur.text}</div>
          <div className="hc-facts">
            <span className="dg-pill info">{f.rtt} TLS round trip{f.rtt > 1 ? 's' : ''}</span>
            <span className={`dg-pill ${f.fs ? 'ok' : 'bad'}`}>{f.fs ? 'forward secrecy' : 'no forward secrecy'}</span>
            <span className={`dg-pill ${f.certHidden ? 'ok' : 'warn'}`}>{f.certHidden ? 'certificate encrypted' : 'certificate in clear'}</span>
          </div>
        </div>
      }
      controls={
        <>
          <ToggleGroup
            label="Protocol"
            value={v}
            onChange={(x) => {
              setV(x);
              stepper.reset();
            }}
            options={[
              { value: 'rsa', label: 'TLS 1.2, RSA key exchange' },
              { value: 'ecdhe', label: 'TLS 1.2, ECDHE' },
              { value: 'tls13', label: 'TLS 1.3' },
            ]}
          />
          <StepControls stepper={stepper} intro />
        </>
      }
    >
      <Sequence
        label={`Sequence diagram of the ${v === 'tls13' ? 'TLS 1.3' : 'TLS 1.2'} handshake`}
        actors={[
          { id: 'c', label: 'Client', sub: 'browser / Java app' },
          { id: 's', label: 'Server', sub: 'nginx :443' },
        ]}
        messages={steps.flatMap((s) => (s.msg ? [s.msg] : []))}
        shown={stepper.step}
        colWidth={240}
      />
    </DiagramFrame>
  );
}
