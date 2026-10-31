import { useState } from 'react';
import DiagramFrame from './DiagramFrame';
import { ToggleGroup } from './shared';

type Mode = 'offset' | 'cursor';
const LIMIT = 3;
const START = [9, 8, 7, 6, 5, 4, 3, 2, 1]; // order ids, newest first

interface State {
  rows: number[];
  next: number; // id of the next new order
  pages: number[][]; // what the client has received, page by page
  offset: number;
  cursor: number | null; // last id seen
  done: boolean;
}

const fresh = (): State => ({ rows: START, next: 10, pages: [], offset: 0, cursor: null, done: false });

export default function PaginationDrift() {
  const [mode, setMode] = useState<Mode>('offset');
  const [s, setS] = useState<State>(fresh);
  const [log, setLog] = useState<string>('The client reads newest first, 3 orders per page. Read page 1, then change the data, then read the next page.');

  const seen = s.pages.flat();
  const seenSet = new Set(seen);
  const dupes = new Set(seen.filter((id, i) => seen.indexOf(id) !== i));
  // Skipped: an order that existed when the client started, sits above the oldest row it has seen
  // (so a correct walk would already have returned it), and never came back. New arrivals don't count.
  const lowest = seen.length ? Math.min(...seen) : Infinity;
  const missed = s.rows.filter((id) => START.includes(id) && id > lowest && !seenSet.has(id));

  const readPage = () => {
    if (s.done) return;
    const page =
      mode === 'offset'
        ? s.rows.slice(s.offset, s.offset + LIMIT)
        : s.rows.filter((id) => s.cursor === null || id < s.cursor).slice(0, LIMIT);
    const query = mode === 'offset' ? `?limit=3&offset=${s.offset}` : s.cursor === null ? '?limit=3' : `?limit=3&cursor=…(after ord_${s.cursor})`;
    const done = page.length < LIMIT || (mode === 'offset' ? s.offset + LIMIT >= s.rows.length : page.at(-1) === Math.min(...s.rows));
    setS({ ...s, pages: [...s.pages, page], offset: s.offset + LIMIT, cursor: page.at(-1) ?? s.cursor, done });
    setLog(`GET /orders${query} → ${page.map((id) => `ord_${id}`).join(', ') || 'nothing'}${done ? ' (last page)' : ''}`);
  };
  const insert = () => {
    setS({ ...s, rows: [s.next, ...s.rows], next: s.next + 1 });
    setLog(`A new order ord_${s.next} arrives. Newest first, so it goes to the top and every row shifts down one place.`);
  };
  const remove = () => {
    const target = s.pages.flat()[0] ?? s.rows[0];
    if (!s.rows.includes(target)) return;
    setS({ ...s, rows: s.rows.filter((id) => id !== target) });
    setLog(`ord_${target}, one the client has already seen, is deleted. Every row below it shifts up one place.`);
  };
  const reset = (m: Mode = mode) => {
    setMode(m);
    setS(fresh());
    setLog('The client reads newest first, 3 orders per page. Read page 1, then change the data, then read the next page.');
  };

  const summary =
    s.pages.length === 0
      ? null
      : dupes.size || missed.length
        ? `${dupes.size ? `Repeated: ${[...dupes].map((d) => `ord_${d}`).join(', ')}. ` : ''}${missed.length ? `Skipped: ${missed.map((d) => `ord_${d}`).join(', ')}.` : ''}`
        : 'No repeats, nothing skipped so far.';

  return (
    <DiagramFrame
      title="Pagination drift"
      subtitle={mode === 'offset' ? 'offset pagination: “skip N rows”' : 'cursor pagination: “after the last one I saw”'}
      status={
        <>
          <code>{log}</code>
          {summary && (
            <>
              <br />
              <span className={`dg-pill ${dupes.size || missed.length ? 'bad' : 'ok'}`}>{dupes.size || missed.length ? 'drift' : 'consistent'}</span>{' '}
              {summary}
            </>
          )}
        </>
      }
      controls={
        <>
          <ToggleGroup
            label="Pagination"
            value={mode}
            onChange={(m) => reset(m)}
            options={[
              { value: 'offset', label: 'Offset' },
              { value: 'cursor', label: 'Cursor' },
            ]}
          />
          <div className="dg-toggle">
            <span className="dg-label">Actions</span>
            <div className="dg-btn-group">
              <button type="button" className="dg-btn is-primary" aria-disabled={s.done} onClick={readPage}>
                {s.pages.length === 0 ? 'Read page 1' : 'Read next page'}
              </button>
              <button type="button" className="dg-btn" onClick={insert}>
                + New order arrives
              </button>
              <button type="button" className="dg-btn" aria-disabled={s.pages.length === 0} onClick={() => s.pages.length && remove()}>
                Delete a seen order
              </button>
              <button type="button" className="dg-btn" onClick={() => reset()}>
                Reset
              </button>
            </div>
          </div>
        </>
      }
    >
      <div className="pd">
        <div className="pd-col">
          <div className="dg-label">Table, newest first</div>
          <ol className="pd-rows" aria-label="Orders in the database, newest first">
            {s.rows.map((id, i) => (
              <li
                key={id}
                className={`pd-row${seenSet.has(id) ? ' is-seen' : ''}${dupes.has(id) ? ' is-dupe' : ''}${missed.includes(id) ? ' is-missed' : ''}${id >= 10 ? ' is-new' : ''}`}
              >
                <span className="pd-pos" aria-hidden="true">
                  {i}
                </span>
                ord_{id}
                {missed.includes(id) && <span className="pd-tag">skipped</span>}
                {mode === 'offset' && i === s.offset && !s.done && s.pages.length > 0 && (
                  <span className="pd-tag is-next">next page starts here</span>
                )}
              </li>
            ))}
          </ol>
        </div>
        <div className="pd-col">
          <div className="dg-label">What the client received</div>
          <ol className="pd-pages" aria-label="Pages received by the client">
            {s.pages.length === 0 && <li className="pd-empty">nothing yet</li>}
            {s.pages.map((p, pi) => (
              <li key={pi} className="pd-page">
                <span className="pd-page-n">page {pi + 1}</span>
                {p.map((id, k) => (
                  <span key={k} className={`pd-chip${dupes.has(id) && seen.indexOf(id) !== s.pages.slice(0, pi).flat().length + k ? ' is-dupe' : ''}`}>
                    ord_{id}
                  </span>
                ))}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </DiagramFrame>
  );
}
