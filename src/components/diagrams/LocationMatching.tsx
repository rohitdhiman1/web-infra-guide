import { useState } from 'react';
import DiagramFrame from './DiagramFrame';

type Kind = 'exact' | 'prefix' | 'stop' | 'regex' | 'regexi';

interface Block {
  id: number;
  kind: Kind;
  modifier: string;
  pattern: string;
  test: (uri: string) => boolean;
}

const BLOCKS: Block[] = [
  { id: 1, kind: 'exact', modifier: '=', pattern: '/', test: (u) => u === '/' },
  { id: 2, kind: 'prefix', modifier: '', pattern: '/', test: (u) => u.startsWith('/') },
  { id: 3, kind: 'prefix', modifier: '', pattern: '/images/', test: (u) => u.startsWith('/images/') },
  { id: 4, kind: 'stop', modifier: '^~', pattern: '/static/', test: (u) => u.startsWith('/static/') },
  { id: 5, kind: 'regexi', modifier: '~*', pattern: '\\.(png|jpg|css)$', test: (u) => /\.(png|jpg|css)$/i.test(u) },
  { id: 6, kind: 'regex', modifier: '~', pattern: '^/api/v[0-9]+/', test: (u) => /^\/api\/v[0-9]+\//.test(u) },
];

const URLS = ['/', '/index.html', '/images/logo.png', '/static/app.css', '/api/v2/users'];

type Mark = 'skip' | 'nomatch' | 'match' | 'longest' | 'win' | 'notchecked';
interface Trace {
  winner: number;
  marks: Record<number, { mark: Mark; note: string }>;
  steps: string[];
}

const chars = (p: string) => `${p.length} char${p.length === 1 ? '' : 's'}`;

/** nginx's algorithm (7.6), recorded step by step. */
function resolve(uri: string): Trace {
  const marks: Trace['marks'] = {};
  const steps: string[] = [];
  const exact = BLOCKS.find((b) => b.kind === 'exact' && b.test(uri));
  for (const b of BLOCKS.filter((b) => b.kind === 'exact')) {
    marks[b.id] = b === exact ? { mark: 'win', note: 'exact match: wins at once' } : { mark: 'nomatch', note: 'not an exact match' };
  }
  if (exact) {
    steps.push(`1. Exact match: "location = ${exact.pattern}" matches ${uri}, so nginx stops searching immediately.`);
    for (const b of BLOCKS.filter((b) => b.kind !== 'exact')) marks[b.id] = { mark: 'notchecked', note: 'never checked' };
    return { winner: exact.id, marks, steps };
  }
  steps.push('1. Exact match: no "=" block matches.');

  const prefixes = BLOCKS.filter((b) => b.kind === 'prefix' || b.kind === 'stop');
  const matching = prefixes.filter((b) => b.test(uri));
  const longest = matching.sort((a, b) => b.pattern.length - a.pattern.length)[0];
  for (const b of prefixes) {
    marks[b.id] = b.test(uri)
      ? b === longest
        ? { mark: 'longest', note: `longest prefix (${chars(b.pattern)})` }
        : { mark: 'match', note: `prefix matches, but shorter (${chars(b.pattern)})` }
      : { mark: 'nomatch', note: 'prefix does not match' };
  }
  steps.push(`2. Longest matching prefix: "${longest.pattern}". nginx remembers it.`);

  const regexes = BLOCKS.filter((b) => b.kind === 'regex' || b.kind === 'regexi');
  if (longest.kind === 'stop') {
    marks[longest.id] = { mark: 'win', note: 'longest prefix has ^~: regexes are skipped' };
    for (const b of regexes) marks[b.id] = { mark: 'notchecked', note: b.test(uri) ? 'would match, but is never checked' : 'never checked' };
    steps.push('3. That prefix has ^~, so the regex blocks are skipped entirely. It wins.');
    return { winner: longest.id, marks, steps };
  }

  let winner: Block | undefined;
  for (const b of regexes) {
    if (winner) {
      marks[b.id] = { mark: 'notchecked', note: 'not checked: an earlier regex already won' };
    } else if (b.test(uri)) {
      winner = b;
      marks[b.id] = { mark: 'win', note: 'first matching regex in file order: wins' };
    } else {
      marks[b.id] = { mark: 'nomatch', note: 'regex does not match' };
    }
  }
  if (winner) {
    marks[longest.id] = { mark: 'match', note: 'longest prefix, but a regex beat it' };
    steps.push(`3. Regexes in file order: "${winner.modifier} ${winner.pattern}" is the first to match. A matching regex beats any prefix, so it wins.`);
    return { winner: winner.id, marks, steps };
  }
  marks[longest.id] = { mark: 'win', note: 'no regex matched: the longest prefix is used' };
  steps.push(`3. No regex matches, so nginx falls back to the remembered longest prefix "${longest.pattern}".`);
  return { winner: longest.id, marks, steps };
}

export default function LocationMatching() {
  const [uri, setUri] = useState<string | null>(null);
  const [guess, setGuess] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const trace = uri ? resolve(uri) : null;

  const pick = (u: string) => {
    setUri(u);
    setGuess(null);
    setRevealed(false);
  };
  const makeGuess = (id: number) => {
    if (!uri || revealed) return;
    setGuess(id);
    setRevealed(true);
  };

  let status;
  if (!uri) status = <>Pick a test URL, then click the block you think will handle it.</>;
  else if (!revealed)
    status = (
      <>
        Request: <code>GET {uri}</code>. Which block wins? Click it in the config, or{' '}
        <button type="button" className="dg-link" onClick={() => setRevealed(true)}>
          just show me
        </button>
        .
      </>
    );
  else
    status = (
      <>
        {guess !== null && (
          <span className={`dg-pill ${guess === trace!.winner ? 'ok' : 'bad'}`}>
            {guess === trace!.winner ? 'Correct' : `Not block ${guess}`}
          </span>
        )}{' '}
        <strong>Block {trace!.winner} wins.</strong>
        <ol className="lm-steps">
          {trace!.steps.map((s) => (
            <li key={s}>{s.replace(/^\d\. /, '')}</li>
          ))}
        </ol>
      </>
    );

  return (
    <DiagramFrame
      title="Location matching"
      subtitle="6 blocks, 5 test URLs"
      status={status}
      controls={
        <div className="dg-toggle" role="group" aria-label="Test URL">
          <span className="dg-label">Test URL</span>
          <div className="dg-btn-group">
            {URLS.map((u) => (
              <button key={u} type="button" className="dg-btn" aria-pressed={uri === u} onClick={() => pick(u)}>
                <code>{u}</code>
              </button>
            ))}
          </div>
        </div>
      }
    >
      <div className="loc" role="group" aria-label="nginx configuration: location blocks. Click a block to guess.">
        <div className="loc-line loc-brace">
          <code>server {'{'}</code>
        </div>
        {BLOCKS.map((b) => {
          const m = revealed && trace ? trace.marks[b.id] : null;
          const isGuess = guess === b.id;
          return (
            <button
              key={`${uri}-${b.id}`}
              type="button"
              className={`loc-block${m ? ` mark-${m.mark}` : ''}${isGuess ? ' is-guess' : ''}`}
              aria-disabled={!uri || revealed}
              onClick={() => makeGuess(b.id)}
              style={m ? { animationDelay: `${BLOCKS.indexOf(b) * 0.12}s` } : undefined}
            >
              <span className="loc-num">{b.id}</span>
              <code className="loc-code">
                location {b.modifier && <span className="loc-mod">{b.modifier} </span>}
                {b.pattern} {'{'} return 200 "line {b.id}"; {'}'}
              </code>
              {m && <span className="loc-note">{m.note}</span>}
              {isGuess && <span className="loc-guess">your guess</span>}
            </button>
          );
        })}
        <div className="loc-line loc-brace">
          <code>{'}'}</code>
        </div>
      </div>
    </DiagramFrame>
  );
}
