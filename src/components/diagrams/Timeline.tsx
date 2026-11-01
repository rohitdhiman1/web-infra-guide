import { useState } from 'react';
import DiagramFrame from './DiagramFrame';

export interface TimelineEvent {
  /** Shown in the year column, e.g. 1997 or "1997–99". */
  year: number | string;
  name: string;
  /** "main" entries get a solid dot; "context" entries (what shaped them) a hollow one. */
  kind: 'main' | 'context';
  short: string;
  detail: string;
  /** Optional: a message as it travels on the wire, shown when the entry is selected. */
  wire?: string;
}

export interface TimelineEra {
  name: string;
  range: string;
  /** Names of the events in this era, in order. */
  events: string[];
}

interface Props {
  title: string;
  subtitle: string;
  eras: TimelineEra[];
  events: TimelineEvent[];
  mainLabel: string;
  legend: string;
  initial?: string;
}

/** A vertical, era-grouped timeline. Each entry is a button; the selection shows its detail below. */
export default function Timeline({ title, subtitle, eras, events, mainLabel, legend, initial }: Props) {
  const [sel, setSel] = useState(initial ?? events[0].name);
  const ev = events.find((e) => e.name === sel) ?? events[0];
  return (
    <DiagramFrame
      title={title}
      subtitle={subtitle}
      status={
        <div className="dg-detail">
          <div>
            <span className={`dg-pill ${ev.kind === 'main' ? 'info' : 'muted'}`}>
              {ev.year} · {ev.kind === 'main' ? mainLabel : 'context'}
            </span>{' '}
            <strong>{ev.name}.</strong> {ev.detail}
          </div>
          {ev.wire && (
            <pre className="dg-code tl-wire" tabIndex={0} aria-label={`${ev.name} on the wire`}>
              <code>{ev.wire}</code>
            </pre>
          )}
        </div>
      }
    >
      <div className="tl">
        {eras.map((era) => (
          <section key={era.name} className="tl-era" aria-label={`${era.name}, ${era.range}`}>
            <h4 className="tl-era-name">
              {era.name} <span>{era.range}</span>
            </h4>
            <ol className="tl-list">
              {era.events.map((name) => {
                const e = events.find((x) => x.name === name);
                if (!e) return null;
                return (
                  <li key={e.name} className={`tl-item is-${e.kind === 'main' ? 'style' : 'context'}`}>
                    <span className="tl-year" aria-hidden="true">
                      {e.year}
                    </span>
                    <span className="tl-dot" aria-hidden="true" />
                    <button type="button" className="tl-card" aria-pressed={sel === e.name} onClick={() => setSel(e.name)}>
                      <span className="tl-name">{e.name}</span>
                      <span className="tl-short">{e.short}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
      <p className="ra-legend">{legend}</p>
    </DiagramFrame>
  );
}
