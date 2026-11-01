import { useState, type ReactNode } from 'react';
import DiagramFrame from './DiagramFrame';
import { StepControls, Switch, arrowKeys, useStepper } from './shared';

// Paint colours for the classic analogy: mixing is easy, un-mixing is practically impossible.
const C = {
  common: '#f2c14e', // yellow: public
  aSecret: '#d1495b', // red: Alice's secret
  bSecret: '#2e86ab', // blue: Bob's secret
  aMix: '#e2853c', // yellow + red
  bMix: '#7aa57d', // yellow + blue
  shared: '#8a6a4f', // yellow + red + blue
};

// The real maths, with toy-sized numbers: p = 23, g = 5.
const P = 23;
const G = 5;
const A = 6; // Alice's secret
const B = 15; // Bob's secret
const pow = (b: number, e: number, m: number) => {
  let r = 1;
  for (let i = 0; i < e; i++) r = (r * b) % m;
  return r;
};
const Apub = pow(G, A, P); // 8
const Bpub = pow(G, B, P); // 19
const S = pow(Bpub, A, P); // 2 (= pow(Apub, B, P))

interface Step {
  alice: string[];
  bob: string[];
  wire: string[];
  text: ReactNode;
  maths: ReactNode;
}

const STEPS: Step[] = [
  {
    alice: [], bob: [], wire: ['common'],
    text: <>Alice and Bob agree publicly on a common starting colour, <strong>yellow</strong>. Eve sees it too, and that's fine. Press Next.</>,
    maths: <>Public parameters: a prime <code>p = {P}</code> and a generator <code>g = {G}</code>. Everyone, Eve included, knows them.</>,
  },
  {
    alice: ['aSecret'], bob: ['bSecret'], wire: ['common'],
    text: <>Each picks a <strong>secret colour</strong> and never sends it anywhere: Alice red, Bob blue.</>,
    maths: <>Alice picks a secret <code>a = {A}</code>, Bob a secret <code>b = {B}</code>. These never leave their machines.</>,
  },
  {
    alice: ['aSecret', 'aMix'], bob: ['bSecret', 'bMix'], wire: ['common'],
    text: <>Each mixes their secret into the common yellow. Mixing paint is easy; <strong>separating a mixture back into its colours is practically impossible</strong>. That one-way step is the whole trick.</>,
    maths: <>Alice computes <code>A = g^a mod p = {G}^{A} mod {P} = {Apub}</code>. Bob computes <code>B = g^b mod p = {Bpub}</code>. Going back from {Apub} to {A} is the <em>discrete logarithm problem</em>: hopeless with real-sized numbers.</>,
  },
  {
    alice: ['aSecret', 'aMix', 'bMix'], bob: ['bSecret', 'bMix', 'aMix'], wire: ['common', 'aMix', 'bMix'],
    text: <>They <strong>swap mixtures in public</strong>. Eve now sees yellow, orange and green, but not red or blue.</>,
    maths: <>Alice sends <code>A = {Apub}</code>, Bob sends <code>B = {Bpub}</code>, in the clear. Eve knows {P}, {G}, {Apub} and {Bpub}.</>,
  },
  {
    alice: ['aSecret', 'aMix', 'bMix', 'shared'], bob: ['bSecret', 'bMix', 'aMix', 'shared'], wire: ['common', 'aMix', 'bMix'],
    text: <>Each adds <strong>their own secret</strong> to the mixture they received. Both end up with the <strong>same colour</strong> (yellow + red + blue), but it never crossed the wire. Eve can only combine mixtures that each already contain yellow, so she can't make it. That colour becomes their symmetric key.</>,
    maths: <>Alice: <code>B^a mod p = {Bpub}^{A} mod {P} = {S}</code>. Bob: <code>A^b mod p = {Apub}^{B} mod {P} = {pow(Apub, B, P)}</code>. The same secret, <strong>{S}</strong>, computed separately. Real TLS does this with elliptic curves (X25519) and 256-bit numbers.</>,
  },
];

export default function DhMixing() {
  const stepper = useStepper(STEPS.length);
  const cur = STEPS[stepper.step];
  const [maths, setMaths] = useState(false);
  const swatch = (k: string) => (
    <span key={k} className="dh-swatch" style={{ background: C[k as keyof typeof C] }} title={k} />
  );

  return (
    <DiagramFrame
      title="Diffie-Hellman key agreement"
      subtitle="agreeing on a secret while everyone listens"
      onKeyDown={arrowKeys(stepper.prev, stepper.next)}
      status={
        <div className="dg-detail">
          <div>{cur.text}</div>
          {maths && <div className="dh-maths">{cur.maths}</div>}
        </div>
      }
      controls={
        <>
          <StepControls stepper={stepper} intro />
          <div className="dg-toggle">
            <span className="dg-label">Detail</span>
            <Switch checked={maths} onChange={setMaths}>
              Show the real maths
            </Switch>
          </div>
        </>
      }
    >
      <div className="dh">
        <div className="dh-party">
          <span className="kp-who">Alice</span>
          <div className="dh-swatches">{cur.alice.map(swatch)}</div>
        </div>
        <div className="dh-party is-wire">
          <span className="kp-who">Public network (Eve sees all of this)</span>
          <div className="dh-swatches">{cur.wire.map(swatch)}</div>
        </div>
        <div className="dh-party">
          <span className="kp-who">Bob</span>
          <div className="dh-swatches">{cur.bob.map(swatch)}</div>
        </div>
      </div>
      <p className="ra-legend">Yellow is public; red and blue are secret and never leave their owners; the brown on both sides is the shared key.</p>
    </DiagramFrame>
  );
}
