import { useState } from 'react';
import DiagramFrame from './DiagramFrame';
import { ToggleGroup } from './shared';

type Style = 'rest' | 'grpc' | 'graphql' | 'sse' | 'ws' | 'webhook';

interface Info {
  label: string;
  wire: string;
  facts: [string, string][];
  best: string;
}

const STYLES: Record<Style, Info> = {
  rest: {
    label: 'REST',
    wire: `GET /orders/ord_1 HTTP/1.1
Host: api.example.com
Accept: application/json

HTTP/1.1 200 OK
Content-Type: application/json
ETag: "3"
Cache-Control: private, no-cache

{"id": "ord_1", "status": "pending", "total": 3000, ...}`,
    facts: [
      ['Transport', 'HTTP/1.1, 2 or 3'],
      ['Contract', 'OpenAPI (optional)'],
      ['Payload', 'JSON, human-readable'],
      ['Caching', 'Built in: GET, ETags, CDNs'],
      ['Browsers', 'Native'],
      ['Streaming', 'No (one request, one response)'],
    ],
    best: 'Public APIs, resource-shaped data, anything browsers, curl and caches should understand. The default.',
  },
  grpc: {
    label: 'gRPC',
    wire: `HTTP/2 stream 3
:method: POST
:path: /orders.v1.OrderService/GetOrder
content-type: application/grpc
te: trailers
DATA  [00 00 00 00 07] 0a 05 6f 72 64 5f 31        ← length-prefixed protobuf

:status: 200
content-type: application/grpc
DATA  [00 00 00 00 2a] 0a 05 6f 72 64 5f 31 12 ...
grpc-status: 0                                        ← status in trailers`,
    facts: [
      ['Transport', 'HTTP/2 only (always POST)'],
      ['Contract', '.proto file, required; code generated'],
      ['Payload', 'Protobuf binary: small and fast'],
      ['Caching', 'None from HTTP'],
      ['Browsers', 'Not directly (needs gRPC-Web + a proxy)'],
      ['Streaming', 'Client, server and bidirectional'],
    ],
    best: 'Service-to-service calls inside your own systems: strict contracts, low latency, streaming, many languages.',
  },
  graphql: {
    label: 'GraphQL',
    wire: `POST /graphql HTTP/1.1
Content-Type: application/json

{"query": "{ order(id: \\"ord_1\\") { status total customer { email } } }"}

HTTP/1.1 200 OK
Content-Type: application/json

{"data": {"order": {"status": "pending", "total": 3000,
          "customer": {"email": "ada@example.com"}}}}`,
    facts: [
      ['Transport', 'HTTP, usually one POST endpoint'],
      ['Contract', 'Schema (SDL), required'],
      ['Payload', 'JSON, exactly the fields asked for'],
      ['Caching', 'Hard: every query is a POST to one URL'],
      ['Browsers', 'Native'],
      ['Streaming', 'Subscriptions (over WebSockets)'],
    ],
    best: 'Many different clients (web, mobile) needing different slices of a connected data graph. Errors often come back as 200 with an "errors" array.',
  },
  sse: {
    label: 'SSE',
    wire: `GET /orders/events HTTP/1.1
Accept: text/event-stream
Last-Event-ID: 41

HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache

id: 42
event: order.created
data: {"id": "ord_7", "total": 3000}

: keep-alive
`,
    facts: [
      ['Transport', 'One long HTTP response'],
      ['Contract', 'Event names + JSON (convention)'],
      ['Payload', 'Text lines'],
      ['Caching', 'No'],
      ['Browsers', 'Native (EventSource), auto-reconnect'],
      ['Streaming', 'Server → client only'],
    ],
    best: 'Live updates to a browser or client: feeds, progress, notifications. Plain HTTP, so proxies and auth just work. Built in Lab A8.',
  },
  ws: {
    label: 'WebSocket',
    wire: `GET /live HTTP/1.1
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==

HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=

[binary frames both ways: no more HTTP]`,
    facts: [
      ['Transport', 'Starts as HTTP, then its own framing'],
      ['Contract', 'Whatever you design'],
      ['Payload', 'Text or binary messages'],
      ['Caching', 'No'],
      ['Browsers', 'Native'],
      ['Streaming', 'Both ways, full duplex'],
    ],
    best: 'Chat, collaborative editing, games: genuinely two-way, low-latency traffic. You rebuild request ids, errors and auth refresh yourself.',
  },
  webhook: {
    label: 'Webhook',
    wire: `POST /hooks HTTP/1.1                ← your server calls the client's
Host: client.example.org
Content-Type: application/json
webhook-id: msg_ref_1
webhook-timestamp: 1793487385
webhook-signature: v1,K5oZfz...

{"type": "refund.succeeded", "data": {...}}

HTTP/1.1 204 No Content`,
    facts: [
      ['Transport', 'HTTP, reversed direction'],
      ['Contract', 'Event types + payloads, documented'],
      ['Payload', 'JSON, signed'],
      ['Caching', 'No'],
      ['Browsers', 'No (needs a public server)'],
      ['Streaming', 'No: one event per request, retried'],
    ],
    best: 'Telling another company’s server that something happened. At-least-once, signed, retried (Lab A7).',
  },
};

export default function ApiStyles() {
  const [s, setS] = useState<Style>('rest');
  const info = STYLES[s];
  return (
    <DiagramFrame
      title="One order, six styles"
      subtitle="what goes over the wire"
      status={
        <>
          <strong>{info.label}:</strong> {info.best}
        </>
      }
      controls={
        <ToggleGroup
          label="Style"
          value={s}
          onChange={setS}
          options={(Object.keys(STYLES) as Style[]).map((k) => ({ value: k, label: STYLES[k].label }))}
        />
      }
    >
      <div className="as">
        <pre className="dg-code as-wire" tabIndex={0} aria-label={`${info.label} on the wire`}>
          <code>{info.wire}</code>
        </pre>
        <dl className="as-facts">
          {info.facts.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </DiagramFrame>
  );
}
