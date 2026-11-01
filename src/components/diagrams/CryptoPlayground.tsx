import { useEffect, useState } from 'react';
import DiagramFrame from './DiagramFrame';
import { Switch } from './shared';

/** Everything here is computed by the browser's Web Crypto API: real algorithms, nothing simulated. */
const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

interface Keys {
  hmac: CryptoKey;
  aes: CryptoKey;
  sign: CryptoKeyPair;
}

interface Result {
  base64: string;
  sha256: string;
  hmac: string;
  cipher: string;
  signature: string;
  // What happens on the receiving side after the message is tampered with.
  decodeOk: string;
  hashMatch: boolean;
  hmacValid: boolean;
  decryptOk: boolean;
  sigValid: boolean;
}

async function compute(keys: Keys, text: string, tamper: boolean): Promise<Result> {
  const data = enc.encode(text);
  const iv = new Uint8Array(12); // fixed IV only so the demo is stable; never reuse an IV with a real key
  const [sha, mac, ct, sig] = await Promise.all([
    crypto.subtle.digest('SHA-256', data),
    crypto.subtle.sign('HMAC', keys.hmac, data),
    crypto.subtle.encrypt({ name: 'AES-GCM', iv }, keys.aes, data),
    crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.sign.privateKey, data),
  ]);
  // An attacker flips one character of the message (and one bit of the ciphertext) in transit.
  const received = tamper ? text.replace(/.$/, (c) => (c === 'X' ? 'Y' : 'X')) : text;
  const rdata = enc.encode(received);
  const ctBytes = new Uint8Array(ct);
  const rct = tamper ? ctBytes.map((b, i) => (i === 0 ? b ^ 1 : b)) : ctBytes;
  const [rsha, hmacValid, sigValid] = await Promise.all([
    crypto.subtle.digest('SHA-256', rdata),
    crypto.subtle.verify('HMAC', keys.hmac, mac, rdata),
    crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, keys.sign.publicKey, sig, rdata),
  ]);
  let decryptOk = true;
  try {
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, keys.aes, rct);
  } catch {
    decryptOk = false;
  }
  return {
    base64: b64(data),
    sha256: hex(sha),
    hmac: hex(mac),
    cipher: b64(ctBytes),
    signature: b64(new Uint8Array(sig)),
    decodeOk: received,
    hashMatch: hex(rsha) === hex(sha),
    hmacValid,
    decryptOk,
    sigValid,
  };
}

export default function CryptoPlayground() {
  const [text, setText] = useState('{"orderId": "ord_1", "amount": 3000}');
  const [tamper, setTamper] = useState(false);
  const [keys, setKeys] = useState<Keys | null>(null);
  const [r, setR] = useState<Result | null>(null);
  const [unsupported, setUnsupported] = useState(false);

  useEffect(() => {
    if (!globalThis.crypto?.subtle) {
      setUnsupported(true);
      return;
    }
    (async () => {
      const [hmac, aes, sign] = await Promise.all([
        crypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']),
        crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']),
        crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']),
      ]);
      setKeys({ hmac, aes, sign: sign as CryptoKeyPair });
    })().catch(() => setUnsupported(true));
  }, []);

  useEffect(() => {
    if (keys) compute(keys, text || ' ', tamper).then(setR).catch(() => setUnsupported(true));
  }, [keys, text, tamper]);

  const rows = r && [
    {
      name: 'Encoding',
      algo: 'Base64',
      key: 'none',
      out: r.base64,
      check: <>Anyone decodes it: <code>{r.decodeOk}</code></>,
      ok: null,
    },
    {
      name: 'Hashing',
      algo: 'SHA-256',
      key: 'none',
      out: r.sha256,
      check: r.hashMatch ? <>Recomputed hash matches</> : <>Hash differs: the change is detected, but anyone could recompute a new hash for the changed text</>,
      ok: r.hashMatch,
    },
    {
      name: 'MAC',
      algo: 'HMAC-SHA256',
      key: 'shared secret',
      out: r.hmac,
      check: r.hmacValid ? <>Valid: unchanged, and made by someone holding the secret</> : <>Invalid: an attacker can't forge a new one without the secret</>,
      ok: r.hmacValid,
    },
    {
      name: 'Encryption',
      algo: 'AES-256-GCM',
      key: 'shared secret',
      out: r.cipher,
      check: r.decryptOk ? <>Decrypts back to the original</> : <>Decryption refused: GCM's built-in tag detects the flipped bit</>,
      ok: r.decryptOk,
    },
    {
      name: 'Signature',
      algo: 'ECDSA P-256',
      key: 'private key signs, public key verifies',
      out: r.signature,
      check: r.sigValid ? <>Valid for this public key</> : <>Invalid: only the private key's owner could sign the changed text</>,
      ok: r.sigValid,
    },
  ];

  return (
    <DiagramFrame
      title="One message, five transformations"
      subtitle="computed live by your browser's Web Crypto API"
      status={
        unsupported ? (
          <>This browser doesn't expose the Web Crypto API here (it needs HTTPS or localhost), so the playground can't run.</>
        ) : tamper ? (
          <>
            <strong>Tampered in transit:</strong> the last character changed. Encoding hides nothing and detects nothing. A plain hash
            notices, but an attacker can just send a new hash. The MAC, the AEAD cipher and the signature all catch it, because
            producing a valid one needs a key the attacker doesn't have.
          </>
        ) : (
          <>
            Type anything. Each output is real: base64 and SHA-256 need no key, HMAC and AES use a random secret key, and the
            signature uses a fresh P-256 key pair. Then switch on tampering.
          </>
        )
      }
      controls={
        <div className="dg-toggle">
          <span className="dg-label">In transit</span>
          <Switch checked={tamper} onChange={setTamper}>
            An attacker changes one character
          </Switch>
        </div>
      }
    >
      <label className="cp-input">
        <span className="dg-label">Message</span>
        <input type="text" value={text} maxLength={120} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      </label>
      {rows && (
        <ol className="cpg">
          {rows.map((row) => (
            <li key={row.name} className="cpg-row">
              <div className="cpg-head">
                <strong>{row.name}</strong> <span className="dg-pill info">{row.algo}</span>
                <span className="cpg-key">key: {row.key}</span>
              </div>
              <code className="cpg-out">{row.out}</code>
              <div className={`cpg-check${row.ok === false ? ' is-bad' : row.ok ? ' is-ok' : ''}`}>{row.check}</div>
            </li>
          ))}
        </ol>
      )}
    </DiagramFrame>
  );
}
