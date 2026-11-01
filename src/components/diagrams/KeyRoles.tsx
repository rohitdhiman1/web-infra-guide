import { useState } from 'react';
import DiagramFrame from './DiagramFrame';
import { ToggleGroup } from './shared';

type Use = 'encrypt' | 'sign';

const USES: Record<Use, { goal: string; steps: { who: string; key: 'public' | 'private'; action: string }[]; why: string; examples: string }> = {
  encrypt: {
    goal: 'Send Bob something only Bob can read',
    steps: [
      { who: 'Alice', key: 'public', action: 'encrypts with Bob’s PUBLIC key (anyone can get it)' },
      { who: 'Bob', key: 'private', action: 'decrypts with his PRIVATE key (only he has it)' },
    ],
    why: 'Anyone can lock the box with the public key, but only the private key opens it. In practice this protects a small symmetric key, not the message itself: asymmetric encryption is slow and can only handle a few hundred bytes.',
    examples: 'Wrapping a data key (hybrid encryption), RSA key exchange in old TLS 1.2, PGP and age file encryption, JWE tokens',
  },
  sign: {
    goal: 'Prove a message really came from Alice, unchanged',
    steps: [
      { who: 'Alice', key: 'private', action: 'signs with her PRIVATE key (only she can)' },
      { who: 'Bob (or anyone)', key: 'public', action: 'verifies with Alice’s PUBLIC key' },
    ],
    why: 'Only the private key can produce the signature, and anyone with the public key can check it. Nothing is hidden: the message stays readable. Unlike a shared-secret MAC, the verifier can’t forge signatures, so it proves origin to third parties too.',
    examples: 'Certificates (a CA signs your public key), the TLS CertificateVerify message, JWT RS256/ES256, SSH host and user keys, signed packages and container images',
  },
};

export default function KeyRoles() {
  const [u, setU] = useState<Use>('encrypt');
  const x = USES[u];
  return (
    <DiagramFrame
      title="Which key does what?"
      subtitle="the same key pair, used in opposite directions"
      status={
        <div className="dg-detail">
          <div>{x.why}</div>
          <div>
            <strong>Used for:</strong> {x.examples}.
          </div>
        </div>
      }
      controls={<ToggleGroup label="Goal" value={u} onChange={setU} options={[{ value: 'encrypt', label: 'Keep it secret (encrypt)' }, { value: 'sign', label: 'Prove who sent it (sign)' }]} />}
    >
      <div className="kr">
        <div className="kr-goal">{x.goal}</div>
        <ol className="kr-steps">
          {x.steps.map((s, i) => (
            <li key={i} className={`kr-step key-${s.key}`}>
              <span className="kr-icon" aria-hidden="true">{s.key === 'public' ? '🔓' : '🔐'}</span>
              <span>
                <strong>{s.who}</strong> {s.action}
              </span>
            </li>
          ))}
        </ol>
        <div className="kr-rule">
          Rule of thumb: <strong>encrypt to</strong> someone's public key; <strong>sign with</strong> your own private key.
        </div>
      </div>
    </DiagramFrame>
  );
}
