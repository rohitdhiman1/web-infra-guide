import { useState } from 'react';
import DiagramFrame from './DiagramFrame';

interface Event {
  year: number;
  name: string;
  kind: 'style' | 'context';
  short: string;
  detail: string;
}

// Dates are when each style was published or released publicly.
const EVENTS: Event[] = [
  { year: 1998, name: 'XML-RPC', kind: 'style', short: 'Remote calls as XML over HTTP POST', detail: 'Created by Dave Winer of UserLand with Microsoft. A function name and parameters in XML, POSTed to one URL. SOAP grew directly out of it.' },
  { year: 2000, name: 'SOAP', kind: 'style', short: 'XML envelopes, WSDL contracts, WS-* standards', detail: 'SOAP 1.1 was published as a W3C Note in 2000 and SOAP 1.2 became a W3C Recommendation in 2003. It dominated enterprise integration through the 2000s, and is still common in banking, payments and telecoms.' },
  { year: 2000, name: 'REST', kind: 'style', short: 'Roy Fielding’s dissertation describes the style', detail: 'Fielding described REST as the architectural style behind the web itself. JSON-over-HTTP “REST APIs” took off from the mid-2000s, as Web 2.0 sites opened public APIs.' },
  { year: 2001, name: 'JSON', kind: 'context', short: 'Douglas Crockford popularises JSON', detail: 'A lighter alternative to XML that browsers could read natively. Standardised as RFC 4627 in 2006 (today RFC 8259), it became the default payload of web APIs.' },
  { year: 2005, name: 'JSON-RPC', kind: 'style', short: 'XML-RPC’s idea, with JSON', detail: 'Method name and parameters as a JSON object. Still used today, for example by Ethereum nodes and the Language Server Protocol.' },
  { year: 2006, name: 'Server-Sent Events', kind: 'style', short: 'A server keeps pushing events down one response', detail: 'First shipped in the Opera browser in 2006, then standardised as part of HTML (EventSource). Built on a plain long-lived HTTP response.' },
  { year: 2007, name: 'Webhooks', kind: 'style', short: 'Jeff Lindsay names the pattern', detail: 'User-defined HTTP callbacks: a service POSTs events to a URL you give it. Popularised by GitHub, PayPal and later Stripe.' },
  { year: 2011, name: 'WebSocket', kind: 'style', short: 'RFC 6455: full-duplex messages after an HTTP upgrade', detail: 'Browsers had been experimenting since about 2009. The IETF published RFC 6455 in December 2011, making two-way, low-latency browser connections standard.' },
  { year: 2011, name: 'Swagger', kind: 'context', short: 'Describing REST APIs in a machine-readable file', detail: 'Created at Wordnik in 2011, donated to the OpenAPI Initiative in 2015, and renamed the OpenAPI Specification in 2016 (version 3.0 followed in 2017).' },
  { year: 2015, name: 'HTTP/2', kind: 'context', short: 'Binary framing and multiplexed streams', detail: 'RFC 7540, May 2015. Its streams and trailers are what gRPC is built on.' },
  { year: 2015, name: 'GraphQL', kind: 'style', short: 'Facebook open-sources its query language', detail: 'Built inside Facebook in 2012 for its mobile apps, released publicly in 2015, and moved to the GraphQL Foundation in 2018.' },
  { year: 2015, name: 'gRPC', kind: 'style', short: 'Google open-sources its RPC framework', detail: 'Grew out of Stubby, Google’s internal RPC system used since the early 2000s. Protobuf messages over HTTP/2; version 1.0 shipped in 2016.' },
];

const ERAS = [
  { from: 1998, to: 2004, name: 'The XML era' },
  { from: 2005, to: 2010, name: 'JSON and the open web' },
  { from: 2011, to: 2015, name: 'Real-time and typed contracts' },
];

export default function ApiTimeline() {
  const [sel, setSel] = useState(0);
  const ev = EVENTS[sel];
  return (
    <DiagramFrame
      title="Where each style came from"
      subtitle="1998 to 2015; click any entry"
      status={
        <>
          <span className={`dg-pill ${ev.kind === 'style' ? 'info' : 'muted'}`}>{ev.kind === 'style' ? `${ev.year} · API style` : `${ev.year} · context`}</span>{' '}
          <strong>{ev.name}.</strong> {ev.detail}
        </>
      }
    >
      <div className="tl">
        {ERAS.map((era) => (
          <section key={era.name} className="tl-era" aria-label={`${era.name}, ${era.from} to ${era.to}`}>
            <h4 className="tl-era-name">
              {era.name} <span>{era.from}–{era.to}</span>
            </h4>
            <ol className="tl-list">
              {EVENTS.map((e, i) =>
                e.year >= era.from && e.year <= era.to ? (
                  <li key={e.name} className={`tl-item is-${e.kind}`}>
                    <span className="tl-year" aria-hidden="true">
                      {e.year}
                    </span>
                    <span className="tl-dot" aria-hidden="true" />
                    <button type="button" className="tl-card" aria-pressed={sel === i} onClick={() => setSel(i)}>
                      <span className="tl-name">{e.name}</span>
                      <span className="tl-short">{e.short}</span>
                    </button>
                  </li>
                ) : null,
              )}
            </ol>
          </section>
        ))}
      </div>
      <p className="ra-legend">Solid dots are API styles; hollow dots are the technologies that shaped them.</p>
    </DiagramFrame>
  );
}
