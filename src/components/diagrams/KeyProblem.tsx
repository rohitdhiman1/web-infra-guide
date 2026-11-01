import { useState, type ReactNode } from 'react';
import DiagramFrame from './DiagramFrame';
import { StepControls, ToggleGroup, arrowKeys, useStepper } from './shared';

interface Step {
  /** Where the message is drawn: 0 = Alice, 1 = the wire, 2 = Bob. */
  at: 0 | 1 | 2;
  payload: string;
  eveSees: string;
  bad?: boolean;
  text: ReactNode;
}

const STEPS: Step[] = [
  { at: 0, payload: '🔑 K', eveSees: '—', text: <>Alice and Bob want to talk privately over a network that <strong>Eve</strong> can read. With symmetric encryption they need the <strong>same secret key K</strong>. Alice has just generated it. Press Next.</> },
  { at: 1, payload: '🔑 K', eveSees: '🔑 K', bad: true, text: <>Alice has to get K to Bob somehow. If she sends it over the network, <strong>Eve copies it</strong>. Nothing protects it, because protecting it would need… a key they already share.</> },
  { at: 2, payload: '🔑 K', eveSees: '🔑 K', bad: true, text: <>Bob now has K, and so does Eve. From here on, every message encrypted with K is readable by Eve too.</> },
  { at: 0, payload: '“pay ord_1: €30”', eveSees: '🔑 K', text: <>Alice encrypts a message with AES and K. Encryption itself is fast and strong: AES-256 has never been broken in practice.</> },
  { at: 1, payload: '9f3a…c71e', eveSees: '9f3a…c71e  →  “pay ord_1: €30”', bad: true, text: <>On the wire it's ciphertext. But Eve holds K, so she decrypts it as easily as Bob. <strong>The cipher was never the weak point; the key exchange was.</strong> This is the <em>key distribution problem</em>.</> },
  { at: 2, payload: '“pay ord_1: €30”', eveSees: '“pay ord_1: €30”', bad: true, text: <>Bob reads the message, and so does Eve. Symmetric encryption alone needs the key to travel by some <strong>other, already-secure channel</strong>: in person, a courier, a pre-installed configuration. That doesn't scale to the internet, where you talk to servers you've never met.</> },
];

const SIZES = ['2', '10', '100', '1000'] as const;
type Size = (typeof SIZES)[number];

export default function KeyProblem() {
  const stepper = useStepper(STEPS.length);
  const cur = STEPS[stepper.step];
  const [n, setN] = useState<Size>('10');
  const people = Number(n);
  const pairs = (people * (people - 1)) / 2;

  return (
    <DiagramFrame
      title="The key distribution problem"
      subtitle="symmetric encryption needs a shared key, and the key has to travel"
      onKeyDown={arrowKeys(stepper.prev, stepper.next)}
      status={cur.text}
      controls={<StepControls stepper={stepper} intro />}
    >
      <div className="kp">
        <div className="kp-lane">
          {['Alice', 'Network', 'Bob'].map((who, i) => (
            <div key={who} className={`kp-spot${i === 1 ? ' is-wire' : ''}${cur.at === i ? ' is-here' : ''}`}>
              <span className="kp-who">{who}</span>
              {cur.at === i && <span className={`kp-payload${cur.bad && i === 1 ? ' is-bad' : ''}`}>{cur.payload}</span>}
            </div>
          ))}
        </div>
        <div className={`kp-eve${cur.eveSees !== '—' ? ' is-bad' : ''}`}>
          <span className="kp-who">Eve, listening on the network</span>
          <code>{cur.eveSees}</code>
        </div>
      </div>
      <div className="kp-count">
        <ToggleGroup label="And with more people…" value={n} onChange={setN} options={SIZES.map((s) => ({ value: s, label: `${Number(s).toLocaleString('en-US')} people` }))} />
        <p>
          Every pair needs its own secret key: <strong>{people.toLocaleString('en-US')} × {(people - 1).toLocaleString('en-US')} ÷ 2 ={' '}
          {pairs.toLocaleString('en-US')} keys</strong>, each delivered secretly. With public-key cryptography, each person needs just <strong>one key pair</strong>:{' '}
          {people.toLocaleString('en-US')} in total.
        </p>
      </div>
    </DiagramFrame>
  );
}
