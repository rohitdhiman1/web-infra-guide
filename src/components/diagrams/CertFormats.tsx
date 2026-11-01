import { useState, type ReactNode } from 'react';
import DiagramFrame from './DiagramFrame';

type Fmt = 'pem' | 'der' | 'p12' | 'jks' | 'csr' | 'key';

const FORMATS: Record<Fmt, { name: string; ext: string; holds: string; looks: string; who: string; inspect: string; note: ReactNode }> = {
  pem: {
    name: 'PEM',
    ext: '.pem .crt .cer',
    holds: 'One or more certificates (or a key), as base64 text',
    looks: '-----BEGIN CERTIFICATE-----\nMIIDdzCCAl+gAwIBAgIUJ6k…\n-----END CERTIFICATE-----\n-----BEGIN CERTIFICATE-----\n…the intermediate…\n-----END CERTIFICATE-----',
    who: 'nginx, Apache, curl, OpenSSL, Python, Go, Kubernetes secrets',
    inspect: 'openssl x509 -in cert.pem -noout -subject -issuer -dates -ext subjectAltName',
    note: <>Just DER, base64-<strong>encoded</strong>, between BEGIN/END lines. A <code>fullchain.pem</code> holds several certificates: <strong>leaf first</strong>, then each intermediate, never the root.</>,
  },
  der: {
    name: 'DER',
    ext: '.der .cer',
    holds: 'Exactly one certificate (or key), as raw binary',
    looks: '30 82 03 77 30 82 02 5f a0 03 02 01 02 02 14 27 …\n(binary: unreadable in an editor)',
    who: 'Windows, some Java tools, hardware devices',
    inspect: 'openssl x509 -in cert.der -inform der -noout -text',
    note: <>The underlying ASN.1 encoding every certificate really is. Convert to PEM with <code>openssl x509 -inform der -in cert.der -out cert.pem</code>.</>,
  },
  p12: {
    name: 'PKCS#12',
    ext: '.p12 .pfx',
    holds: 'A private key + its certificate chain, in one password-protected binary file',
    looks: '(binary, encrypted with a password)\nbag 1: private key\nbag 2: leaf certificate\nbag 3: intermediate',
    who: 'Java (the default keystore type since Java 9), Windows, browsers importing client certs',
    inspect: 'openssl pkcs12 -in server.p12 -info -nokeys',
    note: <>The standard way to move <em>an identity</em> around: key and chain together. Build one with <code>openssl pkcs12 -export -inkey key.pem -in fullchain.pem -out server.p12</code>.</>,
  },
  jks: {
    name: 'JKS',
    ext: '.jks',
    holds: 'Java-only keystore: key entries and trusted certificate entries',
    looks: '(binary, Java-specific)\nalias "server"  → PrivateKeyEntry (key + chain)\nalias "rootca"  → trustedCertEntry',
    who: 'Older Java apps and Kafka setups',
    inspect: 'keytool -list -v -keystore server.jks',
    note: <>The legacy Java format. Prefer PKCS#12, which Java reads natively. Migrate with <code>keytool -importkeystore -srckeystore server.jks -destkeystore server.p12 -deststoretype pkcs12</code>.</>,
  },
  csr: {
    name: 'CSR',
    ext: '.csr',
    holds: 'A certificate signing request: your public key + the names you want, signed by your private key',
    looks: '-----BEGIN CERTIFICATE REQUEST-----\nMIICvDCCAaQCAQAwdzELMAkG…\n-----END CERTIFICATE REQUEST-----',
    who: 'What you send to a CA (or what certbot sends for you)',
    inspect: 'openssl req -in server.csr -noout -text -verify',
    note: <>The private key never leaves your machine: the CA signs the CSR's public key and names and returns a certificate. Create one with <code>openssl req -new -key key.pem -subj "/CN=shop.example.com" -addext "subjectAltName=DNS:shop.example.com" -out server.csr</code>.</>,
  },
  key: {
    name: 'Private key',
    ext: '.key .pem',
    holds: 'The secret half of the key pair (RSA or EC)',
    looks: '-----BEGIN PRIVATE KEY-----\nMIGHAgEAMBMGByqGSM49AgEG…\n-----END PRIVATE KEY-----',
    who: 'Only the server (or client, for mTLS) that owns the certificate',
    inspect: 'openssl pkey -in key.pem -noout -text | head -3',
    note: <>Permissions <code>600</code>, never in Git, ideally generated where it will live. Check it matches a certificate by comparing public keys: <code>openssl x509 -in cert.pem -noout -pubkey | sha256sum</code> and <code>openssl pkey -in key.pem -pubout | sha256sum</code> must be identical.</>,
  },
};

export default function CertFormats() {
  const [sel, setSel] = useState<Fmt>('pem');
  const f = FORMATS[sel];
  return (
    <DiagramFrame
      title="Certificate files, opened up"
      subtitle="click a format"
      status={
        <div className="dg-detail">
          <div>
            <strong>{f.name}</strong> ({f.ext}): {f.note}
          </div>
          <div>
            Inspect it: <code>{f.inspect}</code>
          </div>
        </div>
      }
    >
      <div className="cf">
        <div className="dg-btn-group" role="group" aria-label="Format">
          {(Object.keys(FORMATS) as Fmt[]).map((k) => (
            <button key={k} type="button" className="dg-btn" aria-pressed={sel === k} onClick={() => setSel(k)}>
              {FORMATS[k].name}
            </button>
          ))}
        </div>
        <div className="cf-body">
          <pre className="dg-code tl-wire" tabIndex={0} aria-label={`What a ${f.name} file looks like`}>
            <code>{f.looks}</code>
          </pre>
          <dl className="as-facts">
            <div>
              <dt>Holds</dt>
              <dd>{f.holds}</dd>
            </div>
            <div>
              <dt>Used by</dt>
              <dd>{f.who}</dd>
            </div>
          </dl>
        </div>
      </div>
    </DiagramFrame>
  );
}
