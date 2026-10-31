import { useEffect, useState, type ReactNode } from 'react';
import DiagramFrame from './DiagramFrame';
import { useInterval } from './shared';

interface Check {
  area: string;
  q: string;
  /** The status you send when the answer is "no". */
  code: number;
  why: ReactNode;
}

// The order a request is usually checked in. Frameworks differ in details (see the notes on the page).
const CHECKS: Check[] = [
  { area: 'Service', q: 'Is the service able to take requests right now?', code: 503, why: <>Overloaded or in maintenance. Add <code>Retry-After</code> so clients know when to come back.</> },
  { area: 'Routing', q: 'Does the URL identify a resource that exists?', code: 404, why: <>Nothing lives at that URL, or the id is unknown.</> },
  { area: 'Routing', q: 'Does that resource support this method?', code: 405, why: <>The resource exists but not for this method. You must send <code>Allow</code> listing the methods that work.</> },
  { area: 'Auth', q: 'Did the client prove who it is (if this needs it)?', code: 401, why: <>Missing or invalid credentials. Send <code>WWW-Authenticate</code> to say how to authenticate. Despite its name, 401 is about authentication.</> },
  { area: 'Auth', q: 'Is this client allowed to do this?', code: 403, why: <>Known client, not allowed. Return 404 instead if even admitting the resource exists would leak information.</> },
  { area: 'Limits', q: 'Is the client under its rate limit?', code: 429, why: <>Too many requests. Add <code>Retry-After</code>. Limits come after auth because they're usually per client.</> },
  { area: 'Negotiation', q: 'Can we produce a type the Accept header allows?', code: 406, why: <>The client only accepts, say, XML and you only produce JSON. Many APIs ignore Accept and always send JSON; checking it is stricter.</> },
  { area: 'Negotiation', q: 'Do we understand the body’s Content-Type?', code: 415, why: <>Wrong or missing <code>Content-Type</code>. For PATCH, send <code>Accept-Patch</code> listing the patch formats you take.</> },
  { area: 'Body', q: 'Does the body parse as that type?', code: 400, why: <>The bytes aren't valid JSON at all: a syntax problem.</> },
  { area: 'Body', q: 'Does the parsed body pass the validation rules?', code: 422, why: <>Valid JSON, wrong content: a required field is missing, a quantity is 0, a currency isn't a currency.</> },
  { area: 'State', q: 'Do the request’s preconditions hold (If-Match)?', code: 412, why: <>The client said “only if it's still version X” and it isn't. Module A4 covers this.</> },
  { area: 'State', q: 'Does the change fit the resource’s current state?', code: 409, why: <>Valid on its own, but not now: changing an order that's already cancelled.</> },
];

const SUCCESS = [
  { value: 201, label: 'Created a resource', why: <>Send <code>Location</code> with the new URL, and usually the new resource in the body.</> },
  { value: 202, label: 'Accepted, will finish later', why: <>Nothing is done yet. Point to a status resource the client can poll (module A7).</> },
  { value: 204, label: 'Done, nothing to return', why: <>No body at all. Typical for DELETE.</> },
  { value: 200, label: 'Done, here is the result', why: <>The body is the result, such as the order after a PUT or PATCH.</> },
] as const;

interface Scenario {
  label: string;
  request: string;
  /** Index of the first failing check, or a success code. */
  fails?: number;
  success?: (typeof SUCCESS)[number]['value'];
}

const SCENARIOS: Scenario[] = [
  { label: 'Create an order', request: 'POST /orders with a valid body', success: 201 },
  { label: 'Read a missing order', request: 'GET /orders/ord_999', fails: 1 },
  { label: 'Delete the collection', request: 'DELETE /orders', fails: 2 },
  { label: 'No token', request: 'GET /orders/ord_1 without credentials (on a protected API)', fails: 3 },
  { label: 'Someone else’s order', request: 'GET /orders/ord_7 with a valid token for another customer', fails: 4 },
  { label: 'Ask for XML', request: 'GET /orders/ord_1 with Accept: application/xml', fails: 6 },
  { label: 'PATCH as plain JSON', request: 'PATCH /orders/ord_1 with Content-Type: application/json', fails: 7 },
  { label: 'Broken JSON', request: 'POST /orders with body {"customer": ', fails: 8 },
  { label: 'Quantity 0', request: 'POST /orders with "quantity": 0', fails: 9 },
  { label: 'Change a cancelled order', request: 'PATCH /orders/ord_1 {"customer": …} after it was cancelled', fails: 11 },
  { label: 'Delete an order', request: 'DELETE /orders/ord_1', success: 204 },
  { label: 'Start a slow refund', request: 'POST /refunds that takes minutes to finish', success: 202 },
];

type Answer = boolean | undefined;

export default function StatusCodeTree() {
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [success, setSuccess] = useState<number | null>(null);
  const [scenario, setScenario] = useState<number | null>(null);
  const [playTo, setPlayTo] = useState<{ answers: Answer[]; success: number | null } | null>(null);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  }, []);

  // Walk a scenario one answer at a time so you can follow the path.
  useInterval(
    () => {
      if (!playTo) return;
      if (answers.length < playTo.answers.length) {
        setAnswers(playTo.answers.slice(0, answers.length + 1));
      } else {
        setSuccess(playTo.success);
        setPlayTo(null);
      }
    },
    450,
    playTo !== null,
  );

  const failed = answers.findIndex((a) => a === false);
  const current = failed >= 0 ? null : answers.length < CHECKS.length ? answers.length : null;
  const allPassed = failed < 0 && answers.length === CHECKS.length;

  const answer = (i: number, yes: boolean) => {
    setScenario(null);
    setPlayTo(null);
    setSuccess(null);
    setAnswers((a) => [...a.slice(0, i), yes]);
  };
  const reset = () => {
    setAnswers([]);
    setSuccess(null);
    setScenario(null);
    setPlayTo(null);
  };
  const play = (i: number) => {
    const s = SCENARIOS[i];
    const target: Answer[] =
      s.fails !== undefined ? [...Array(s.fails).fill(true), false] : Array(CHECKS.length).fill(true);
    const result = { answers: target, success: s.success ?? null };
    setScenario(i);
    if (reduced) {
      setAnswers(result.answers);
      setSuccess(result.success);
      setPlayTo(null);
    } else {
      setAnswers([]);
      setSuccess(null);
      setPlayTo(result);
    }
  };

  const outcome =
    failed >= 0
      ? { code: CHECKS[failed].code, why: CHECKS[failed].why, tone: CHECKS[failed].code >= 500 ? 'bad' : 'warn' }
      : success !== null
        ? { code: success, why: SUCCESS.find((s) => s.value === success)!.why, tone: 'ok' }
        : null;

  return (
    <DiagramFrame
      title="Status code decision tree"
      subtitle="12 checks, in the order a request meets them"
      status={
        outcome ? (
          <div className="dg-detail">
            <div>
              {scenario !== null && (
                <>
                  <code>{SCENARIOS[scenario].request}</code>
                  <br />
                </>
              )}
              <span className={`dg-pill ${outcome.tone}`}>{outcome.code}</span> {outcome.why}
            </div>
          </div>
        ) : playTo ? (
          <>Following: {SCENARIOS[scenario!].request}…</>
        ) : allPassed ? (
          <>Every check passed. What did the server do? Pick a success code below the list.</>
        ) : (
          <>
            Answer each question with Yes or No, or pick a scenario to watch its path. The first “no” decides the
            code.
          </>
        )
      }
      controls={
        <div className="dg-row">
          <button
            type="button"
            className="dg-btn"
            aria-disabled={answers.length === 0 || playTo !== null}
            onClick={() => {
              if (playTo || answers.length === 0) return;
              setScenario(null);
              if (success !== null) setSuccess(null);
              else setAnswers((a) => a.slice(0, -1));
            }}
          >
            ← Back
          </button>
          <button type="button" className="dg-btn" onClick={reset} aria-disabled={answers.length === 0}>
            Reset
          </button>
        </div>
      }
    >
      <div className="dg-toggle sct-scen" role="group" aria-label="Scenarios">
        <span className="dg-label">Pick a scenario, or answer the questions yourself</span>
        <div className="dg-btn-group">
          {SCENARIOS.map((s, i) => (
            <button key={s.label} type="button" className="dg-btn" aria-pressed={scenario === i} onClick={() => play(i)}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <ol className="df sct">
        {CHECKS.map((c, i) => {
          const a = answers[i];
          const state = a === true ? 'pass' : a === false ? 'stop' : i === current && !playTo ? 'active' : 'idle';
          return (
            <li key={c.q} className={`df-q is-${state}`}>
              <span className="df-num" aria-hidden="true">
                {i + 1}
              </span>
              <div className="df-head">
                <span className="df-layer">{c.area}</span>
                <strong>{c.q}</strong>
                <span className="sct-code">no → {c.code}</span>
              </div>
              {(state === 'active' || state === 'stop') && !playTo && (
                <div className="dg-btn-group df-answers" role="group" aria-label={`Answer: ${c.q}`}>
                  <button type="button" className="dg-btn" aria-pressed={a === true} onClick={() => answer(i, true)}>
                    Yes
                  </button>
                  <button type="button" className="dg-btn" aria-pressed={a === false} onClick={() => answer(i, false)}>
                    No → {c.code}
                  </button>
                </div>
              )}
              {state === 'stop' && (
                <div className="sct-result">
                  <span className={`dg-pill ${c.code >= 500 ? 'bad' : 'warn'}`}>{c.code}</span> {c.why}
                </div>
              )}
            </li>
          );
        })}
        <li className={`df-q is-${allPassed ? (success ? 'pass' : 'active') : 'idle'}`}>
          <span className="df-num" aria-hidden="true">
            ✓
          </span>
          <div className="df-head">
            <span className="df-layer">Success</span>
            <strong>Everything passed. What happened?</strong>
          </div>
          {allPassed && !playTo && (
            <div className="dg-btn-group df-answers" role="group" aria-label="Pick a success code">
              {SUCCESS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  className="dg-btn"
                  aria-pressed={success === s.value}
                  onClick={() => {
                    setScenario(null);
                    setSuccess(s.value);
                  }}
                >
                  {s.value} · {s.label}
                </button>
              ))}
            </div>
          )}
          {success !== null && !playTo && (
            <div className="sct-result">
              <span className="dg-pill ok">{success}</span> {SUCCESS.find((x) => x.value === success)!.why}
            </div>
          )}
        </li>
      </ol>
      <p className="sct-foot">
        Not in the tree: <strong>500</strong> isn't a choice you make, it's what happens when your code throws. Never
        send it for a client's mistake. <strong>502</strong> and <strong>504</strong> come from proxies in front of
        you.
      </p>
    </DiagramFrame>
  );
}
