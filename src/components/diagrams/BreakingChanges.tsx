import { useState, type ReactNode } from 'react';
import DiagramFrame from './DiagramFrame';

interface Change {
  change: ReactNode;
  breaking: boolean;
  why: ReactNode;
}

const CHANGES: Change[] = [
  {
    change: <>Add an optional <code>note</code> field to the order response</>,
    breaking: false,
    why: <>Additive. Clients that ignore unknown fields (as they should) never notice. This is how most APIs grow.</>,
  },
  {
    change: <>Rename <code>customer</code> to <code>customerEmail</code></>,
    breaking: true,
    why: <>Every client reading <code>customer</code> now gets nothing. A rename is a removal plus an addition. Add the new name, keep the old one, deprecate it, and remove it only in a new version.</>,
  },
  {
    change: <>Change <code>customer</code> from a string to an object</>,
    breaking: true,
    why: <>Same name, different type: parsers fail or code crashes on <code>customer.toLowerCase()</code>. This is exactly the change that created v2 in the lab.</>,
  },
  {
    change: <>Make the request field <code>note</code> required</>,
    breaking: true,
    why: <>Clients that never sent it now get 422. Adding <em>required</em> input is breaking; adding <em>optional</em> input is not.</>,
  },
  {
    change: <>Accept a new optional query parameter <code>?sort=</code></>,
    breaking: false,
    why: <>Old clients don't send it and get the old default behaviour.</>,
  },
  {
    change: <>Add a new value <code>"refunded"</code> to <code>status</code></>,
    breaking: true,
    why: <>Usually breaking in practice: a client with a <code>switch</code> over the known statuses hits its default branch, or crashes in a language with strict enums. Document that enums may grow, and code clients to tolerate unknown values. Ask in an interview which behaviour your consumers really have.</>,
  },
  {
    change: <>Return <code>404</code> instead of <code>200</code> with an empty body for a missing order</>,
    breaking: true,
    why: <>Status codes are contract. A client that checked the body and ignored the status now goes down a different code path. Fixing a wrong status code is still a breaking change.</>,
  },
  {
    change: <>Add a new endpoint <code>GET /orders/{'{id}'}/events</code></>,
    breaking: false,
    why: <>Nobody calls it yet, so nothing can break.</>,
  },
  {
    change: <>Lower the maximum page size from 100 to 50</>,
    breaking: true,
    why: <>A client asking for <code>limit=100</code> now gets a 400, or silently gets fewer rows. Tightening validation or limits is breaking.</>,
  },
  {
    change: <>Speed the endpoint up from 300 ms to 30 ms</>,
    breaking: false,
    why: <>Not breaking by contract. But Hyrum's law says someone depends on it anyway, such as a client with a race that only the old slowness hid. Every observable behaviour ends up depended on.</>,
  },
];

export default function BreakingChanges() {
  const [answers, setAnswers] = useState<(boolean | undefined)[]>(Array(CHANGES.length).fill(undefined));
  const answered = answers.filter((a) => a !== undefined).length;
  const correct = answers.filter((a, i) => a !== undefined && a === CHANGES[i].breaking).length;

  return (
    <DiagramFrame
      title="Breaking or safe?"
      subtitle="10 changes to a live API"
      status={
        answered === 0 ? (
          <>For each change, decide whether existing clients could break. Each answer shows why.</>
        ) : (
          <>
            {correct} of {answered} right so far{answered === CHANGES.length && (correct === CHANGES.length ? '. All correct.' : '.')}
          </>
        )
      }
      controls={
        <div className="dg-row">
          <button
            type="button"
            className="dg-btn"
            aria-disabled={answered === 0}
            onClick={() => setAnswers(Array(CHANGES.length).fill(undefined))}
          >
            Reset
          </button>
        </div>
      }
    >
      <ol className="bc">
        {CHANGES.map((c, i) => {
          const a = answers[i];
          const right = a !== undefined && a === c.breaking;
          return (
            <li key={i} className={`bc-item${a === undefined ? '' : right ? ' is-right' : ' is-wrong'}`}>
              <div className="bc-change">{c.change}</div>
              <div className="dg-btn-group" role="group" aria-label={`Is this change breaking? Change ${i + 1}`}>
                {[false, true].map((v) => (
                  <button
                    key={String(v)}
                    type="button"
                    className="dg-btn"
                    aria-pressed={a === v}
                    onClick={() => setAnswers((prev) => prev.map((x, j) => (j === i ? v : x)))}
                  >
                    {v ? 'Breaking' : 'Safe'}
                  </button>
                ))}
              </div>
              {a !== undefined && (
                <div className="bc-why">
                  <span className={`dg-pill ${c.breaking ? 'bad' : 'ok'}`}>{c.breaking ? 'breaking' : 'safe'}</span>{' '}
                  {right ? '' : 'Not quite. '}
                  {c.why}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </DiagramFrame>
  );
}
