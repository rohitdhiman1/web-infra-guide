import Timeline, { type TimelineEra, type TimelineEvent } from './Timeline';

// Dates are when each style was published or released publicly.
const EVENTS: TimelineEvent[] = [
  { year: 1998, name: 'XML-RPC', kind: 'main', short: 'Remote calls as XML over HTTP POST', detail: 'Created by Dave Winer of UserLand with Microsoft. A function name and parameters in XML, POSTed to one URL. SOAP grew directly out of it.' },
  { year: 2000, name: 'SOAP', kind: 'main', short: 'XML envelopes, WSDL contracts, WS-* standards', detail: 'SOAP 1.1 was published as a W3C Note in 2000 and SOAP 1.2 became a W3C Recommendation in 2003. It dominated enterprise integration through the 2000s, and is still common in banking, payments and telecoms.' },
  { year: 2000, name: 'REST', kind: 'main', short: 'Roy Fielding’s dissertation describes the style', detail: 'Fielding described REST as the architectural style behind the web itself. JSON-over-HTTP “REST APIs” took off from the mid-2000s, as Web 2.0 sites opened public APIs.' },
  { year: 2001, name: 'JSON', kind: 'context', short: 'Douglas Crockford popularises JSON', detail: 'A lighter alternative to XML that browsers could read natively. Standardised as RFC 4627 in 2006 (today RFC 8259), it became the default payload of web APIs.' },
  { year: 2005, name: 'JSON-RPC', kind: 'main', short: 'XML-RPC’s idea, with JSON', detail: 'Method name and parameters as a JSON object. Still used today, for example by Ethereum nodes and the Language Server Protocol.' },
  { year: 2006, name: 'Server-Sent Events', kind: 'main', short: 'A server keeps pushing events down one response', detail: 'First shipped in the Opera browser in 2006, then standardised as part of HTML (EventSource). Built on a plain long-lived HTTP response.' },
  { year: 2007, name: 'Webhooks', kind: 'main', short: 'Jeff Lindsay names the pattern', detail: 'User-defined HTTP callbacks: a service POSTs events to a URL you give it. Popularised by GitHub, PayPal and later Stripe.' },
  { year: 2011, name: 'WebSocket', kind: 'main', short: 'RFC 6455: full-duplex messages after an HTTP upgrade', detail: 'Browsers had been experimenting since about 2009. The IETF published RFC 6455 in December 2011, making two-way, low-latency browser connections standard.' },
  { year: 2011, name: 'Swagger', kind: 'context', short: 'Describing REST APIs in a machine-readable file', detail: 'Created at Wordnik in 2011, donated to the OpenAPI Initiative in 2015, and renamed the OpenAPI Specification in 2016 (version 3.0 followed in 2017).' },
  { year: 2015, name: 'HTTP/2', kind: 'context', short: 'Binary framing and multiplexed streams', detail: 'RFC 7540, May 2015. Its streams and trailers are what gRPC is built on.' },
  { year: 2015, name: 'GraphQL', kind: 'main', short: 'Facebook open-sources its query language', detail: 'Built inside Facebook in 2012 for its mobile apps, released publicly in 2015, and moved to the GraphQL Foundation in 2018.' },
  { year: 2015, name: 'gRPC', kind: 'main', short: 'Google open-sources its RPC framework', detail: 'Grew out of Stubby, Google’s internal RPC system used since the early 2000s. Protobuf messages over HTTP/2; version 1.0 shipped in 2016.' },
];

const ERAS: TimelineEra[] = [
  { name: 'The XML era', range: '1998–2004', events: ['XML-RPC', 'SOAP', 'REST', 'JSON'] },
  { name: 'JSON and the open web', range: '2005–2010', events: ['JSON-RPC', 'Server-Sent Events', 'Webhooks'] },
  { name: 'Real-time and typed contracts', range: '2011–2015', events: ['WebSocket', 'Swagger', 'HTTP/2', 'GraphQL', 'gRPC'] },
];

export default function ApiTimeline() {
  return (
    <Timeline
      title="Where each style came from"
      subtitle="1998 to 2015; click any entry"
      eras={ERAS}
      events={EVENTS}
      mainLabel="API style"
      legend="Solid dots are API styles; hollow dots are the technologies that shaped them."
    />
  );
}
