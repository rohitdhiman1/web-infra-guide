import { useState, type ReactNode } from 'react';
import DiagramFrame from './DiagramFrame';

interface Answer {
  label: string;
  /** Next question index, or a diagnosis. */
  next?: number;
  diagnosis?: Diagnosis;
}
interface Diagnosis {
  layer: string;
  tone: 'bad' | 'warn' | 'ok';
  text: ReactNode;
  command: string;
}
interface Question {
  layer: string;
  q: string;
  command: string;
  answers: Answer[];
}

const QUESTIONS: Question[] = [
  {
    layer: 'DNS',
    q: 'Does the name resolve to the right IP?',
    command: 'dig +short shop.example.com',
    answers: [
      { label: 'Yes, the right IP', next: 1 },
      {
        label: 'No answer',
        diagnosis: {
          layer: 'DNS',
          tone: 'bad',
          text: <>The record is missing, or only your resolver is wrong. Compare with a public resolver.</>,
          command: 'dig @1.1.1.1 shop.example.com',
        },
      },
      {
        label: 'Wrong IP',
        diagnosis: {
          layer: 'DNS',
          tone: 'bad',
          text: <>A stale or wrong record. Check the zone and remember the TTL: old answers live on in caches.</>,
          command: 'dig shop.example.com +trace',
        },
      },
    ],
  },
  {
    layer: 'TCP',
    q: 'Can you open a TCP connection to the port?',
    command: 'nc -vz -w3 shop.example.com 443',
    answers: [
      { label: 'Connected', next: 2 },
      {
        label: 'Timed out',
        diagnosis: {
          layer: 'Network / firewall',
          tone: 'bad',
          text: <>Packets are silently dropped: a security group, NACL or routing problem. Nothing came back at all.</>,
          command: 'sudo tcpdump -i any -nn host <client-ip> and port 443',
        },
      },
      {
        label: 'Refused',
        diagnosis: {
          layer: 'Nothing listening',
          tone: 'bad',
          text: <>An RST came back: the host is reachable, but no process listens on that port, or it's bound to 127.0.0.1 only.</>,
          command: 'ss -ltnp',
        },
      },
    ],
  },
  {
    layer: 'TLS',
    q: 'Does the TLS handshake succeed?',
    command: 'openssl s_client -connect shop.example.com:443 -servername shop.example.com',
    answers: [
      { label: 'Verify return code: 0 (ok)', next: 3 },
      {
        label: 'certificate verify failed',
        diagnosis: {
          layer: 'TLS trust',
          tone: 'bad',
          text: <>A missing intermediate, an expired certificate, or a name not in the SAN list.</>,
          command: 'openssl s_client -connect shop.example.com:443 -servername shop.example.com -showcerts',
        },
      },
      {
        label: 'handshake failure',
        diagnosis: {
          layer: 'TLS config',
          tone: 'bad',
          text: <>A protocol, cipher or SNI mismatch between client and server.</>,
          command: 'openssl s_client -connect shop.example.com:443 -tls1_2',
        },
      },
    ],
  },
  {
    layer: 'HTTP',
    q: 'What does HTTP say?',
    command: 'curl -sv -o /dev/null https://shop.example.com/',
    answers: [
      {
        label: '502',
        diagnosis: {
          layer: 'nginx → upstream',
          tone: 'bad',
          text: <>nginx couldn't get a valid answer from the backend: down, crashed or on the wrong port. Read error.log, then curl the backend from the nginx host.</>,
          command: 'tail -f /var/log/nginx/error.log',
        },
      },
      {
        label: '504',
        diagnosis: {
          layer: 'Slow upstream',
          tone: 'bad',
          text: <>The app or its database is slower than proxy_read_timeout. Find the slow request in the access log.</>,
          command: "grep ' 504 ' /var/log/nginx/access.log   # then read $upstream_response_time",
        },
      },
      {
        label: '4xx',
        diagnosis: {
          layer: 'Request / routing',
          tone: 'warn',
          text: <>The request reached the server but was rejected: the wrong location, a missing file, auth, a size limit (413) or a rate limit (429).</>,
          command: 'nginx -T | less   # which server and location matched?',
        },
      },
      {
        label: '200, but slow',
        diagnosis: {
          layer: 'Somewhere in the path',
          tone: 'warn',
          text: <>No error, so time it: the phase with the big jump is where the time goes.</>,
          command: "curl -o /dev/null -s -w 'dns %{time_namelookup} connect %{time_connect} tls %{time_appconnect} ttfb %{time_starttransfer}\\n' https://shop.example.com",
        },
      },
      {
        label: '200, works',
        diagnosis: {
          layer: 'Not the server path',
          tone: 'ok',
          text: <>Every layer passes from here. If users still fail, compare their path: a different resolver, network, browser policy (CORS, HSTS) or one bad backend.</>,
          command: 'grep <request_id> access.log   # check $upstream_addr',
        },
      },
    ],
  },
];

interface Step {
  q: number;
  a: number;
}

export default function DebuggingFlow() {
  const [path, setPath] = useState<Step[]>([]);
  const last = path.at(-1);
  const lastAnswer = last ? QUESTIONS[last.q].answers[last.a] : null;
  const diagnosis = lastAnswer?.diagnosis ?? null;
  const current = diagnosis ? null : last ? lastAnswer!.next! : 0;

  const answer = (q: number, a: number) => setPath((p) => [...p.filter((s) => s.q < q), { q, a }]);

  return (
    <DiagramFrame
      title="Debugging flow"
      subtitle="4 questions, outside in"
      status={
        diagnosis ? (
          <div className="dg-detail">
            <div>
              <span className={`dg-pill ${diagnosis.tone}`}>{diagnosis.layer}</span> {diagnosis.text}
            </div>
            <div>
              Next command: <code>{diagnosis.command}</code>
            </div>
          </div>
        ) : (
          <>
            Question {current! + 1} of 4: run <code>{QUESTIONS[current!].command}</code> and pick what you see.
          </>
        )
      }
      controls={
        <div className="dg-row">
          <button
            type="button"
            className="dg-btn"
            aria-disabled={path.length === 0}
            onClick={() => setPath((p) => p.slice(0, -1))}
          >
            ← Back
          </button>
          <button type="button" className="dg-btn" aria-disabled={path.length === 0} onClick={() => setPath([])}>
            Start over
          </button>
        </div>
      }
    >
      <ol className="df">
        {QUESTIONS.map((q, i) => {
          const step = path.find((s) => s.q === i);
          const state = step ? (step.a === 0 && q.answers[0].next !== undefined ? 'pass' : 'stop') : i === current ? 'active' : 'idle';
          return (
            <li key={q.layer} className={`df-q is-${state}`}>
              <div className="df-head">
                <span className="df-num">{i + 1}</span>
                <span className="df-layer">{q.layer}</span>
                <strong>{q.q}</strong>
              </div>
              <code className="df-cmd">{q.command}</code>
              {(state === 'active' || step) && (
                <div className="dg-btn-group df-answers" role="group" aria-label={`Answers to: ${q.q}`}>
                  {q.answers.map((a, ai) => (
                    <button
                      key={a.label}
                      type="button"
                      className="dg-btn"
                      aria-pressed={step?.a === ai}
                      onClick={() => answer(i, ai)}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
              {step && state === 'stop' && <div className="df-stop">Found it: stop here.</div>}
            </li>
          );
        })}
      </ol>
    </DiagramFrame>
  );
}
