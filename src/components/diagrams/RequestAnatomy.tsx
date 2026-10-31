import { useState, type ReactNode } from 'react';
import DiagramFrame from './DiagramFrame';
import { ToggleGroup } from './shared';

type Seg = string | { t: string; k: string };
interface Part {
  name: string;
  layer: 'start line' | 'header' | 'framing' | 'body';
  text: ReactNode;
}

const REQUEST: Seg[][] = [
  [{ t: 'POST', k: 'method' }, ' ', { t: '/orders', k: 'target' }, ' ', { t: 'HTTP/1.1', k: 'version' }],
  [{ t: 'Host: api.example.com', k: 'host' }],
  [{ t: 'Content-Type: application/json', k: 'ctype' }],
  [{ t: 'Accept: application/json', k: 'accept' }],
  [{ t: 'Content-Length: 116', k: 'clen' }],
  [{ t: '', k: 'blank' }],
  ['{"customer": ', { t: '"ada@example.com"', k: 'customer' }, ', "currency": ', { t: '"EUR"', k: 'currency' }, ','],
  [' "items": [{"sku": "BOOK-42", "quantity": 2, ', { t: '"unitPrice": 1500', k: 'money' }, '}]}'],
];

const RESPONSE: Seg[][] = [
  [{ t: 'HTTP/1.1', k: 'version' }, ' ', { t: '201', k: 'code' }, ' ', { t: 'Created', k: 'reason' }],
  [{ t: 'Location: /orders/ord_1', k: 'location' }],
  [{ t: 'Content-Type: application/json', k: 'rctype' }],
  [{ t: 'Content-Length: 206', k: 'clen' }],
  [{ t: '', k: 'blank' }],
  ['{', { t: '"id": "ord_1"', k: 'id' }, ', "customer": "ada@example.com", "currency": "EUR",'],
  [' "items": [{"sku": "BOOK-42", "quantity": 2, "unitPrice": 1500}],'],
  [' ', { t: '"total": 3000', k: 'total' }, ', ', { t: '"status": "pending"', k: 'status' }, ','],
  [' ', { t: '"createdAt": "2026-10-31T22:22:17Z"', k: 'created' }, '}'],
];

const PARTS: Record<string, Part> = {
  method: { name: 'Method', layer: 'start line', text: <>What to do with the resource. POST here means “create a new order in this collection”. Module A1 covers what each method promises.</> },
  target: { name: 'Request target', layer: 'start line', text: <>Which resource. <code>/orders</code> names the collection of orders, a noun, not an action like <code>/createOrder</code>.</> },
  version: { name: 'Protocol version', layer: 'start line', text: <>HTTP/1.1 as plain text. HTTP/2 and HTTP/3 carry exactly the same meaning in binary frames (Part 6), so everything in this track applies to them too.</> },
  host: { name: 'Host', layer: 'header', text: <>Which site on that IP address. Mandatory in HTTP/1.1 and how one server hosts many APIs (concept 3.5).</> },
  ctype: { name: 'Content-Type', layer: 'header', text: <>What format the request body is in. Without it the server shouldn't guess; a strict API answers 415.</> },
  accept: { name: 'Accept', layer: 'header', text: <>What formats the client can read in the response. If the server can't produce any of them, the strict answer is 406.</> },
  clen: { name: 'Content-Length', layer: 'framing', text: <>How many bytes of body follow, so the receiver knows where this message ends and the next begins on a kept-alive connection (concept 3.6). Clients and servers set it for you.</> },
  blank: { name: 'Empty line', layer: 'framing', text: <>The <code>\r\n</code> on its own that ends the headers. Everything after it is body.</> },
  customer: { name: 'A client-owned field', layer: 'body', text: <>The client decides this value. The contract says which fields a client may set and which the server owns.</> },
  currency: { name: 'Currency code', layer: 'body', text: <>An ISO 4217 code. Money always travels with its currency.</> },
  money: { name: 'Money as an integer', layer: 'body', text: <>1500 means €15.00, in minor units (cents). Never send money as a float: <code>0.1 + 0.2</code> isn't <code>0.3</code> in binary floating point, and JSON parsers in some languages read every number as a double.</> },
  code: { name: 'Status code', layer: 'start line', text: <>The machine-readable outcome. 201 means “created”; clients branch on this number, never on the text after it.</> },
  reason: { name: 'Reason phrase', layer: 'start line', text: <>Human-readable decoration that clients must ignore. Tomcat leaves it out entirely (<code>HTTP/1.1 201 </code>), and HTTP/2 has no reason phrase at all.</> },
  location: { name: 'Location', layer: 'header', text: <>Where the new resource lives. A relative URL is allowed. The client can GET it right away.</> },
  rctype: { name: 'Content-Type', layer: 'header', text: <>The response body's format. It should match something the request's Accept allowed.</> },
  id: { name: 'Server-owned id', layer: 'body', text: <>The server chose it. Treat ids as opaque strings: clients shouldn't parse or construct them.</> },
  total: { name: 'Server-computed field', layer: 'body', text: <>Calculated from the items. If a client sent a total, the server would ignore it: never trust a client for a price.</> },
  status: { name: 'Server-set state', layer: 'body', text: <>Every new order starts as pending. Later the client can move it to cancelled, but not straight to anything else.</> },
  created: { name: 'Timestamp', layer: 'body', text: <>ISO 8601 in UTC, with the <code>Z</code>. Never send local times without an offset.</> },
};

const LAYER_TONE: Record<Part['layer'], string> = {
  'start line': 'info',
  header: 'ok',
  framing: 'muted',
  body: 'warn',
};

export default function RequestAnatomy() {
  const [view, setView] = useState<'request' | 'response'>('request');
  const [sel, setSel] = useState<string>('method');
  const lines = view === 'request' ? REQUEST : RESPONSE;
  const part = PARTS[sel];

  const switchView = (v: 'request' | 'response') => {
    setView(v);
    setSel(v === 'request' ? 'method' : 'code');
  };

  return (
    <DiagramFrame
      title="Anatomy of an API call"
      subtitle="click any part of the message"
      status={
        <>
          <span className={`dg-pill ${LAYER_TONE[part.layer]}`}>{part.layer}</span> <strong>{part.name}.</strong>{' '}
          {part.text}
        </>
      }
      controls={
        <ToggleGroup
          label="Message"
          value={view}
          onChange={switchView}
          options={[
            { value: 'request', label: 'Request: POST /orders' },
            { value: 'response', label: 'Response: 201 Created' },
          ]}
        />
      }
    >
      <div className="ra" role="group" aria-label={`Raw HTTP ${view}`}>
        {lines.map((line, li) => (
          <div key={li} className="ra-line">
            {line.map((seg, si) =>
              typeof seg === 'string' ? (
                <span key={si} className="ra-plain">
                  {seg}
                </span>
              ) : (
                <button
                  key={si}
                  type="button"
                  className={`ra-seg tone-${LAYER_TONE[PARTS[seg.k].layer]}${seg.t === '' ? ' is-blank' : ''}`}
                  aria-pressed={sel === seg.k}
                  aria-label={seg.t === '' ? 'Empty line (end of headers)' : `${PARTS[seg.k].name}: ${seg.t}`}
                  onClick={() => setSel(seg.k)}
                >
                  {seg.t === '' ? '↵ (empty line)' : seg.t}
                </button>
              ),
            )}
          </div>
        ))}
      </div>
    </DiagramFrame>
  );
}
