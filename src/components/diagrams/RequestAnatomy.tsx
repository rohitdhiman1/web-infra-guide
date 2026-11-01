import { useState, type ReactNode } from 'react';
import DiagramFrame from './DiagramFrame';
import { ToggleGroup } from './shared';

/** A piece of a message line: plain text, a clickable part, or a "ghost" (a part this exchange doesn't have). */
type Seg = string | { t: string; k: string; ghost?: boolean };
type Exchange = 'post' | 'get';
type Side = 'request' | 'response';

interface Part {
  name: string;
  layer: 'start line' | 'header' | 'framing' | 'body';
  text: ReactNode;
  /** How this part differs between the POST and the GET exchange. */
  diff?: ReactNode;
}

const MESSAGES: Record<Exchange, Record<Side, Seg[][]>> = {
  post: {
    request: [
      [{ t: 'POST', k: 'method' }, ' ', { t: '/orders', k: 'target' }, ' ', { t: 'HTTP/1.1', k: 'version' }],
      [{ t: 'Host: api.example.com', k: 'host' }],
      [{ t: 'Content-Type: application/json', k: 'ctype' }],
      [{ t: 'Accept: application/json', k: 'accept' }],
      [{ t: 'Content-Length: 116', k: 'clen' }],
      [{ t: '', k: 'blank' }],
      ['{"customer": ', { t: '"ada@example.com"', k: 'customer' }, ', "currency": ', { t: '"EUR"', k: 'currency' }, ','],
      [' "items": [{"sku": "BOOK-42", "quantity": 2, ', { t: '"unitPrice": 1500', k: 'money' }, '}]}'],
    ],
    response: [
      [{ t: 'HTTP/1.1', k: 'version' }, ' ', { t: '201', k: 'code' }, ' ', { t: 'Created', k: 'reason' }],
      [{ t: 'Location: /orders/ord_1', k: 'location' }],
      [{ t: 'Content-Type: application/json', k: 'rctype' }],
      [{ t: 'Content-Length: 206', k: 'rclen' }],
      [{ t: '', k: 'blank' }],
      ['{', { t: '"id": "ord_1"', k: 'id' }, ', "customer": "ada@example.com", "currency": "EUR",'],
      [' "items": [{"sku": "BOOK-42", "quantity": 2, "unitPrice": 1500}],'],
      [' ', { t: '"total": 3000', k: 'total' }, ', ', { t: '"status": "pending"', k: 'status' }, ','],
      [' ', { t: '"createdAt": "2026-10-31T22:22:17Z"', k: 'created' }, '}'],
    ],
  },
  get: {
    request: [
      [{ t: 'GET', k: 'method' }, ' ', { t: '/orders/ord_1', k: 'target' }, ' ', { t: 'HTTP/1.1', k: 'version' }],
      [{ t: 'Host: api.example.com', k: 'host' }],
      [{ t: 'no Content-Type', k: 'ctype', ghost: true }],
      [{ t: 'Accept: application/json', k: 'accept' }],
      [{ t: 'no Content-Length', k: 'clen', ghost: true }],
      [{ t: '', k: 'blank' }],
      [{ t: 'no body', k: 'nobody', ghost: true }],
    ],
    response: [
      [{ t: 'HTTP/1.1', k: 'version' }, ' ', { t: '200', k: 'code' }, ' ', { t: 'OK', k: 'reason' }],
      [{ t: 'no Location', k: 'location', ghost: true }],
      [{ t: 'Content-Type: application/json', k: 'rctype' }],
      [{ t: 'Content-Length: 206', k: 'rclen' }],
      [{ t: '', k: 'blank' }],
      ['{', { t: '"id": "ord_1"', k: 'id' }, ', "customer": "ada@example.com", "currency": "EUR",'],
      [' "items": [{"sku": "BOOK-42", "quantity": 2, "unitPrice": 1500}],'],
      [' ', { t: '"total": 3000', k: 'total' }, ', ', { t: '"status": "pending"', k: 'status' }, ','],
      [' ', { t: '"createdAt": "2026-10-31T22:22:17Z"', k: 'created' }, '}'],
    ],
  },
};

/** Explanations, per exchange where the meaning differs. */
const PARTS: Record<Exchange, Record<string, Part>> = {
  post: {},
  get: {},
};

const shared: Record<string, Part> = {
  version: { name: 'Protocol version', layer: 'start line', text: <>HTTP/1.1 as plain text. HTTP/2 and HTTP/3 carry exactly the same meaning in binary frames (Part 6), so everything in this track applies to them too.</>, diff: <>Identical in both exchanges.</> },
  host: { name: 'Host', layer: 'header', text: <>Which site on that IP address. Mandatory in HTTP/1.1 and how one server hosts many APIs (concept 3.5).</>, diff: <>Identical: every HTTP/1.1 request needs it.</> },
  accept: { name: 'Accept', layer: 'header', text: <>What formats the client can read in the response. If the server can't produce any of them, the strict answer is 406.</>, diff: <>Identical: both expect JSON back, whatever they send.</> },
  blank: { name: 'Empty line', layer: 'framing', text: <>The <code>\r\n</code> on its own that ends the headers. Everything after it is body.</>, diff: <>Always there, even when no body follows: it's how the receiver knows the headers are finished.</> },
  rctype: { name: 'Content-Type', layer: 'header', text: <>The response body's format. It should match something the request's Accept allowed.</>, diff: <>Identical: both responses carry the same JSON representation of the order.</> },
  rclen: { name: 'Content-Length', layer: 'framing', text: <>How many bytes of body follow (concept 3.6). Clients and servers set it for you.</>, diff: <>Identical, because both responses return the same 206-byte representation of the same order.</> },
  id: { name: 'Server-owned id', layer: 'body', text: <>The server chose it. Treat ids as opaque strings: clients shouldn't parse or construct them.</>, diff: <>The same order, so the same id. With POST it's news to the client; with GET the client already had it in the URL.</> },
  total: { name: 'Server-computed field', layer: 'body', text: <>Calculated from the items. If a client sent a total, the server would ignore it: never trust a client for a price.</>, diff: <>Same value: GET returns the order exactly as the POST stored it.</> },
  status: { name: 'Server-set state', layer: 'body', text: <>Every new order starts as pending. Later the client can move it to cancelled, but not straight to anything else.</>, diff: <>Same: nothing has changed since it was created. Reading never changes state.</> },
  created: { name: 'Timestamp', layer: 'body', text: <>ISO 8601 in UTC, with the <code>Z</code>. Never send local times without an offset.</>, diff: <>Same: it records when the POST happened, not when you read it.</> },
};

Object.assign(PARTS.post, shared, {
  method: { name: 'Method', layer: 'start line', text: <>POST asks the collection to <strong>create</strong> something new. It isn't safe (it changes server state) and isn't idempotent (send it twice, get two orders).</>, diff: <>GET only <em>reads</em>. It's safe and idempotent, so browsers, caches and proxies may repeat it freely. Never repeat a POST blindly (module A3).</> },
  target: { name: 'Request target', layer: 'start line', text: <><code>/orders</code> names the <strong>collection</strong>: you POST to the collection, and the server picks the new order's id.</>, diff: <>GET names one <strong>member</strong>, <code>/orders/ord_1</code>: you read a specific resource, so you must already know its id.</> },
  ctype: { name: 'Content-Type', layer: 'header', text: <>What format the request body is in. Without it the server shouldn't guess; a strict API answers 415.</>, diff: <>The GET request has no body, so it has nothing to describe: no Content-Type.</> },
  clen: { name: 'Content-Length', layer: 'framing', text: <>How many bytes of body follow, so the receiver knows where this message ends on a kept-alive connection (concept 3.6).</>, diff: <>No body in the GET, so no length either.</> },
  customer: { name: 'A client-owned field', layer: 'body', text: <>The client decides this value. The contract says which fields a client may set and which the server owns.</>, diff: <>A GET sends no fields at all: everything it needs is in the URL.</> },
  currency: { name: 'Currency code', layer: 'body', text: <>An ISO 4217 code. Money always travels with its currency.</>, diff: <>Not in the GET: there's no body to put it in.</> },
  money: { name: 'Money as an integer', layer: 'body', text: <>1500 means €15.00, in minor units (cents). Never send money as a float: <code>0.1 + 0.2</code> isn't <code>0.3</code> in binary floating point.</>, diff: <>Not in the GET request, but the same field comes back in both responses.</> },
  code: { name: 'Status code', layer: 'start line', text: <><strong>201 Created</strong>: something new exists now. Clients branch on this number, never on the text after it.</>, diff: <>The GET answers <strong>200 OK</strong>: here is what you asked for. Nothing was created.</> },
  reason: { name: 'Reason phrase', layer: 'start line', text: <>Human-readable decoration that clients must ignore. Tomcat leaves it out entirely, and HTTP/2 has no reason phrase at all.</>, diff: <>“Created” vs “OK”: different words, equally meaningless to code.</> },
  location: { name: 'Location', layer: 'header', text: <>Where the new resource lives. A relative URL is allowed. The client can GET it right away, which is exactly the other exchange.</>, diff: <>The GET response has no Location: nothing new was created, and the client already knows the URL.</> },
} satisfies Record<string, Part>);

Object.assign(PARTS.get, shared, {
  method: { name: 'Method', layer: 'start line', text: <>GET <strong>reads</strong> a resource. It's safe (changes nothing) and idempotent (repeat it and the result is the same), so browsers, caches and proxies may repeat it freely.</>, diff: <>POST creates instead: not safe, not idempotent. Sending a POST twice makes two orders.</> },
  target: { name: 'Request target', layer: 'start line', text: <><code>/orders/ord_1</code> names one <strong>member</strong> of the collection. You must already know its id, usually from a Location header or a list.</>, diff: <>POST goes to the <strong>collection</strong>, <code>/orders</code>, because the order doesn't exist yet and the server will choose its id.</> },
  ctype: { name: 'No Content-Type', layer: 'header', text: <>A GET has no body, so there's nothing to describe. Sending Content-Type on a bodiless request is harmless but meaningless.</>, diff: <>The POST says <code>Content-Type: application/json</code> because it carries a JSON body.</> },
  clen: { name: 'No Content-Length', layer: 'framing', text: <>No body means no length. The empty line still ends the headers, and the message is complete there.</>, diff: <>The POST sends <code>Content-Length: 116</code> so the server knows exactly where its body ends.</> },
  nobody: { name: 'No body', layer: 'body', text: <>Everything a GET needs is in the URL and headers. Filters go in the query string (<code>?status=pending</code>), never in a body: many servers, proxies and caches ignore or reject a GET body.</>, diff: <>The POST body carries the new order: customer, currency and items. Only fields the client owns.</> },
  code: { name: 'Status code', layer: 'start line', text: <><strong>200 OK</strong>: here is the resource you asked for. Clients branch on this number, never on the text after it.</>, diff: <>The POST got <strong>201 Created</strong>, because it brought something new into existence.</> },
  reason: { name: 'Reason phrase', layer: 'start line', text: <>Human-readable decoration that clients must ignore. HTTP/2 has no reason phrase at all.</>, diff: <>“OK” vs “Created”: different words, equally meaningless to code.</> },
  location: { name: 'No Location', layer: 'header', text: <>Nothing was created, so there's nowhere new to point to. The client already knows the URL: it just used it.</>, diff: <>The POST's 201 response carries <code>Location: /orders/ord_1</code>: the very URL this GET requests.</> },
} satisfies Record<string, Part>);

const LAYER_TONE: Record<Part['layer'], string> = {
  'start line': 'info',
  header: 'ok',
  framing: 'muted',
  body: 'warn',
};

const FIRST: Record<Side, string> = { request: 'method', response: 'code' };

export default function RequestAnatomy() {
  const [exchange, setExchange] = useState<Exchange>('post');
  const [side, setSide] = useState<Side>('request');
  const [sel, setSel] = useState<string>('method');
  const lines = MESSAGES[exchange][side];
  const part = PARTS[exchange][sel] ?? PARTS[exchange][FIRST[side]];
  const other = exchange === 'post' ? 'GET' : 'POST';

  // Keep the same part selected when switching exchange, so the difference is easy to see.
  const keysIn = (e: Exchange, s: Side) =>
    MESSAGES[e][s].flat().flatMap((seg) => (typeof seg === 'string' ? [] : [seg.k]));
  const switchExchange = (e: Exchange) => {
    setExchange(e);
    if (!keysIn(e, side).includes(sel)) setSel(FIRST[side]);
  };
  const switchSide = (s: Side) => {
    setSide(s);
    setSel(FIRST[s]);
  };

  return (
    <DiagramFrame
      title="Anatomy of an API call"
      subtitle="click any part; switch between POST and GET to compare"
      status={
        <div className="ra-status">
          <div>
            <span className={`dg-pill ${LAYER_TONE[part.layer]}`}>{part.layer}</span> <strong>{part.name}.</strong>{' '}
            {part.text}
          </div>
          {part.diff && (
            <div className="ra-diff">
              <span className="ra-diff-label">vs {other}</span> {part.diff}
            </div>
          )}
        </div>
      }
      controls={
        <>
          <ToggleGroup
            label="Exchange"
            value={exchange}
            onChange={switchExchange}
            options={[
              { value: 'post', label: 'POST: create an order' },
              { value: 'get', label: 'GET: read it back' },
            ]}
          />
          <ToggleGroup
            label="Message"
            value={side}
            onChange={switchSide}
            options={[
              { value: 'request', label: 'Request' },
              { value: 'response', label: exchange === 'post' ? 'Response: 201 Created' : 'Response: 200 OK' },
            ]}
          />
        </>
      }
    >
      <div className="ra" role="group" aria-label={`Raw HTTP ${exchange.toUpperCase()} ${side}`}>
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
                  className={`ra-seg tone-${LAYER_TONE[PARTS[exchange][seg.k].layer]}${seg.t === '' ? ' is-blank' : ''}${seg.ghost ? ' is-ghost' : ''}`}
                  aria-pressed={sel === seg.k}
                  aria-label={
                    seg.t === '' ? 'Empty line (end of headers)' : `${PARTS[exchange][seg.k].name}${seg.ghost ? '' : `: ${seg.t}`}`
                  }
                  onClick={() => setSel(seg.k)}
                >
                  {seg.t === '' ? '↵ (empty line)' : seg.ghost ? `— ${seg.t} —` : seg.t}
                </button>
              ),
            )}
          </div>
        ))}
      </div>
      <p className="ra-legend">
        {exchange === 'get'
          ? 'Faded lines are parts the POST had and this GET doesn’t. Click them to see why.'
          : 'Switch to GET to see which parts disappear when nothing is being sent.'}
      </p>
    </DiagramFrame>
  );
}
