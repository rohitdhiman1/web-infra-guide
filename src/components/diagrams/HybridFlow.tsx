import { useState, type ReactNode } from 'react';
import DiagramFrame from './DiagramFrame';
import { StepControls, ToggleGroup, arrowKeys, useStepper } from './shared';

type Where = 'kms' | 'tls';

interface Step {
  asym: boolean;
  text: ReactNode;
  items: string[];
}

const FLOWS: Record<Where, { title: string; steps: Step[] }> = {
  kms: {
    title: 'Envelope encryption with a KMS: a guarded key protects a fast data key',
    steps: [
      { asym: false, items: [], text: <>An app needs to store a 2 GB backup encrypted at rest. Its master key lives inside a KMS (AWS KMS, Google Cloud KMS, Vault) and <strong>never leaves it</strong>. That master key is usually symmetric itself, kept in hardware: the pattern here is <em>a protected key guarding a fast data key</em>. Do the same with a recipient's <em>public</em> key instead of a KMS and you have classic hybrid encryption (PGP, age). Press Next.</> },
      { asym: false, items: ['🔑 data key (plain)', '📦 data key (wrapped)'], text: <>The app asks the KMS for a <strong>data key</strong>. It receives two copies: the key in plain form, and the same key <strong>wrapped</strong> (encrypted) under the master key.</> },
      { asym: false, items: ['🔑 data key (plain)', '📦 data key (wrapped)', '🔒 2 GB backup (AES-GCM)'], text: <>The app encrypts the 2 GB locally with <strong>AES-256-GCM</strong> using the plain data key. Fast, symmetric, no network calls per byte.</> },
      { asym: false, items: ['📦 data key (wrapped)', '🔒 2 GB backup (AES-GCM)'], text: <>It <strong>throws away the plain data key</strong> and stores the wrapped key next to the ciphertext. The stored object is useless without the KMS.</> },
      { asym: false, items: ['🔑 data key (plain)', '🔓 2 GB backup'], text: <>To read it later, the app sends only the small wrapped key to the KMS, which unwraps it if <strong>IAM policy allows</strong>, and decrypts locally. Access is controlled, and audited, by who may call the KMS. Rotation means re-wrapping small keys, not re-encrypting terabytes.</> },
    ],
  },
  tls: {
    title: 'TLS: asymmetric to agree on a key and prove identity, symmetric for the data',
    steps: [
      { asym: false, items: [], text: <>A browser connects to <code>shop.example.com</code>. The pattern is the same as envelope encryption: expensive asymmetric work once, cheap symmetric work for every byte. Press Next.</> },
      { asym: true, items: ['🤝 X25519 key shares'], text: <>Client and server exchange <strong>ephemeral Diffie-Hellman</strong> key shares and both derive the same secret, as in the paint diagram above. Asymmetric, once per connection.</> },
      { asym: true, items: ['🤝 X25519 key shares', '📜 certificate + signature'], text: <>The server proves who it is: it <strong>signs</strong> the handshake with its certificate's private key (ECDSA or RSA), and the client verifies the signature with the public key in the certificate. Asymmetric, once per connection.</> },
      { asym: false, items: ['🔑 session keys (AES-GCM)'], text: <>Both sides derive <strong>symmetric session keys</strong> from the shared secret, and the ephemeral private keys are thrown away (forward secrecy).</> },
      { asym: false, items: ['🔑 session keys (AES-GCM)', '🔒 every request and response'], text: <>Every byte from here on is encrypted with <strong>AES-GCM or ChaCha20</strong>: symmetric, at gigabytes per second. Megabytes of traffic, and the asymmetric maths ran only twice.</> },
    ],
  },
};

export default function HybridFlow() {
  const [w, setW] = useState<Where>('tls');
  const flow = FLOWS[w];
  const stepper = useStepper(flow.steps.length);
  const cur = flow.steps[Math.min(stepper.step, flow.steps.length - 1)];
  return (
    <DiagramFrame
      title="Two keys, two jobs"
      subtitle={flow.title}
      onKeyDown={arrowKeys(stepper.prev, stepper.next)}
      status={cur.text}
      controls={
        <>
          <ToggleGroup
            label="Where"
            value={w}
            onChange={(x) => {
              setW(x);
              stepper.reset();
            }}
            options={[
              { value: 'tls', label: 'TLS connection' },
              { value: 'kms', label: 'Encryption at rest (KMS)' },
            ]}
          />
          <StepControls stepper={stepper} intro />
        </>
      }
    >
      <div className="hf">
        <div className={`hf-mode ${stepper.step === 0 ? '' : cur.asym ? 'is-asym' : 'is-sym'}`}>
          {stepper.step === 0 ? 'Ready' : cur.asym ? 'Asymmetric step (slow, done once)' : 'Symmetric step (fast, for the data)'}
        </div>
        <ul className="hf-items" aria-label="What exists at this step">
          {cur.items.length === 0 ? <li className="hf-empty">nothing yet</li> : cur.items.map((i) => <li key={i}>{i}</li>)}
        </ul>
      </div>
    </DiagramFrame>
  );
}
