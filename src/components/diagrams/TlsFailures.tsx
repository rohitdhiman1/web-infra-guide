import { useState, type ReactNode } from 'react';
import DiagramFrame from './DiagramFrame';

interface Failure {
  error: string;
  where: string;
  cause: ReactNode;
  check: string;
  fix: ReactNode;
}

const FAILURES: Failure[] = [
  {
    error: 'PKIX path building failed: unable to find valid certification path to requested target',
    where: 'Java (SSLHandshakeException)',
    cause: <>The Java client can't build a chain from the server's certificate to anything in <strong>its truststore</strong>. Usually a private or corporate CA that isn't in the JDK's <code>cacerts</code>, or a server that doesn't send its intermediate.</>,
    check: 'openssl s_client -connect host:443 -servername host -showcerts </dev/null',
    fix: <>Send the full chain from the server. For a private CA, import its root into the truststore the app uses (<code>keytool -importcert -alias corp-root -file root.pem -keystore truststore.p12</code>) and point the app at it.</>,
  },
  {
    error: 'certificate verify failed: unable to get local issuer certificate',
    where: 'curl, Python, OpenSSL',
    cause: <>Same problem from OpenSSL's side: a missing intermediate, or an unknown root. Browsers often succeed anyway because they fetch missing intermediates themselves (the AIA URL in the certificate), which hides the bug.</>,
    check: 'openssl s_client -connect host:443 -servername host </dev/null | grep -A3 "Certificate chain"',
    fix: <>Serve <code>fullchain.pem</code>, not just the leaf (<a href="/part-5-tls/#concept-5-5">5.5</a>).</>,
  },
  {
    error: 'No subject alternative names matching IP address / hostname mismatch',
    where: 'Java, curl, browsers (NET::ERR_CERT_COMMON_NAME_INVALID)',
    cause: <>The name you connected to isn't in the certificate's SAN list. Common when calling a service by IP, by an internal name, or through a load balancer name the certificate doesn't cover.</>,
    check: 'openssl x509 -in cert.pem -noout -ext subjectAltName',
    fix: <>Connect using a name the certificate lists, or reissue it with the extra names. Turning hostname verification off makes TLS useless against a man in the middle.</>,
  },
  {
    error: 'certificate has expired / NotAfter',
    where: 'Everything',
    cause: <>The certificate is past its <code>notAfter</code> date, or, less obviously, the <strong>client's clock</strong> is wrong (a VM with a broken clock sees valid certificates as expired or not yet valid).</>,
    check: 'openssl x509 -in cert.pem -noout -dates; date -u',
    fix: <>Renew automatically (ACME, <a href="/part-5-tls/#concept-5-12">5.12</a>), alert well before expiry, and keep clocks synced with NTP.</>,
  },
  {
    error: 'handshake_failure / no cipher suites in common / protocol_version',
    where: 'Old clients, hardened servers',
    cause: <>Client and server share no protocol version or cipher suite: for example an old Java 8 client trying TLS 1.0 against a server that only allows 1.2 and 1.3.</>,
    check: 'openssl s_client -connect host:443 -tls1_2   (then -tls1_3)',
    fix: <>Upgrade the client, or allow a modern overlap (TLS 1.2 with ECDHE + AES-GCM). Never re-enable TLS 1.0 or 1.1.</>,
  },
  {
    error: 'Server returns the wrong certificate (default site)',
    where: 'Clients that don’t send SNI',
    cause: <>The client didn't send <strong>SNI</strong>, so a server hosting many names presents its default certificate. Old clients, raw <code>openssl s_client</code> without <code>-servername</code>, some health checkers.</>,
    check: 'openssl s_client -connect host:443 </dev/null   vs   -servername host',
    fix: <>Make the client send SNI (<a href="/part-5-tls/#concept-5-8">5.8</a>). On the server, make the default certificate a deliberate choice.</>,
  },
  {
    error: 'bad_certificate / certificate_unknown during mTLS',
    where: 'mTLS servers (nginx, Kafka brokers)',
    cause: <>The <strong>client</strong> certificate was rejected: not signed by a CA in the server's trust list, expired, or issued without the <code>clientAuth</code> extended key usage (a server certificate reused as a client certificate).</>,
    check: 'openssl x509 -in client.pem -noout -ext extendedKeyUsage',
    fix: <>Issue client certificates with <code>extendedKeyUsage = clientAuth</code> from a CA the server trusts (<code>ssl_client_certificate</code> in nginx, <code>ssl.truststore.location</code> in Kafka).</>,
  },
];

export default function TlsFailures() {
  const [sel, setSel] = useState(0);
  const f = FAILURES[sel];
  return (
    <DiagramFrame
      title="Why did the handshake fail?"
      subtitle="pick the error you're seeing"
      status={
        <div className="dg-detail">
          <div>
            <span className="dg-pill info">{f.where}</span> <strong>Cause:</strong> {f.cause}
          </div>
          <div>
            <strong>Check:</strong> <code>{f.check}</code>
          </div>
          <div>
            <strong>Fix:</strong> {f.fix}
          </div>
        </div>
      }
    >
      <ol className="tf">
        {FAILURES.map((x, i) => (
          <li key={x.error}>
            <button type="button" className="tf-btn" aria-pressed={sel === i} onClick={() => setSel(i)}>
              <code>{x.error}</code>
            </button>
          </li>
        ))}
      </ol>
    </DiagramFrame>
  );
}
