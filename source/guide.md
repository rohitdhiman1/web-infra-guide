# Web Servers, HTTPS & nginx — Concept Map

Oct 25, 2026 · @Rohit Dhiman

## Contents

**Start here**

- [How to use this guide](#mxyrjhrn9ys.63)
  - [The topics that give you chills, and where each one is tamed](#mxyrjhrn9ys.44675)

**Phase 1 — Foundations**

- [Part 1 — Networking foundations](#mxyrjhrn9ys.1321) · layer stack, TCP stepper, DNS stepper
  - [DNS records you must know](#mxyrjhrn9ys.56487)
- [Part 2 — The Linux layer](#mxyrjhrn9ys.4173)
- [Part 3 — HTTP/1.1 in depth](#mxyrjhrn9ys.6815)

**Phase 2 — Build a server**

- [Part 4 — Building raw web servers](#mxyrjhrn9ys.10485) · concurrency simulator

**Phase 3 — Secure it**

- [Part 5 — TLS and HTTPS](#mxyrjhrn9ys.13518) · chain of trust, TLS 1.3 stepper, termination modes
- [Part 6 — HTTP/2 and HTTP/3](#mxyrjhrn9ys.17330) · head-of-line blocking simulator

**Phase 4 — Master nginx**

- [Part 7 — nginx core](#mxyrjhrn9ys.19408) · location matching simulator
- [One hostname, three checks — DNS, TLS and nginx](#mxyrjhrn9ys.58036) · hostname simulator
- [Part 8 — nginx as a reverse proxy](#mxyrjhrn9ys.23001) · where each error code comes from
- [Part 9 — Load balancing](#mxyrjhrn9ys.26239) · failover simulator
- [Part 10 — Caching, performance and security hardening](#mxyrjhrn9ys.29393) · cache and rate limiting simulators

**Phase 5 — Production**

- [Part 11 — Application servers: WSGI, ASGI, Gunicorn, Uvicorn](#mxyrjhrn9ys.33019) · nginx buffering simulator
  - [The Java side: Tomcat, Jetty, Netty and virtual threads](#mxyrjhrn9ys.60670) · Tomcat simulator
- [Part 12 — Observability and debugging](#mxyrjhrn9ys.35891)
- [Field guide — where to start looking when something breaks](#mxyrjhrn9ys.45969)
  - [The method](#mxyrjhrn9ys.46291) · debugging flow
  - [Symptom → layer → first command](#mxyrjhrn9ys.46920)
  - [Is TCP dropping packets?](#mxyrjhrn9ys.49207)
- [Part 13 — The edge: CDNs, cloud load balancers and multiple zones](#mxyrjhrn9ys.38248) · request path stepper
- [Part 14 — Deploying and operating nginx in production](#mxyrjhrn9ys.68548)
- [Part 15 — Capstone: build it, break it, rebuild it](#mxyrjhrn9ys.71888) · failure drills

**Reference**

- [Learning path and milestones](#mxyrjhrn9ys.43342) · roadmap
- [Toolkit and resources](#mxyrjhrn9ys.41274)

## How to use this guide

Mastery here means you can explain what happens to a request at every layer, from the first TCP packet to the app's response, and fix it when it breaks. The guide climbs that stack in 15 parts, roughly 16 to 18 weeks at 6 to 8 hours a week.

Each part has three pieces:

- **Concepts:** what to understand, numbered so you can track them (1.1, 1.2 and so on).
- **In the sandbox:** a lab sized to fit one 6-hour cloud window.
- **You've got it when:** a check you can answer or demonstrate without notes.

**Working with short-lived sandboxes.** Your sandboxes die after about 6 hours, so treat every VM as disposable from day one. Keep all configs, scripts and notes in a Git repo. Put each lab's setup into a cloud-init or user-data script so you can rebuild in minutes. This habit is itself a production skill.

**A good default setup:** two or three small Ubuntu LTS VMs (t3.small or e2-small is plenty), one security group opening ports 22, 80 and 443, and Docker installed for quick experiments. A cheap domain name you control makes the HTTPS parts much more real.

**The rule for every lab:** before you change anything, predict what will happen. Then observe it with curl, tcpdump or the logs. The gap between prediction and result is where the learning is.

### The topics that give you chills, and where each one is tamed

The goal isn't to become a network engineer. It's to know, for any failure, which layer is involved and which command to run first. Every topic below gets a concept list, a picture and a lab where you build it or break it yourself.

| Topic | Where | You'll be able to |
| --- | --- | --- |
| TCP/IP and the layers | Part 1 (1.1 to 1.11) | Read a tcpdump of a full connection |
| Is TCP dropping packets? | Field guide, after Part 12 | Prove loss, backlog drops or a firewall in minutes |
| HTTPS and TLS | Part 5 (5.1 to 5.10) | Explain every handshake message |
| Root CA and intermediate CA | Part 5 (5.4, 5.5), lab step 1 | Build your own CA and fix a broken chain |
| TLS termination | Part 5 (5.14), Part 15 capstone | Choose where to decrypt, and why |
| Reverse proxy | Part 8 | Map 502, 504, 499 and 413 to a cause |
| Load balancing | Part 9 | Lose any server with zero user errors |
| Rate limiting | Part 10 (10.11) | Tune `rate`, `burst` and `nodelay` on purpose |
| Where to start looking | Field guide, Part 12 (12.8) | Find a root cause without guessing |
| DNS records, SAN, server\_name | Part 1 records table; One hostname, three checks | Explain how one name passes DNS, the certificate and nginx |

[↑ Back to contents](#mxyrjhrn9ys.53243)

## Part 1 — Networking foundations

Every HTTP problem eventually becomes a network problem, so this layer pays back forever. Plan about one week.

&#91;embedded content: layer model · 4 layers, the tool for each, how each fails\]

Keep this picture in mind for every part of the guide. When something breaks, the first question is always which envelope is damaged.

&#91;embedded content: TCP connection lifecycle · handshake, data, teardown\]

Press Next to step through it packet by packet. The states on each side are exactly what `ss -tan` prints, so you can match this picture to a live server. The side that closes first waits in TIME\_WAIT, which is why busy proxies can run short of ports (1.5).

&#91;embedded content: DNS resolution · 8 steps, cold cache\]

Run `dig +trace shop.example.com` and you'll see these exact referrals printed in order (1.10).

### DNS records you must know

A DNS zone is a list of records: a name, a type, a TTL and a value. These are the ones a backend engineer meets.

| Record | What it does | The gotcha |
| --- | --- | --- |
| **A** | Name → IPv4 address, e.g. `203.0.113.10` | Several A records spread load crudely, with no health checks |
| **AAAA** | Name → IPv6 address | Clients try IPv6 first; a broken IPv6 path looks like random slowness |
| **CNAME** | Name → another name, an alias | Not allowed at the zone apex (`example.com`), and no other records on the same name |
| **ALIAS / ANAME** | A CNAME-like alias at the apex (Route 53 calls it an alias record) | Provider-specific: the DNS host resolves it for you |
| **NS** | Which servers are authoritative for the zone | Changing name servers waits on the TLD's TTL, often 1 to 2 days |
| **TXT** | Free text: domain verification, SPF, ACME DNS-01 challenges | Long values split into quoted chunks |
| **CAA** | Which CAs may issue certificates for the name | A CAA record that leaves out your CA silently blocks issuance |
| **MX** | Mail servers for the domain | Nothing to do with web traffic, but often broken during migrations |
| **HTTPS / SVCB** | Advertises HTTP/3 and other connection hints | How browsers can skip the `Alt-Svc` upgrade (6.7) |

**TTL is a promise about caching.** A record with TTL 3600 may be served from caches for up to an hour after you change it. Before a migration, lower the TTL to 60 a day ahead, so the switch spreads fast.

**Try it:** `dig www.github.com` shows a CNAME chain ending in A records. `dig example.com CAA` and `dig example.com NS` show the others. Add `+short` for just the values.

**Concepts**

- **1.1 The layer model.** Know which layer each thing lives at: IP (routing packets), TCP or UDP (transport), TLS (security), HTTP (application). Debugging means asking "which layer failed?"
- **1.2 IP addresses and subnets.** IPv4 vs IPv6, CIDR notation like 10.0.0.0/16, private vs public ranges. Cloud VPCs are built entirely from this.
- **1.3 TCP vs UDP.** TCP gives reliable, ordered byte streams with retransmission and flow control. UDP sends independent datagrams with no guarantees. HTTP/1.1 and HTTP/2 use TCP; HTTP/3 uses UDP via QUIC.
- **1.4 The three-way handshake.** SYN, SYN-ACK, ACK. It costs one round trip before any data moves, which is why connection reuse matters so much.
- **1.5 Connection teardown and TIME\_WAIT.** FIN and ACK in both directions, or RST for an abrupt close. The side that closes first sits in TIME\_WAIT. Busy proxies can run out of ports because of it.
- **1.6 Ports and the 4-tuple.** A connection is identified by source IP, source port, destination IP and destination port. Ephemeral ports (the client side) are a finite pool, roughly 28,000 by default on Linux.
- **1.7 Sockets.** The OS API for networking. Servers call `bind`, `listen` and `accept`; clients call `connect`. Every server you will ever touch is built on these calls.
- **1.8 The listen backlog.** Completed connections wait in a queue until the server accepts them. If it fills, new clients see timeouts or resets.
- **1.9 Latency, RTT and bandwidth.** Round-trip time dominates web performance more than bandwidth. Learn to reason in round trips: DNS + TCP + TLS + request.
- **1.10 DNS.** How a name becomes an IP: resolvers, root and TLD servers, authoritative servers. Know A, AAAA, CNAME, NS, TXT and CAA records, and how TTL controls caching.
- **1.11 NAT and firewalls.** Your VM's private IP is translated to a public one. Security groups and firewalls filter by port and source. "Connection refused" and "connection timed out" mean very different things here.

**In the sandbox**

1. On one VM, run `nc -l 9000`. From another, run `nc <ip> 9000` and type. You just made a raw TCP connection.
2. Run `sudo tcpdump -i any -nn port 9000` during that test. Find the SYN, SYN-ACK and ACK, then the FIN packets when you close.
3. Connect to a closed port, then to a port blocked by the security group. Compare "refused" (an RST came back) with "timed out" (nothing came back).
4. Use `dig +trace example.com` to walk the full DNS resolution chain. Then check `dig example.com A` twice and watch the TTL count down.
5. Run `ss -tan` while connections open and close. Spot the ESTABLISHED and TIME\_WAIT states.

**You've got it when** you can draw the packets for opening, using and closing a TCP connection, and explain why "refused" and "timed out" point to different causes.

[↑ Back to contents](#mxyrjhrn9ys.53243)

## Part 2 — The Linux layer

Web servers are Linux programs first. Knowing what the kernel does for them explains most nginx tuning advice. Plan about one week, overlapping with Part 4.

**Concepts**

- **2.1 File descriptors.** Every socket, file and pipe is an integer handle. A server holding 10,000 connections holds at least 10,000 descriptors.
- **2.2 Limits: ulimit and nofile.** Per-process caps on open descriptors. "Too many open files" is a classic outage; nginx's `worker_rlimit_nofile` exists because of it.
- **2.3 Blocking vs non-blocking I/O.** A blocking `read` freezes the thread until data arrives. Non-blocking calls return immediately, so one thread can juggle many sockets.
- **2.4 I/O multiplexing: select, poll, epoll.** Ask the kernel "which of these sockets is ready?" `select` and `poll` scan every descriptor; `epoll` reports only the ready ones and scales to huge counts. nginx is built on epoll.
- **2.5 Processes vs threads.** Processes are isolated and crash-safe; threads share memory and are cheaper. nginx uses one master process plus a few single-threaded worker processes.
- **2.6 Signals.** How you talk to a running server: SIGHUP to reload config, SIGTERM to stop, SIGQUIT for graceful shutdown, SIGUSR1 to reopen logs. `nginx -s reload` sends these for you.
- **2.7 Zero-copy with sendfile.** The kernel copies a file straight to a socket without passing through user space. It is why nginx serves static files so cheaply.
- **2.8 Kernel network tuning.** Know what `net.core.somaxconn` (backlog ceiling), `net.ipv4.ip_local_port_range` (ephemeral ports) and `tcp_tw_reuse` do. Don't tune blindly; measure first.
- **2.9 SO\_REUSEADDR and SO\_REUSEPORT.** The first lets a restarted server rebind a port right away. The second lets several processes share one port with kernel load balancing, which nginx supports via `reuseport`.
- **2.10 Privileged ports and capabilities.** Ports below 1024 need root or the CAP\_NET\_BIND\_SERVICE capability. That is why nginx's master runs as root and workers drop to an unprivileged user.
- **2.11 systemd.** How servers are started, restarted and logged in production. Learn unit files, `systemctl` and `journalctl`.

**In the sandbox**

1. Run `ulimit -n`, then write a tiny script that opens files until it fails. Raise the limit and repeat.
2. Use `strace -f -e trace=network,epoll_wait nginx` (or attach with `strace -p`) and watch nginx's workers sit in `epoll_wait`.
3. Run `ls -l /proc/<pid>/fd` on a busy server to see its sockets as descriptors.
4. Write a systemd unit for your own Python server from Part 4 and make it restart on crash.

**You've got it when** you can explain why nginx uses a few worker processes with an event loop instead of a thread per connection.

[↑ Back to contents](#mxyrjhrn9ys.53243)

## Part 3 — HTTP/1.1 in depth

HTTP/1.1 is plain text, so you can read and write it by hand. Learn it at this level and HTTP/2 and HTTP/3 become "the same meaning, different framing." Plan about two weeks. The reference is RFC 9110 (semantics) and RFC 9112 (HTTP/1.1 framing).

**Concepts**

- **3.1 Message structure.** A request line (`GET /path HTTP/1.1`), headers, an empty line (`\r\n\r\n`), then an optional body. Responses swap the first line for a status line.
- **3.2 Methods and their properties.** GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS. Know which are *safe* (no side effects) and *idempotent* (safe to retry). Proxies decide whether to retry based on this.
- **3.3 Status codes.** 1xx informational, 2xx success, 3xx redirect, 4xx client error, 5xx server error. Know these cold: 200, 201, 204, 301, 302, 304, 307, 308, 400, 401, 403, 404, 405, 413, 429, 499 (nginx-specific: client closed), 500, 502, 503, 504.
- **3.4 502 vs 503 vs 504.** 502: the upstream gave a bad or no response. 503: the service is unavailable or overloaded. 504: the upstream was too slow. This distinction is the single most useful debugging skill behind a proxy.
- **3.5 The Host header.** Mandatory in HTTP/1.1. It lets one IP serve many sites (virtual hosting) and drives nginx's `server_name` matching.
- **3.6 Message length.** A body ends via `Content-Length`, via `Transfer-Encoding: chunked`, or by closing the connection. Getting this wrong causes hangs and request smuggling attacks.
- **3.7 Chunked transfer encoding.** Each chunk is its size in hex, then the data; a zero-size chunk ends it. Used for streaming when the total size is unknown.
- **3.8 Persistent connections (keep-alive).** HTTP/1.1 reuses connections by default. `Connection: close` ends them. One connection still handles only one request at a time.
- **3.9 Head-of-line blocking.** Because of 3.8, a slow response blocks everything queued behind it on that connection. Browsers open about 6 connections per host to work around it.
- **3.10 Content negotiation and compression.** `Accept`, `Accept-Encoding`, `Content-Type`, `Content-Encoding`. gzip and brotli shrink text responses a lot.
- **3.11 Caching.** `Cache-Control` (max-age, no-cache, no-store, private, public, s-maxage), `ETag` and `If-None-Match`, `Last-Modified` and `If-Modified-Since`, and the 304 Not Modified response. `Vary` tells caches which request headers change the response.
- **3.12 Redirects.** 301 and 308 are permanent; 302 and 307 are temporary. 307 and 308 keep the method and body, which matters for POST.
- **3.13 Range requests.** `Range: bytes=0-1023` and the 206 Partial Content response. This powers resumable downloads and video seeking.
- **3.14 Cookies and state.** `Set-Cookie` with attributes Secure, HttpOnly, SameSite, Domain, Path. HTTP is stateless; cookies are how sessions are layered on top.
- **3.15 CORS.** Browsers block cross-origin reads unless the server says otherwise via `Access-Control-Allow-*` headers. Learn the preflight OPTIONS request.
- **3.16 Forwarding headers.** `X-Forwarded-For`, `X-Forwarded-Proto`, `X-Real-IP` and the standard `Forwarded` header. Behind a proxy, the app only learns the real client this way.

**In the sandbox**

1. Talk HTTP by hand: `nc example.com 80`, then type `GET / HTTP/1.1`, `Host: example.com` and an empty line.
2. Use `curl -v` and `curl -I` against real sites. Read every header and look up any you don't know.
3. Fetch a page twice with `curl -H 'If-None-Match: "<etag>"'` and get a 304.
4. Run `curl -r 0-99` for a range request and check the 206.
5. Open your browser's DevTools Network tab on a big site. Inspect caching headers, cookies and the protocol column.

**You've got it when** you can write a valid HTTP/1.1 request and response from memory, and say what a 502 and a 504 tell you about the upstream.

[↑ Back to contents](#mxyrjhrn9ys.53243)

## Part 4 — Building raw web servers

This is the part that turns knowledge into intuition. You build a server with nothing but sockets, and evolve it through each concurrency model nginx and the frameworks chose between. Plan two to three weeks. Python is fine; Go or C teach even more if you know them.

&#91;embedded content: concurrency simulator · blocking, threads, event loop\]

Pick a model, then add slow clients. This is exactly what your v1, v4 and v5 servers will do in the lab, and why nginx is built on an event loop (4.8, 4.9).

**Concepts**

- **4.1 The accept loop.** `socket()` → `bind()` → `listen()` → loop on `accept()` → `recv()` → parse → `send()` → `close()`. Every web server is an elaboration of this.
- **4.2 TCP is a stream, not messages.** One `recv` may hold half a request or two requests. You must buffer until you see `\r\n\r\n`, then read exactly `Content-Length` more bytes.
- **4.3 Parsing defensively.** Cap header size, line length and body size. Reject malformed input with a 400. Real servers are mostly hardening code.
- **4.4 Timeouts.** A client that connects and never sends (Slowloris) will tie up your server forever without read timeouts. nginx has `client_header_timeout` for exactly this.
- **4.5 Iterative (single-threaded blocking) server.** Handles one client at a time. One slow client stalls everyone.
- **4.6 Thread-per-connection and process-per-connection.** Simple and works well up to a few hundred clients. Memory and context switching cost grow with each connection. Apache's prefork and worker modes live here.
- **4.7 Pre-fork and worker pools.** Create workers up front instead of per request. Gunicorn's sync workers use this model.
- **4.8 Event-driven servers.** One thread, non-blocking sockets, an epoll loop and a state machine per connection. This is nginx's model, and also Node.js and Python's asyncio.
- **4.9 The C10k problem.** The historic challenge of handling 10,000 concurrent connections on one machine. It is why event-driven servers won for proxies.
- **4.10 Static file serving.** Map URL paths to files, set `Content-Type` from the extension, and stream large files. Block path traversal like `/../../etc/passwd`.
- **4.11 Keep-alive in your server.** Loop on the same connection for the next request, with an idle timeout. Watch how much it cuts latency.
- **4.12 Graceful shutdown.** Stop accepting new connections, finish in-flight requests, then exit. Production deploys depend on this.

**In the sandbox** (build these in order, each as its own file)

1. **v1:** a blocking server with Python's `socket` module that returns "Hello" for any request. Test with curl and a browser.
2. **v2:** parse the request line and headers properly; route `/` and `/health`; return 404 otherwise.
3. **v3:** serve static files from a folder, with correct MIME types and path-traversal protection.
4. **v4:** add a thread per connection. Then add keep-alive and read timeouts.
5. **v5:** rewrite as an event loop with the `selectors` module (epoll under the hood). No threads.
6. **Benchmark each version** from a second VM with `wrk -t2 -c200 -d30s http://<ip>:8080/`. Then point slow clients at it (a script that sends one header byte every 10 seconds) and see which versions survive.

**You've got it when** your event-loop version handles hundreds of concurrent connections, and you can explain from your own benchmark numbers why it beats v1.

[↑ Back to contents](#mxyrjhrn9ys.53243)

## Part 5 — TLS and HTTPS

HTTPS is just HTTP inside a TLS tunnel. The hard part is trust: certificates, chains and the handshake. Plan about two weeks.

&#91;embedded content: chain of trust · root, intermediate, leaf\]

In nginx, `ssl_certificate` points at `fullchain.pem` (leaf first, then intermediates) and `ssl_certificate_key` at the private key, which never leaves the server. Browsers sometimes hide a missing intermediate by fetching or caching it themselves; curl, Python and Java clients usually don't, which is why "it works in my browser" proves nothing.

&#91;embedded content: TLS 1.3 handshake · 7 messages, 1 round trip\]

Step through it, then run `openssl s_client -connect example.com:443 -servername example.com -msg` and match each printed message to a step here.

&#91;embedded content: TLS termination modes · 3 options\]

In nginx: termination is `listen 443 ssl` plus `proxy_pass http://...`. Re-encryption is `proxy_pass https://...` with `proxy_ssl_verify on` and `proxy_ssl_trusted_certificate` pointing at your internal CA. Passthrough lives in the `stream` block, often with `ssl_preread` to route by SNI without decrypting.

**Concepts**

- **5.1 The three goals.** Confidentiality (encryption), integrity (no tampering) and authentication (you are talking to the real server). Certificates handle the third.
- **5.2 Symmetric vs asymmetric crypto.** Asymmetric keys (RSA, ECDSA, Ed25519) prove identity and agree on secrets. Fast symmetric ciphers (AES-GCM, ChaCha20-Poly1305) encrypt the actual data.
- **5.3 Key exchange and forward secrecy.** Ephemeral Diffie-Hellman (ECDHE, usually X25519) creates fresh keys per session. Stealing the server's key later can't decrypt old traffic. Hybrid post-quantum exchange (X25519 combined with ML-KEM) is now the default in current browsers and OpenSSL.
- **5.4 X.509 certificates.** A public key plus identity (Subject Alternative Names), validity dates and a CA's signature. Modern clients check the SAN, not the old Common Name.
- **5.5 The chain of trust.** Leaf certificate → intermediate CA → root CA in the client's trust store. The server must send the intermediates. A missing intermediate is the most common HTTPS misconfiguration.
- **5.6 The TLS 1.3 handshake.** ClientHello (with key share) → ServerHello, certificate and Finished → client Finished. One round trip. TLS 1.2 needed two.
- **5.7 Session resumption and 0-RTT.** Session tickets let returning clients skip work. 0-RTT early data saves a round trip but can be replayed, so only allow it for idempotent requests.
- **5.8 SNI.** Server Name Indication puts the hostname in the ClientHello. It lets one IP serve many certificates. nginx picks a `server` block with it.
- **5.9 ALPN.** The client and server agree on the application protocol during the handshake, such as `h2` or `http/1.1`. HTTP/2 negotiation depends on it.
- **5.10 Cipher suites and protocol versions.** Allow only TLS 1.2 and 1.3 with modern AEAD ciphers. Mozilla's SSL Configuration Generator gives sane presets.
- **5.11 Revocation.** CRLs and OCSP, and why they work poorly. The industry is responding with ever shorter certificate lifetimes instead; the CA/Browser Forum has voted to cut the maximum to 47 days by 2029.
- **5.12 ACME and Let's Encrypt.** Automated certificate issuance. Know the HTTP-01 challenge (a file on port 80) and DNS-01 (a TXT record, needed for wildcards). With short lifetimes, automated renewal is mandatory.
- **5.13 HSTS.** `Strict-Transport-Security` tells browsers to never use plain HTTP for your site. Learn `max-age`, `includeSubDomains` and preload, and their risks.
- **5.14 TLS termination vs passthrough vs re-encryption.** Decrypt at the proxy, pass encrypted bytes through to the backend, or decrypt and re-encrypt. Each changes what the proxy can see and do.
- **5.15 Mutual TLS (mTLS).** The client also presents a certificate. Used for service-to-service auth and zero-trust networks.

**In the sandbox**

1. With `openssl`, create your own root CA, an intermediate CA and a server certificate with SANs. Inspect each with `openssl x509 -text -noout`.
2. Wrap your Part 4 server with Python's `ssl` module. Connect with `curl --cacert ca.pem` and then without it, and read the error.
3. Serve only the leaf, without the intermediate. Watch which clients fail.
4. Run `openssl s_client -connect <host>:443 -servername <host>` against real sites. Read the chain, protocol and cipher.
5. Capture a handshake with tcpdump and open it in Wireshark. Set `SSLKEYLOGFILE` in curl so Wireshark can decrypt it, and see the HTTP inside.
6. Point a real domain at a VM, get a Let's Encrypt certificate with certbot, and test the result with SSL Labs' server test.
7. Set up mTLS: issue a client certificate from your CA and require it on the server.

**You've got it when** you can explain each message of a TLS 1.3 handshake, and fix a "certificate verify failed" error by reading the chain.

[↑ Back to contents](#mxyrjhrn9ys.53243)

## Part 6 — HTTP/2 and HTTP/3

Both keep HTTP's meaning (methods, headers, status codes) and change only how it travels. Plan about one week.

&#91;embedded content: head-of-line blocking · HTTP/1.1 vs HTTP/2 vs HTTP/3\]

Three responses, nine packets, one loss. Compare the three protocols with the loss on: this is concepts 3.9, 6.2, 6.5 and 6.6 in one picture.

**Concepts**

- **6.1 Binary framing (HTTP/2).** Messages are split into typed frames (HEADERS, DATA, SETTINGS and others) instead of text lines.
- **6.2 Streams and multiplexing.** Many requests share one TCP connection at the same time, each as a numbered stream. This removes HTTP-level head-of-line blocking.
- **6.3 HPACK header compression.** Repeated headers like cookies are sent as small table references instead of full text.
- **6.4 Flow control and prioritization.** Per-stream windows stop one big download from starving others.
- **6.5 TCP head-of-line blocking remains.** One lost packet still stalls every HTTP/2 stream on that connection. This is the problem HTTP/3 solves.
- **6.6 QUIC.** A transport built on UDP with TLS 1.3 built in. Streams are independent, so a loss affects only its own stream. Connections survive IP changes, like a phone switching from Wi-Fi to mobile.
- **6.7 Discovering HTTP/3.** Browsers first connect over TCP and learn about HTTP/3 from the `Alt-Svc` header (or an HTTPS DNS record), then switch.
- **6.8 Where each is used.** Browsers to edge proxies speak HTTP/2 or HTTP/3. Proxies to backends usually still speak HTTP/1.1, because the gains are small on a fast internal network. nginx's `proxy_pass` speaks HTTP/1.x to upstreams; gRPC upstreams use `grpc_pass` over HTTP/2.

**In the sandbox**

1. Enable `http2 on;` in nginx (after Part 7). Compare `curl --http1.1 -v` with `curl --http2 -v` and look at the negotiated protocol.
2. Use `h2load` (from the nghttp2 package) to benchmark HTTP/1.1 vs HTTP/2 with many small requests.
3. Enable HTTP/3 in nginx with `listen 443 quic reuseport;`, open UDP 443 in the security group, and add the `Alt-Svc` header. Confirm the protocol in browser DevTools.
4. Use `tc qdisc add dev eth0 root netem loss 2%` on the server to add packet loss. Compare HTTP/2 and HTTP/3 page loads.

**You've got it when** you can explain why HTTP/2 fixed one kind of head-of-line blocking, and why HTTP/3 needed a new transport to fix the other.

[↑ Back to contents](#mxyrjhrn9ys.53243)

## Part 7 — nginx core

This is where everything from Parts 1 to 6 becomes configuration. Most nginx confusion comes from three things: how a request picks a `server`, how it picks a `location`, and how directives inherit. Master those and the rest is reference lookup. Plan two weeks.

&#91;embedded content: location matching · 6 blocks, 5 test URLs\]

Click each URL and predict the winner before you look. Then copy this config into a sandbox, have each block `return 200 "line N";`, and confirm with curl (lab step 3).

**Concepts**

- **7.1 Architecture.** One master process (reads config, binds ports, manages workers) and N worker processes, each an event loop. `worker_processes auto;` gives one per CPU core; `worker_connections` caps connections per worker.
- **7.2 Open source vs nginx Plus.** F5 sells nginx Plus with extras like active health checks, a live API dashboard and `least_time` balancing. Learn the open-source version first, and note when a guide assumes Plus.
- **7.3 Config structure.** Contexts nest: `main` → `events` and `http` → `server` → `location`. There are also `stream` (raw TCP/UDP) and `mail` contexts.
- **7.4 Directive inheritance.** Values flow down from outer contexts. The trap: array directives like `add_header` and `proxy_set_header` are *replaced*, not merged, if you set any at an inner level.
- **7.5 Server selection.** nginx first matches `listen` (IP and port), then `server_name` from the Host header or SNI. Order: exact name, leading wildcard, trailing wildcard, regex, then `default_server`.
- **7.6 Location matching.** `=` exact match wins immediately. Otherwise nginx finds the longest prefix; `^~` on it stops the search. Then regexes (`~` and `~*`) are tried in file order, and the first match wins. Else the longest prefix is used.
- **7.7 root vs alias.** `root` appends the full URI to the path; `alias` replaces the matched location part. Mixing them up is a top cause of 404s.
- **7.8 try\_files.** Check files in order, then fall back, for example `try_files $uri $uri/ /index.html;` for single-page apps.
- **7.9 index and autoindex.** Which file serves a directory request, and whether to list directory contents.
- **7.10 Variables.** `$host`, `$uri`, `$request_uri`, `$args`, `$remote_addr`, `$scheme` and more. `map` builds new variables from old ones and is the clean way to do conditional logic.
- **7.11 rewrite and return.** `return 301 https://$host$request_uri;` for redirects. `rewrite` changes the URI with regexes. Prefer `return` when you can.
- **7.12 "If is evil."** `if` inside `location` behaves in surprising ways. Use `map`, `try_files` or separate locations instead.
- **7.13 MIME types and default\_type.** The `types` block maps extensions to `Content-Type`.
- **7.14 Request processing phases.** nginx handles each request in ordered phases: rewrite, access, try\_files, content, log. Knowing them explains why directive order in the file often doesn't matter.
- **7.15 Modules.** Core functionality is split into modules, some compiled in and some dynamic. `nginx -V` shows what your build includes.
- **7.16 Safe operations.** `nginx -t` to test, `nginx -T` to dump the full config, `nginx -s reload` for a zero-downtime reload. Reload starts new workers and drains old ones gracefully.

**In the sandbox**

1. Install nginx from the official nginx.org repo (newer than the distro package). Read every line of the default config.
2. Host two sites on one VM with two `server_name` values. Test with `curl -H 'Host: a.test' http://<ip>/`.
3. Write ten `location` blocks mixing `=`, `^~`, prefix and regex. Predict which one answers each of twenty URLs, then check by returning a different text from each one.
4. Reproduce the `root` vs `alias` bug on purpose, and fix it.
5. Deploy a single-page app build with `try_files` and long cache headers on hashed assets.
6. During a `wrk` load test, run `nginx -s reload` and confirm zero failed requests.

**You've got it when** you can predict which `server` and `location` will handle any request without running it.

[↑ Back to contents](#mxyrjhrn9ys.53243)

## One hostname, three checks — DNS, TLS and nginx

When a browser opens `https://www.example.com`, three different systems check that same name, one after another. Most "works on one domain, breaks on another" bugs are one of these three checks failing.

&#91;embedded content: hostname simulator · 6 names, 3 checks each\]

Click each hostname and predict which check fails before you look. The zone, certificate and nginx config shown underneath are fixed; only the name changes.

| Check | What is compared | When it fails, you see |
| --- | --- | --- |
| **1. DNS** | The name against the zone's A, AAAA and CNAME records | `Could not resolve host`, or the right name pointing at the wrong IP |
| **2. TLS certificate** | The name the client sent in SNI against the certificate's SAN list | `ERR_CERT_COMMON_NAME_INVALID`, curl's `no alternative certificate subject name matches` |
| **3. nginx** | The `Host` header (and SNI) against each `server_name` | The wrong site, or the `default_server` answering instead |

### SAN, SNI and server\_name in plain words

- **SAN (Subject Alternative Name)** is the list of hostnames a certificate is valid for. Modern clients ignore the old Common Name field and check only the SAN list.
- **A wildcard covers exactly one label.** `*.example.com` covers `api.example.com` but not `example.com` itself and not `beta.api.example.com`. That's why most certificates list both `example.com` and `*.example.com`.
- **SNI (Server Name Indication)** is the hostname the client puts in its TLS ClientHello. nginx uses it to choose which certificate to present.
- **`server_name`** is nginx's list of names for a `server` block. It's matched against the `Host` header, in the order exact, leading wildcard, trailing wildcard, regex, then `default_server` (7.5).
- **A CNAME does not change the name being checked.** If `www.example.com` is a CNAME to `my-lb.cloud.net`, the browser still expects a certificate for `www.example.com`. This trips up almost everyone the first time they put a site behind a CDN or load balancer.

### The 30-second version you can tell anyone

> "First, DNS turns the name into an IP address, following any CNAMEs on the way. Then, during the TLS handshake, the browser sends the name as SNI, and the server must show a certificate whose SAN list includes that name. Finally, nginx reads the Host header and picks the `server` block whose `server_name` matches. Same name, three checks. When something breaks, find which of the three said no."

**In the sandbox:** point an A record and a CNAME at a VM. Get one Let's Encrypt certificate covering two names, and set up two `server` blocks. Then break each check on purpose: request a name missing from the SANs, remove a `server_name`, and point the CNAME at the wrong target. Read the exact error each one produces with `curl -v`.

[↑ Back to contents](#mxyrjhrn9ys.53243)

## Part 8 — nginx as a reverse proxy

A reverse proxy accepts the client's connection and opens a separate one to the backend. Two connections, two sets of timeouts, two places to fail. Plan two weeks.

&#91;embedded content: reverse proxy · 2 connections, 6 error codes, their timeouts\]

Log both `$status` (what the client got) and `$upstream_status` (what the backend said). When they differ, you know which connection failed.

**Concepts**

- **8.1 Forward vs reverse proxy.** A forward proxy acts for clients (a corporate proxy). A reverse proxy acts for servers, hiding and protecting the backends.
- **8.2 proxy\_pass and the trailing slash.** `proxy_pass http://app;` passes the URI unchanged. `proxy_pass http://app/;` replaces the matched location prefix. This one slash causes endless bugs, so test both.
- **8.3 Header rewriting.** By default nginx sends `Host: <upstream name>`. You usually want `proxy_set_header Host $host;`, plus `X-Real-IP`, `X-Forwarded-For $proxy_add_x_forwarded_for` and `X-Forwarded-Proto $scheme`.
- **8.4 Trusting the real client IP.** With a cloud load balancer in front, use the `realip` module (`set_real_ip_from`, `real_ip_header`) so logs and rate limits see the real client, not the load balancer.
- **8.5 Buffering.** By default nginx reads the whole upstream response into buffers, then feeds slow clients itself. This frees the app quickly. Turn it off (`proxy_buffering off;`) for streaming and server-sent events.
- **8.6 Request body buffering.** nginx also buffers uploads before passing them on. `client_max_body_size` (default 1 MB) is why large uploads return 413.
- **8.7 The timeout family.** `proxy_connect_timeout`, `proxy_send_timeout`, `proxy_read_timeout`, plus client-side `client_body_timeout` and `send_timeout`. Each maps to a specific failure and status code.
- **8.8 Upstream keep-alive.** Without it, nginx opens a new TCP connection to the backend per request and can exhaust ephemeral ports. Needs `keepalive` in the upstream block, `proxy_http_version 1.1;` and an empty `Connection` header.
- **8.9 WebSockets.** An HTTP/1.1 Upgrade handshake, then a long-lived two-way connection. Pass the `Upgrade` and `Connection` headers and raise `proxy_read_timeout`.
- **8.10 Redirect and cookie rewriting.** `proxy_redirect` fixes `Location` headers pointing at internal hostnames. `proxy_cookie_domain` and `proxy_cookie_path` do the same for cookies.
- **8.11 Error interception.** `proxy_intercept_errors` and `error_page` let nginx serve friendly error pages instead of the app's.
- **8.12 Other upstream protocols.** `fastcgi_pass` (PHP-FPM), `uwsgi_pass`, `grpc_pass`, and the `stream` module for proxying raw TCP such as databases.
- **8.13 Unix domain sockets.** Proxy to `unix:/run/app.sock` when the app is on the same host. No TCP overhead and no exposed port.

**In the sandbox**

1. Put nginx in front of your Part 4 server. Log every incoming header in your server and see exactly what nginx sends.
2. Test `proxy_pass` with and without the trailing slash across several `location` prefixes. Write down the rule in your own words.
3. Make your backend sleep 70 seconds and get a 504. Make it crash and get a 502. Point nginx at a closed port and read the error log for each case.
4. Upload a 5 MB file and get a 413, then fix it.
5. Count backend connections with `ss -tan | grep :8080 | wc -l` during a load test, with and without upstream keep-alive.
6. Proxy a WebSocket echo server and keep a connection open past the default 60-second read timeout.

**You've got it when** you can map any 502, 504 or 413 to the exact directive and log line behind it.

[↑ Back to contents](#mxyrjhrn9ys.53243)

## Part 9 — Load balancing

Load balancing is easy to set up and hard to get right under failure. Spend most of your lab time breaking backends on purpose. Plan one to two weeks.

&#91;embedded content: load balancing simulator · round robin, 3 backends, passive failover\]

Try it: send a few requests, kill B, then send again. The first request that lands on B fails over to C, which is `proxy_next_upstream` at work. After that, B is skipped. Notice that C now takes two shares of traffic, which is why one dead server can overload its neighbours.

**Concepts**

- **9.1 L4 vs L7 balancing.** Layer 4 balances TCP or UDP connections without reading HTTP (nginx `stream`, AWS NLB). Layer 7 reads HTTP and can route by path, header or cookie (nginx `http`, AWS ALB).
- **9.2 The upstream block.** A named group of backend servers with per-server options: `weight`, `max_fails`, `fail_timeout`, `backup`, `down`, `max_conns`.
- **9.3 Algorithms.** Round robin (default, weighted), `least_conn`, `ip_hash`, `hash $key consistent`, and `random two least_conn`. Know which fits stateless apps, long connections and caches.
- **9.4 Consistent hashing.** Adding or removing a server remaps only a small share of keys. Essential when backends are caches.
- **9.5 Session affinity (sticky sessions).** Pin a client to one backend via `ip_hash` or a cookie-based hash. Learn why it hurts balance, and why moving sessions into Redis or a database is usually better.
- **9.6 Passive health checks.** Open-source nginx marks a server failed after `max_fails` errors within `fail_timeout`, then retries it later. It only notices failure when real traffic hits it.
- **9.7 Active health checks.** Probing a `/health` endpoint on a schedule. This is nginx Plus only; open-source users rely on passive checks or the cloud load balancer's checks.
- **9.8 Retries and proxy\_next\_upstream.** Which errors trigger a retry on another server (error, timeout, http\_502 and others). By default nginx won't retry non-idempotent requests like POST once they were sent, to avoid duplicate side effects.
- **9.9 Retry storms.** Retries multiply load on an already struggling system. Cap them with `proxy_next_upstream_tries` and `proxy_next_upstream_timeout`.
- **9.10 Dynamic backends and DNS.** nginx resolves upstream hostnames once at startup by default. That breaks with autoscaling or changing IPs. Fixes: a `resolver` with variables in `proxy_pass`, or the `resolve` server parameter, which arrived in open-source nginx in the 1.27 line.
- **9.11 Connection draining.** Remove a backend gracefully: mark it `down`, reload, wait for in-flight requests, then stop it.
- **9.12 Load balancer high availability.** nginx itself must not be a single point of failure. Options: two nginx nodes behind a cloud load balancer, DNS with several records, or a floating IP with keepalived.

**In the sandbox**

1. Launch three backend VMs, each returning its own hostname. Put nginx in front and run `for i in $(seq 20); do curl -s http://<lb>/; done` for each algorithm.
2. Set weights 5:1:1 and verify the split with a 1,000-request loop.
3. Kill one backend during a `wrk` run. Count errors, then tune `max_fails`, `fail_timeout` and `proxy_next_upstream` to reduce them.
4. Send a POST to a backend that dies mid-request and confirm nginx does not replay it.
5. Make one backend slow (add a 2-second sleep) and compare round robin with `least_conn`.
6. Build the same setup with an AWS ALB or GCP load balancer in front of two nginx nodes. Compare its health checks with nginx's.

**You've got it when** you can kill any single machine in your setup, including one nginx node, and users see no errors.

[↑ Back to contents](#mxyrjhrn9ys.53243)

## Part 10 — Caching, performance and security hardening

This is what separates "it works" from "it survives real traffic and real attackers." Plan two weeks.

&#91;embedded content: proxy cache simulator · HIT, MISS, EXPIRED, STALE\]

Try this order: send, send again, wait twice, take the backend down, send. You'll see all four cache statuses, and why `proxy_cache_use_stale` turns an outage into a non-event (10.1 to 10.4).

**Caching**

- **10.1 proxy\_cache basics.** `proxy_cache_path` defines disk storage and a shared-memory key zone. `proxy_cache_valid` sets lifetimes per status code. nginx respects the upstream's `Cache-Control` unless told otherwise.
- **10.2 The cache key.** `proxy_cache_key` decides what counts as "the same response." Too broad leaks one user's page to another; too narrow means nothing ever hits.
- **10.3 Cache status.** Expose `$upstream_cache_status` (HIT, MISS, EXPIRED, STALE, BYPASS) in a response header while learning.
- **10.4 Stale content and stampede protection.** `proxy_cache_use_stale` serves old content when the backend errors or during updates. `proxy_cache_lock` lets only one request refill an expired entry.
- **10.5 Microcaching.** Caching dynamic pages for just 1 to 5 seconds can cut backend load by orders of magnitude on busy endpoints.
- **10.6 Never cache private responses.** Bypass the cache for logged-in users and anything with `Set-Cookie` or `Authorization`.

**Performance**

- **10.7 Static file tuning.** `sendfile on`, `tcp_nopush on`, `tcp_nodelay on`, and `open_file_cache` for hot files.
- **10.8 Compression.** `gzip on` with sensible `gzip_types` and level 4 to 6. Pre-compressed files with `gzip_static`. Brotli via a third-party module.
- **10.9 Keep-alive tuning.** `keepalive_timeout` and `keepalive_requests` on the client side, `keepalive` on the upstream side.
- **10.10 Load testing properly.** Use `wrk` or `k6` from a separate machine. Watch latency percentiles (p50, p99), not just requests per second. Check CPU, memory and errors at the same time.

**Security**

- **10.11 Rate limiting.** `limit_req_zone` uses a leaky-bucket algorithm per key (usually client IP). Learn `burst` and `nodelay`. `limit_conn` caps concurrent connections. Both return 503 by default; set `limit_req_status 429`.
- **10.12 Access control.** `allow` and `deny` by IP, `auth_basic` for simple passwords, `auth_request` to delegate auth to a separate service.
- **10.13 Security headers.** `Strict-Transport-Security`, `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options` or CSP `frame-ancestors`, and `Referrer-Policy`. Remember the `add_header` inheritance trap (7.4) and add `always` to cover error responses.
- **10.14 Information hiding.** `server_tokens off;` hides the version. Return 444 (close with no response) from a default server that catches requests for unknown hostnames.
- **10.15 Request size and timeout limits.** Tight `client_header_buffer_size`, `large_client_header_buffers` and timeouts defend against slow-client and oversized-request attacks.
- **10.16 Request smuggling.** When a proxy and a backend disagree on where a request ends (`Content-Length` vs `Transfer-Encoding`), attackers can hide a second request. Keep nginx current and reject ambiguous requests.
- **10.17 Least privilege.** Workers run as an unprivileged user. Keep private keys readable only by root. Patch nginx and OpenSSL promptly.

&#91;embedded content: rate limiting simulator · rate 1r/s, burst 3, nodelay toggle\]

Play with it: fire a burst of 5 with `nodelay` off, then on. Off, spikes are smoothed but users wait. On, spikes are served instantly but the bucket refills only at the rate, so a second burst soon after is rejected. Most APIs want `burst` plus `nodelay`.

**In the sandbox**

1. Put `proxy_cache` in front of a slow backend (1-second responses). Benchmark before and after, and watch the cache status header.
2. Stop the backend and confirm `proxy_cache_use_stale` keeps the site up.
3. Add a 1-second microcache to a dynamic endpoint and measure the backend's request count drop.
4. Set a rate limit of 10 requests per second with `burst=20`. Hammer it with `wrk` and read the 429s in the logs.
5. Scan your server with `testssl.sh` and an online security header checker, and fix what they flag.

**You've got it when** you can triple a slow backend's capacity with caching alone, and explain exactly which requests are never cached and why.

[↑ Back to contents](#mxyrjhrn9ys.53243)

## Part 11 — Application servers: WSGI, ASGI, Gunicorn, Uvicorn

This answers your original question about frameworks. Django and Flask are not web servers. Their `runserver` and `flask run` commands are development servers, never for production. A real deployment is nginx → an application server → your framework code. Plan one week.

&#91;embedded content: app server simulator · 2 Gunicorn workers, with and without nginx\]

Toggle nginx on and off. Same app, same workers: the only change is who spends time feeding slow clients (11.6).

**Concepts**

- **11.1 Why the layers exist.** nginx handles slow clients, TLS, static files and buffering. The app server manages Python processes. The framework only turns a request into a response.
- **11.2 WSGI.** Python's synchronous interface (PEP 3333): the server calls `app(environ, start_response)` once per request. Flask and classic Django use it.
- **11.3 ASGI.** The async successor. `async def app(scope, receive, send)` supports WebSockets, long-lived connections and many concurrent requests per process. FastAPI, Starlette and modern Django use it.
- **11.4 Gunicorn.** A pre-fork WSGI server (the model from 4.7). Tune `--workers` (a common start is 2 × cores + 1), `--timeout` and `--graceful-timeout`. Also try the `gthread` worker type.
- **11.5 Uvicorn.** An ASGI server on an event loop (the model from 4.8). In production run several worker processes, either via its `--workers` flag or under Gunicorn with the Uvicorn worker class.
- **11.6 Why nginx in front.** Sync workers are expensive: a slow client holding one ties up a whole process. nginx's buffering (8.5) absorbs slow clients so workers finish in milliseconds.
- **11.7 Unix sockets vs TCP.** Bind the app server to `unix:/run/gunicorn.sock` on the same host, or to `127.0.0.1:8000`. Never expose it publicly.
- **11.8 Static and media files.** Let nginx serve `/static/` directly with `alias`. Django's `collectstatic` gathers them into one folder for this.
- **11.9 Trusting proxy headers.** The app must know it is behind HTTPS. Django uses `SECURE_PROXY_SSL_HEADER`; Flask uses Werkzeug's `ProxyFix`; Uvicorn has `--forwarded-allow-ips`. Misconfiguring this breaks redirects or opens spoofing holes.
- **11.10 Other ecosystems.** The same pattern everywhere: Node (Express or Fastify, often behind nginx), PHP (PHP-FPM via `fastcgi_pass`), Java (Tomcat or Netty), Go (its `net/http` is production-ready by itself, but nginx still adds value in front).

### The Java side: Tomcat, Jetty, Netty and virtual threads

The Java world has the same layers with different names. Once you map them, everything in this part applies.

| Python | Java equivalent | Used by |
| --- | --- | --- |
| WSGI (sync interface) | Servlet API (Jakarta EE) | Spring MVC, most classic Java web apps |
| ASGI (async interface) | Reactive handlers on Netty | Spring WebFlux, Vert.x, Quarkus reactive |
| Gunicorn (worker pool) | Tomcat or Jetty (thread pool) | Spring Boot embeds Tomcat by default |
| Uvicorn (event loop) | Netty (event loop) | WebFlux, gRPC Java, many API gateways |
| Django, Flask | Spring Boot, Quarkus, Micronaut | Your application code |

**The servers to know**

- **11.11 Tomcat.** The default in Spring Boot. Its NIO connector is a hybrid: a poller watches every open connection with epoll (up to `max-connections`, default 8192), then hands ready requests to a worker pool (`server.tomcat.threads.max`, default 200). `accept-count` (default 100) is the listen backlog from 1.8.
- **11.12 Jetty.** The same hybrid idea, very embeddable. Spring Boot's alternative starter.
- **11.13 Netty.** A pure event loop, the same model as nginx (4.8). Fast and memory-efficient, but your code must never block the loop.
- **11.14 Undertow.** Was the third Spring Boot option, but [Spring Boot 4 dropped it](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-4.0-Migration-Guide) because Undertow doesn't yet support the required Servlet 6.1 baseline. You'll still meet it in older Spring Boot 3 services.
- **11.15 Virtual threads (Java 21+).** Set `spring.threads.virtual.enabled=true` and each request gets its own cheap JVM-managed thread. A request blocked on I/O parks its virtual thread and frees the OS thread underneath. With Tomcat, the 200-thread cap then stops mattering, and `max-connections` becomes the real limit. They help I/O-bound apps, not CPU-bound ones.

&#91;embedded content: Tomcat connector simulator · platform vs virtual threads\]

Pick a load, then flip virtual threads on. It's the lab's steps 2 and 3, before you run them.

**Spring Boot behind nginx: the settings that matter**

- `server.address=127.0.0.1` so only nginx can reach port 8080.
- `server.forward-headers-strategy=native` so Tomcat trusts `X-Forwarded-For` and `X-Forwarded-Proto` from nginx (the Java version of 11.9). Without it, redirects point to `http://` and logs show nginx's IP.
- `server.shutdown=graceful` so a deploy finishes in-flight requests (4.12).
- Why nginx still helps: Tomcat's poller handles slow request headers well, but writing a large response to a slow client still ties up a platform worker thread. nginx's buffering, TLS termination and static files take that load off the JVM.
- A classic Java 502: the JVM is still warming up, or paused in garbage collection, when nginx connects. Watch for it after every deploy.

**Java lab** (one sandbox)

1. Build a Spring Boot app with a `/slow` endpoint that sleeps 2 seconds, and put nginx in front.
2. Load test with `wrk -c400`. With 200 platform threads, latency roughly doubles once more than 200 requests are in flight.
3. Set `spring.threads.virtual.enabled=true`, rerun and compare.
4. Run `jcmd <pid> Thread.print` during the test and count the `http-nio` worker threads in each mode.
5. Log `request.getRemoteAddr()` with and without `forward-headers-strategy` and see the real client IP appear.
6. Set `server.tomcat.accept-count=1`, flood the app, and watch `ListenOverflows` climb with `nstat` (field guide, TCP drops step 2).

**In the sandbox**

1. Write a WSGI app as one bare function with no framework. Run it with Gunicorn. This shows how thin the interface really is.
2. Do the same with a raw ASGI function under Uvicorn.
3. Deploy a small Django app: Gunicorn on a Unix socket, nginx in front serving `/static/`, TLS from Part 5, systemd units from Part 2.
4. Add a slow endpoint (sleeps 2 seconds). Load test sync Gunicorn, Gunicorn with `gthread`, and Uvicorn. Compare throughput.
5. Remove nginx and point a slow-client script directly at Gunicorn's sync workers. Watch it freeze.

**You've got it when** you can explain what each of nginx, Gunicorn and Django does for a single request, and why removing any one of them hurts.

[↑ Back to contents](#mxyrjhrn9ys.53243)

## Part 12 — Observability and debugging

The people others call "nginx experts" are mostly fast debuggers. They read logs and timings and know which layer broke. Practise this across every part, then spend a dedicated week on it.

**Concepts**

- **12.1 Access logs.** Define a custom `log_format` that includes `$request_time`, `$upstream_response_time`, `$upstream_addr`, `$upstream_status` and `$request_id`. JSON format makes logs easy to query.
- **12.2 Reading the timings.** `$request_time` is total time with the client. `$upstream_response_time` is time spent waiting on the backend. A big gap between them points at a slow client or network, not the app.
- **12.3 Error logs.** Levels from `debug` to `emerg`. Learn the common messages: "connect() failed (111: Connection refused)", "upstream timed out (110)", "no live upstreams", "client intended to send too large body".
- **12.4 Request IDs.** Generate `$request_id` in nginx, pass it to the backend in a header, and log it in both places. One request can then be traced end to end.
- **12.5 stub\_status.** Built-in counters for active, reading, writing and waiting connections. The starting point for metrics.
- **12.6 Metrics and dashboards.** Export nginx metrics to Prometheus with nginx-prometheus-exporter and graph them in Grafana. Track request rate, error rate and latency percentiles.
- **12.7 Distributed tracing.** The OpenTelemetry module for nginx sends spans so you can see time spent in each hop.
- **12.8 The layer-by-layer debugging method.** DNS (`dig`) → TCP (`nc -vz`) → TLS (`openssl s_client`) → HTTP (`curl -v`) → nginx logs → app logs. Stop at the first layer that fails.
- **12.9 Packet-level debugging.** `tcpdump` to capture, Wireshark to read. Use it when logs disagree with what you expect.

**In the sandbox**

1. Create a JSON log format with all the timing fields. Ship logs to CloudWatch or Cloud Logging and query them for the slowest requests.
2. Run a "break it" drill: a partner, or a script you write, introduces one fault (wrong port, expired certificate, full disk, bad DNS, firewall rule). Find it using only the layer-by-layer method.
3. Set up Prometheus and Grafana in Docker with the nginx exporter. Graph requests per second during a load test.
4. Pass `$request_id` through nginx to your Django app and find the same request in both logs.

**You've got it when** you can find the root cause of a broken request in under 10 minutes, without guessing.

[↑ Back to contents](#mxyrjhrn9ys.53243)

## Field guide — where to start looking when something breaks

You're right: reading logs alone doesn't make someone senior. What does is forming a hypothesis about *which layer failed*, then running the one command that confirms or kills it. Every layer fails with its own signature, and this section teaches you to read them.

### The method

1. **Name the symptom exactly.** The exact error text, the status code, who is affected, since when, and whether it's every request or only some.
2. **Place it in a layer.** Use the flow below. "Timed out" and "refused" are different layers; so are 502 and 504.
3. **Test hop by hop.** Run the same request from the client, from the nginx host, then from the app host. The hop where it starts working is where the fault lives.
4. **Ask what changed.** A deploy, a certificate renewal, a DNS edit, a security group change, a traffic spike. Most incidents follow a change.
5. **Change one thing at a time,** and predict the result before you look.

&#91;embedded content: debugging flow · 4 questions, outside in\]

Four questions, asked in order, place almost any failure in under two minutes. Only then is it worth opening application logs.

### Symptom → layer → first command

| What you see | Likely layer | Run this first | What it tells you |
| --- | --- | --- | --- |
| `Could not resolve host` | DNS | `dig <name>` and `dig @1.1.1.1 <name>` | Record missing, or only your resolver is wrong |
| `Connection timed out` | Network or firewall | `nc -vz -w3 <host> 443` | Packets silently dropped: security group, NACL, routing |
| `Connection refused` | Nothing listening | `ss -ltnp` on the server | Process down, wrong port, or bound to 127.0.0.1 only |
| `Connection reset by peer` | TCP, proxy or app | `tcpdump -nn 'tcp[tcpflags] & tcp-rst != 0'` | Which side sends the RST, and when |
| `certificate verify failed` | TLS trust | `openssl s_client -connect <host>:443 -servername <host> -showcerts` | Missing intermediate, expired or wrong hostname |
| `handshake failure`, `wrong version` | TLS config | `openssl s_client -tls1_2` and `-tls1_3` | Protocol, cipher or SNI mismatch |
| 502 Bad Gateway | nginx → upstream | nginx `error.log`, then curl the backend from the nginx host | Backend down, crashed or on the wrong port |
| 504 Gateway Timeout | Slow upstream | `$upstream_response_time` in the access log | App or database too slow for `proxy_read_timeout` |
| 499 in nginx logs | Client gave up | Compare `$request_time` with the client or load balancer timeout | Something in front has a shorter timeout than the app |
| 413 | Request size | `client_max_body_size` | Upload bigger than the limit |
| Bursts of 429 or 503 | Rate limiting | error log: `limiting requests` | Limit too tight, or a real abuser |
| Slow, but no errors | Somewhere in the path | the `curl -w` timing below | Which phase eats the time |
| Fails on some requests only | One bad backend | `$upstream_addr` in the access log | Which server is sick |
| Works in curl, fails in browser | Browser policy | DevTools Console and Network | CORS, HSTS or mixed content |

**The single most useful command** — it splits any slow request into phases:

```bash
curl -o /dev/null -s -w 'dns:        %{time_namelookup}\nconnect:    %{time_connect}\ntls:        %{time_appconnect}\nfirst byte: %{time_starttransfer}\ntotal:      %{time_total}\n' https://example.com
```

Each number is cumulative seconds. A big jump at `connect` means network distance or loss. At `tls`, handshake or certificate trouble. At `first byte`, the server or app is slow. Between `first byte` and `total`, the response is large or the network is slow.

### Is TCP dropping packets?

Dropped packets never appear in application logs. They show up as retransmissions, resets and timeouts, so you look for those. Work down this list:

1. **Retransmits on live connections.** `ss -ti dst <ip>` shows `rtt` and `retrans` per connection. A growing retrans count means loss on the path.
2. **System-wide counters.** `nstat -az | grep -Ei 'retrans|ListenOverflows|ListenDrops|TCPTimeouts'`. Run it twice a minute apart and compare. Growing `ListenOverflows` or `ListenDrops` means the accept backlog is full: the app isn't accepting fast enough.
3. **Watch the wire.** `tcpdump -i any -nn host <ip> and port 443`. Repeated SYNs with no SYN-ACK mean a firewall or backlog drop. An RST means something actively refused. In Wireshark, filter on `tcp.analysis.retransmission`.
4. **Loss along the path.** `mtr -rwzc 100 <host>`. Loss that continues to the last hop is real. Loss at one middle hop only is usually just a router deprioritising ICMP.
5. **SYN floods and backlog.** `dmesg | grep -i 'syn flooding'` means the kernel switched to SYN cookies under pressure.
6. **Connection tracking.** `dmesg | grep conntrack` showing "table full, dropping packet" means the firewall's state table overflowed. Check with `conntrack -S`.
7. **The NIC and cloud limits.** `ip -s link` and `ethtool -S eth0` show interface drops. On AWS, `ethtool -S eth0 | grep allowance` reveals when the instance hit its bandwidth, packets-per-second or conntrack limits.
8. **MTU black holes.** Small requests work but large responses hang, often over VPNs. `ping -M do -s 1472 <host>` fails if the path can't carry full 1500-byte packets.
9. **Cloud firewalls.** VPC Flow Logs show `REJECT` for blocked traffic. Security groups are stateful; NACLs are stateless and need the ephemeral port range open for return traffic.

**Lab:** on a sandbox VM, add loss with `tc qdisc add dev eth0 root netem loss 5%`. Then find it with each tool above before removing it with `tc qdisc del dev eth0 root`. Next, fill the backlog: run a server with `listen(1)` that sleeps before accepting, hit it with `wrk`, and watch `ListenOverflows` climb.

[↑ Back to contents](#mxyrjhrn9ys.53243)

## Part 13 — The edge: CDNs, cloud load balancers and multiple zones

In real companies nginx is rarely alone. It sits in a chain of proxies, and part of expertise is knowing which layer should own each job. Plan one week.

&#91;embedded content: request path · 7 hops from client to database\]

Every hop is a separate connection with its own timeouts, so a failure anywhere surfaces to the client as a 5xx from the hop above it.

**Concepts**

- **13.1 The full request path.** Client → DNS → CDN (CloudFront, Cloudflare) → cloud load balancer → nginx → app server → app → database. Each hop can terminate TLS, cache, rate limit and log.
- **13.2 Who does what.** CDNs cache globally and absorb DDoS. Cloud load balancers provide high availability and health checks across zones. nginx handles routing, fine-grained caching, rate limits and per-app logic.
- **13.3 CDN fundamentals.** The edge caches by URL and `Cache-Control` (`s-maxage` targets shared caches). Learn cache keys, purging, origin errors and what the CDN's cache-status header tells you. Static assets should almost never reach nginx.
- **13.4 Cloud load balancers.** AWS ALB (layer 7) vs NLB (layer 4), GCP's HTTP(S) and TCP/UDP load balancers. Know which ones terminate TLS, which ones preserve the client IP, and what each health check really tests.
- **13.5 The real client IP across hops.** Every proxy appends to `X-Forwarded-For`, and anyone can forge its first entries. Trust only your own hops: `set_real_ip_from` with your load balancer's CIDR, plus `real_ip_recursive on`. Behind a layer-4 NLB, use proxy protocol (`listen 443 ssl proxy_protocol`).
- **13.6 Managed certificates.** AWS ACM and Google-managed certificates terminate TLS at the cloud load balancer and renew themselves. Then decide whether to re-encrypt to nginx (5.14).
- **13.7 Multiple availability zones.** Spread nginx and backends across zones so one zone failure doesn't take you down. Understand cross-zone load balancing and its cost.
- **13.8 Health checks at every layer.** The load balancer probes nginx; nginx passively watches the app. A shallow `/healthz` says the process is up; a deep one also checks the database. A deep check that fails during a database blip can take every node out at once.
- **13.9 The timeout chain.** Request timeouts should get shorter as you move inward, so the hop closest to the problem fails first and logs why. Idle keep-alive timeouts do the opposite: each backend's must be longer than the hop in front of it, or the load balancer reuses a connection the backend just closed and returns a sudden 502.

**In the sandbox — the capstone** (one or two 6-hour windows, fully scripted)

1. Put CloudFront or Cloudflare in front of an nginx VM. Send `Cache-Control: public, max-age=3600` on `/static/`, request twice, and find the edge's cache-hit header. Then purge.
2. Create an ALB with two nginx targets in two zones and a `/healthz` check. Stop nginx on one and time how long until the target is marked unhealthy.
3. Log `$remote_addr` and `$http_x_forwarded_for` behind the ALB. Add `set_real_ip_from` with your VPC CIDR and watch the real client IP appear.
4. Put an NLB in front with proxy protocol enabled, and configure `listen ... proxy_protocol` in nginx. Confirm the client IP survives layer 4.
5. Reproduce the idle-timeout 502: set nginx `keepalive_timeout 5s` behind the ALB's 60-second idle timeout, send sparse traffic, and catch the intermittent 502s. Then fix it.

**You've got it when** you can draw your company's edge and say which hop owns TLS, caching, health checks and the client's real IP.

[↑ Back to contents](#mxyrjhrn9ys.53243)

## Part 14 — Deploying and operating nginx in production

Getting nginx running is easy. Changing it a hundred times a year without an outage is the real job. Plan one week.

**Concepts**

- **14.1 Configuration as code.** Configs live in Git and are templated (Ansible with Jinja, Terraform plus cloud-init, or container images). Nobody hand-edits production.
- **14.2 CI for configs.** Every change runs `nginx -t` in the same nginx version as production, plus a linter such as gixy for security mistakes like unsafe `alias` or missing `Host` checks. A failed check blocks the merge.
- **14.3 nginx in containers.** The official image renders `/etc/nginx/templates/*.template` with environment variables at startup. Log to stdout and stderr. Prefer the unprivileged image variant, which runs as a non-root user on port 8080.
- **14.4 nginx in Kubernetes.** Traffic enters the cluster through an Ingress or Gateway API controller. The community ingress-nginx project was retired in March 2026 and gets no more security fixes, so learn the Gateway API. F5's NGINX Ingress Controller and NGINX Gateway Fabric are separate, maintained projects; don't confuse them.
- **14.5 Zero-downtime changes.** A reload (`nginx -s reload`) starts new workers and drains old ones, so it drops nothing. A restart drops connections. Releases are rolling, blue-green or canary, driven by upstream weights or load balancer target groups.
- **14.6 Certificate lifecycle.** Renewal must be automatic, followed by a reload (certbot's `--deploy-hook`). Monitor expiry separately, because renewal jobs fail silently. With lifetimes shrinking (5.11), this is no longer optional.
- **14.7 Logs in production.** Rotate with logrotate and `nginx -s reopen` (SIGUSR1), or ship stdout from containers. Use JSON logs (12.1) and sample very high-volume endpoints.
- **14.8 Capacity limits.** Maximum connections is roughly `worker_processes` × `worker_connections`, and a proxied request uses two connections (client and upstream). Check file descriptor limits (2.2) against that number.
- **14.9 Upgrades and patching.** Choose between nginx's mainline and stable branches, track security advisories, and patch OpenSSL as well. An upgrade is a rolling deploy like any other.
- **14.10 Alternatives worth knowing.** HAProxy (load balancing focus), Envoy (service mesh, dynamic config), Caddy (automatic HTTPS), Traefik (container discovery). Knowing their trade-offs makes you better at nginx.

**In the sandbox**

1. Put your nginx configs in Git with a CI job that runs `nginx -t` inside the official container and a linter on every pull request. Open a PR with a syntax error and watch it fail.
2. Build a Docker image that uses the templates feature for the upstream address, running as non-root on port 8080.
3. On a local kind or minikube cluster, install a Gateway API implementation and route `/api` and `/` to two services.
4. Blue-green: define two upstream groups, switch traffic between them with an include file and a reload during a `wrk` run, and confirm zero errors.
5. Set up certbot with a deploy hook that reloads nginx. Test it with `certbot renew --dry-run`, and add an expiry alarm using `openssl x509 -checkend 1209600` (14 days).
6. Configure logrotate with `postrotate nginx -s reopen` and confirm no log lines are lost during rotation.

**You've got it when** you can ship an nginx config change through a pull request, under load, with zero failed requests.

[↑ Back to contents](#mxyrjhrn9ys.53243)

## Part 15 — Capstone: build it, break it, rebuild it

The capstone ties every part together into one production-shaped system, then proves it survives failure. Plan two 6-hour sandbox windows, fully scripted so the second one starts from Git.

**What you build**

1. Terraform or CLI scripts that create a VPC across two zones, an ALB, two nginx VMs and three app VMs running Django under Gunicorn (or Spring Boot on Tomcat).
2. nginx doing path routing (`/api` vs `/static`), microcaching, rate limiting, JSON logs with timings, and security headers.
3. TLS terminated at the ALB with a managed certificate, then re-encrypted to nginx using your own CA (Part 5).
4. Configs deployed through your CI pipeline from Part 14, never by hand.
5. A dashboard with request rate, error rate and p99 latency (Part 12).

**Failure drills**

Run a steady `wrk` load during every drill. Before each one, write down what you expect to happen, then compare.

| Drill | How to cause it | What should happen |
| --- | --- | --- |
| Lose one nginx node | Stop nginx on one VM | The ALB marks it unhealthy; a few errors at most |
| Lose one app node | Kill Gunicorn on one VM | nginx retries elsewhere (9.8); users see no errors |
| Lose a whole zone | Stop every instance in one zone | The other zone carries the load, just slower |
| Slow database | Add a 3-second sleep to a query | 504s from the right hop, as the timeout chain predicts (13.9) |
| Traffic spike | Run `wrk` at ten times normal load | Rate limits return 429; the microcache absorbs reads |
| Broken config | Push a config with a typo | CI blocks it; if forced, `nginx -t` refuses the reload |
| Expired inner certificate | Swap an expired cert onto nginx's re-encryption hop | The ALB's health checks fail; your expiry alarm fires first |
| Canary release | Send 10% of traffic to a new app version via upstream weights | Errors stay at the canary; then shift to 100% |

**Deliverables for your repo**

- An architecture diagram of what you built.
- A one-page runbook using the field guide's commands.
- A short postmortem for the drill that surprised you most: what happened, how you found it, what you'd change.

**You've got it when** the system survives every drill, and you can tear it down and rebuild it from Git alone in under 30 minutes.

[↑ Back to contents](#mxyrjhrn9ys.53243)

## Learning path and milestones

The 15 parts group into five phases over about 18 weeks. Don't move to the next phase until you can pass its gate without notes.

&#91;embedded content: learning path · 5 phases, 5 gates, about 18 weeks\]

Observability (Part 12) runs underneath everything: add logging and timing to every lab, not just the dedicated week.

**A weekly rhythm that works with 6-hour sandboxes**

1. **Read (1 to 2 hours, no sandbox):** study the concepts for the part, and write down predictions for the lab.
2. **Lab session 1 (one sandbox):** build the setup from your cloud-init script and run the main exercises.
3. **Lab session 2 (a fresh sandbox):** rebuild from scratch, then break things on purpose and fix them.
4. **Write it up (30 minutes):** a short note in your repo on what surprised you. These notes become your personal nginx playbook.

**Stretch goals once you finish**

- Read nginx's source for the event loop (`src/event/`) and the HTTP request phases (`src/http/`).
- Write a small dynamic nginx module in C, or try njs (nginx's JavaScript scripting) for custom logic.
- Rebuild your Part 4 server in Go or Rust and compare it with nginx under the same load test.
- Explain the full request path from Part 13 to someone else, whiteboard only. Teaching is the final test.

[↑ Back to contents](#mxyrjhrn9ys.53243)

## Toolkit and resources

These tools come up in almost every lab. Install them in your cloud-init script so every fresh sandbox has them.

| Tool | Layer | What you use it for |
| --- | --- | --- |
| `curl -v`, `curl -I`, `curl --resolve` | HTTP, TLS | See every header; test a host before DNS points at it |
| `nc` (netcat) | TCP | Raw connections; type HTTP by hand; check if a port is open |
| `tcpdump` | Packets | Capture traffic on the server |
| Wireshark | Packets, TLS | Read captures; decrypt TLS with a key log file |
| `dig` | DNS | Records, TTLs, `+trace` the resolution chain |
| `ss -tanp` | TCP | Connection states, who owns which port |
| `openssl s_client`, `openssl x509` | TLS | Inspect handshakes, chains and certificates |
| `testssl.sh` | TLS | Audit protocols, ciphers and common TLS flaws |
| `strace` | Linux | Watch the system calls a server makes |
| `wrk`, `k6`, `h2load` | Load | Benchmark HTTP/1.1, scripted scenarios, HTTP/2 |
| `tc netem` | Network | Add latency and packet loss on purpose |
| `nginx -t`, `nginx -T`, `nginx -V` | nginx | Test config, dump full config, show build modules |
| Browser DevTools (Network tab) | HTTP | Protocol, timings, caching and cookies as a browser sees them |

**Reading list**

- [nginx documentation](https://nginx.org/en/docs/): the directive reference, plus the "How nginx processes a request" and "Server names" articles. Read them twice.
- [MDN HTTP guide](https://developer.mozilla.org/en-US/docs/Web/HTTP): the clearest practical explanation of headers, caching, CORS and cookies.
- *High Performance Browser Networking* by Ilya Grigorik, [free online](https://hpbn.co/): TCP, TLS, HTTP/2 and latency, explained for engineers.
- *HTTP: The Definitive Guide* (Gourley and Totty): older, but still the best deep dive into proxies and caching.
- *The Illustrated TLS 1.3 Connection* at [tls13.xargs.org](https://tls13.xargs.org/): every byte of a handshake, explained.
- [Mozilla SSL Configuration Generator](https://ssl-config.mozilla.org/): safe TLS settings for nginx.
- *Beej's Guide to Network Programming* at [beej.us](https://beej.us/guide/bgnet/): the classic sockets tutorial, in C but easy to follow.
- RFC 9110 (HTTP semantics), RFC 9112 (HTTP/1.1), RFC 9113 (HTTP/2), RFC 9114 (HTTP/3), RFC 8446 (TLS 1.3): read the parts you're working on, not end to end.
- [Kubernetes: Ingress NGINX retirement](https://kubernetes.io/blog/2025/11/11/ingress-nginx-retirement/): background for 14.4.

[↑ Back to contents](#mxyrjhrn9ys.53243)
