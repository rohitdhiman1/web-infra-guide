import type { ReactNode } from 'react';
import DiagramFrame from './DiagramFrame';
import Sequence, { type Message, type Phase } from './Sequence';
import { StepControls, arrowKeys, useStepper } from './shared';

interface Step {
  msg?: Message;
  client: string;
  server: string;
  text: ReactNode;
}

const NONE = 'no keys';
const HS = 'handshake keys';
const APP = 'app keys';

const STEPS: Step[] = [
  {
    client: NONE,
    server: NONE,
    text: (
      <>
        The TCP connection to port 443 is open (that cost one round trip already). Neither side has any keys yet.
        Press Next to start the TLS 1.3 handshake.
      </>
    ),
  },
  {
    msg: { from: 'c', to: 's', label: 'ClientHello', sub: 'key_share · SNI · ALPN' },
    client: NONE,
    server: NONE,
    text: (
      <>
        <strong>ClientHello</strong>, in plain text: supported versions and cipher suites, a fresh ephemeral{' '}
        <strong>key share</strong> (X25519, or hybrid X25519 + ML-KEM) guessed in advance, the hostname as{' '}
        <strong>SNI</strong> (<code>www.example.com</code>) and the protocols it speaks via <strong>ALPN</strong> (
        <code>h2</code>, <code>http/1.1</code>).
      </>
    ),
  },
  {
    msg: { from: 's', to: 'c', label: 'ServerHello', sub: 'key_share · chosen cipher' },
    client: HS,
    server: HS,
    text: (
      <>
        <strong>ServerHello</strong> picks the cipher suite and sends the server's own key share. Both sides now run
        ECDHE and derive the same <strong>handshake keys</strong> without ever sending them. This is the last
        plain-text message.
      </>
    ),
  },
  {
    msg: { from: 's', to: 'c', label: 'EncryptedExtensions', sub: 'ALPN: h2', tone: 'enc' },
    client: HS,
    server: HS,
    text: (
      <>
        <strong>EncryptedExtensions</strong>, already encrypted: the rest of the server's choices, such as the ALPN
        result <code>h2</code>. Unlike TLS 1.2, an eavesdropper can't see these or the certificate that follows.
      </>
    ),
  },
  {
    msg: { from: 's', to: 'c', label: 'Certificate', sub: 'leaf + intermediates', tone: 'enc' },
    client: HS,
    server: HS,
    text: (
      <>
        <strong>Certificate</strong>: the leaf, then the intermediates (your <code>fullchain.pem</code>). The client
        walks the chain to a root in its trust store and checks that the SNI name is in the leaf's SAN list.
      </>
    ),
  },
  {
    msg: { from: 's', to: 'c', label: 'CertificateVerify', sub: 'signed with the private key', tone: 'enc' },
    client: HS,
    server: HS,
    text: (
      <>
        <strong>CertificateVerify</strong>: a signature over the whole handshake so far, made with the private key
        that never leaves the server. It proves the server owns the certificate, not just a copy of it.
      </>
    ),
  },
  {
    msg: { from: 's', to: 'c', label: 'Finished', sub: 'MAC over the handshake', tone: 'enc' },
    client: HS,
    server: APP,
    text: (
      <>
        Server <strong>Finished</strong>: a MAC over every handshake message, so any tampering is detected. The server
        derives the <strong>application keys</strong>.
      </>
    ),
  },
  {
    msg: { from: 'c', to: 's', label: 'Finished', sub: 'MAC over the handshake', tone: 'enc' },
    client: APP,
    server: APP,
    text: (
      <>
        Client <strong>Finished</strong>. The handshake is complete after <strong>one round trip</strong> (TLS 1.2
        needed two). The client can send its request right behind this message.
      </>
    ),
  },
  {
    msg: { from: 'c', to: 's', label: 'GET / (HTTP/2)', sub: 'application data', tone: 'data' },
    client: APP,
    server: APP,
    text: (
      <>
        Application data, encrypted with the application keys. On a returning visit, session resumption and 0-RTT
        could put this request into the very first flight (5.7).
      </>
    ),
  },
];

const PHASES: Phase[] = [
  { label: 'Plain text', start: 0, end: 1 },
  { label: 'Encrypted handshake', start: 2, end: 6 },
  { label: 'Application data', start: 7, end: 7 },
];

export default function Tls13Handshake() {
  const stepper = useStepper(STEPS.length);
  const cur = STEPS[stepper.step];
  const messages = STEPS.flatMap((s) => (s.msg ? [s.msg] : []));
  const counter =
    stepper.step === 0 ? 'Start' : stepper.step <= 7 ? `Message ${stepper.step} of 7` : 'Then: application data';

  return (
    <DiagramFrame
      title="TLS 1.3 handshake"
      subtitle="7 messages, 1 round trip"
      onKeyDown={arrowKeys(stepper.prev, stepper.next)}
      status={cur.text}
      controls={<StepControls stepper={stepper} counter={counter} />}
    >
      <Sequence
        label="Sequence diagram of the TLS 1.3 handshake between client and server, with each side's key state"
        actors={[
          { id: 'c', label: 'Client', sub: 'browser' },
          { id: 's', label: 'Server', sub: 'nginx :443' },
        ]}
        messages={messages}
        shown={stepper.step}
        states={{ c: cur.client, s: cur.server }}
        phases={PHASES}
        colWidth={200}
      />
      <div className="tls-legend" aria-hidden="true">
        <span className="tls-key plain">plain text</span>
        <span className="tls-key enc">encrypted</span>
        <span className="tls-key data">application data</span>
      </div>
    </DiagramFrame>
  );
}
