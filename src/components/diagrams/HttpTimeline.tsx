import Timeline, { type TimelineEra, type TimelineEvent } from './Timeline';

// Dates are when each version was published (RFC dates) or first released.
const EVENTS: TimelineEvent[] = [
  {
    year: 1989, name: 'The web is proposed', kind: 'context',
    short: 'Tim Berners-Lee’s proposal at CERN',
    detail: 'A system of linked documents served over the network. By the end of 1990 he had the first server, browser and the protocol to connect them running.',
  },
  {
    year: 1991, name: 'HTTP/0.9', kind: 'main',
    short: 'One line in, an HTML page out',
    detail: 'The original “one-line protocol”: only GET, no headers, no status codes, only HTML, and the server closed the connection to say the response was over. It was never an RFC; it was later named 0.9 to tell it apart from 1.0.',
    wire: `GET /orders.html

<html>…the whole page…</html>
(connection closes: that's how you know it ended)`,
  },
  {
    year: 1995, name: 'SSL and HTTPS', kind: 'context',
    short: 'Netscape wraps HTTP in encryption',
    detail: 'SSL 2.0 shipped with Netscape Navigator in 1995, and https:// meant HTTP inside SSL. The IETF took it over as TLS 1.0 in 1999 (RFC 2246). Part 5 covers TLS.',
  },
  {
    year: 1996, name: 'HTTP/1.0', kind: 'main',
    short: 'RFC 1945: headers, status codes, any content type',
    detail: 'Documented common practice rather than defining a strict standard. Added a version on the request line, headers, status codes, Content-Type (so images and more, not just HTML), and POST and HEAD. Still one request per TCP connection by default.',
    wire: `GET /orders/ord_1 HTTP/1.0
Accept: application/json

HTTP/1.0 200 OK
Content-Type: application/json
Content-Length: 206

{"id": "ord_1", ...}
(the connection closes after every response)`,
  },
  {
    year: 1997, name: 'HTTP/1.1', kind: 'main',
    short: 'RFC 2068, then RFC 2616: the version this Part teaches',
    detail: 'Persistent connections by default (3.8), a mandatory Host header so one IP can serve many sites (3.5), chunked transfer encoding (3.7), real caching with Cache-Control and ETags (3.11), and PUT, DELETE, OPTIONS. RFC 2068 came in 1997; RFC 2616 in 1999 was the version the web ran on for 15 years.',
    wire: `GET /orders/ord_1 HTTP/1.1
Host: api.example.com
Accept: application/json

HTTP/1.1 200 OK
Content-Type: application/json
Content-Length: 206
ETag: "3"

{"id": "ord_1", ...}
(the connection stays open for the next request)`,
  },
  {
    year: 2009, name: 'SPDY', kind: 'context',
    short: 'Google experiments with a faster HTTP',
    detail: 'Binary framing, many requests multiplexed over one connection, compressed headers. It proved the ideas in Chrome and on Google’s servers, and became the starting point for HTTP/2.',
  },
  {
    year: 2014, name: 'HTTP/1.1 rewritten', kind: 'context',
    short: 'RFC 7230–7235 replace RFC 2616',
    detail: 'The single RFC 2616 was split into six clearer documents (message syntax, semantics, conditional requests, ranges, caching, authentication), fixing years of ambiguity. Same protocol, better specification.',
  },
  {
    year: 2015, name: 'HTTP/2', kind: 'main',
    short: 'RFC 7540: binary frames, multiplexed streams',
    detail: 'The same methods, headers and status codes, carried in binary frames on numbered streams over one TCP connection, with compressed headers (HPACK). It fixes HTTP-level head-of-line blocking (3.9), but one lost TCP packet still stalls every stream. Part 6 covers it.',
    wire: `(one TLS connection, many streams at once)
HEADERS  stream 1
  :method GET
  :path /orders/ord_1
  :authority api.example.com
HEADERS  stream 3   (ord_2, in parallel)
HEADERS  stream 1
  :status 200
DATA     stream 1   {"id": "ord_1", …}
DATA     stream 3   …`,
  },
  {
    year: 2018, name: 'TLS 1.3', kind: 'context',
    short: 'RFC 8446: a faster, simpler handshake',
    detail: 'One round trip instead of two, and only modern ciphers with forward secrecy. HTTP/3 builds its handshake on it. Part 5 walks through it.',
  },
  {
    year: 2021, name: 'HTTP/3 and QUIC', kind: 'main',
    short: 'RFC 9000 (QUIC, 2021) and RFC 9114 (HTTP/3, 2022)',
    detail: 'QUIC moves the transport to UDP: streams are independent, so one lost packet only delays its own stream, the TLS 1.3 handshake is built in, and connections survive a change of network (Wi-Fi to mobile). HTTP/3 maps HTTP onto QUIC streams. Google started QUIC around 2012.',
    wire: `(UDP; QUIC streams, TLS 1.3 built in)
HEADERS  stream 0
  :method GET
  :path /orders/ord_1
  :authority api.example.com
HEADERS  stream 0
  :status 200
DATA     stream 0   {"id": "ord_1", …}
(a lost packet on stream 4
 doesn't delay stream 0)`,
  },
  {
    year: 2022, name: 'RFC 9110 family', kind: 'context',
    short: 'One meaning, three framings',
    detail: 'In June 2022 HTTP was reorganised: RFC 9110 defines the semantics shared by every version (methods, status codes, headers), RFC 9111 caching, and RFC 9112, 9113 and 9114 define how HTTP/1.1, HTTP/2 and HTTP/3 carry them. That’s why this Part says HTTP/2 and HTTP/3 are “the same meaning, different framing”.',
  },
];

const ERAS: TimelineEra[] = [
  { name: 'Birth of the web', range: '1989–1996', events: ['The web is proposed', 'HTTP/0.9', 'SSL and HTTPS', 'HTTP/1.0'] },
  { name: 'The HTTP/1.1 era', range: '1997–2014', events: ['HTTP/1.1', 'SPDY', 'HTTP/1.1 rewritten'] },
  { name: 'Binary and beyond TCP', range: '2015–2022', events: ['HTTP/2', 'TLS 1.3', 'HTTP/3 and QUIC', 'RFC 9110 family'] },
];

export default function HttpTimeline() {
  return (
    <Timeline
      title="How HTTP got here"
      subtitle="1989 to 2022; click a version to see a request on the wire"
      eras={ERAS}
      events={EVENTS}
      initial="HTTP/1.1"
      mainLabel="HTTP version"
      legend="Solid dots are HTTP versions; hollow dots are the events around them."
    />
  );
}
