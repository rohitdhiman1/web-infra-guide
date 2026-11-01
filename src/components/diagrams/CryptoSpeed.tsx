import { useState } from 'react';
import DiagramFrame from './DiagramFrame';

interface Row {
  name: string;
  kind: 'sym' | 'asym';
  /** Operations per second measured here. */
  ops: number;
  /** Bytes of input each operation handles, so rows compare as data per second. */
  bytes: number;
  note: string;
}

const CHUNK = 64 * 1024;

/** Runs `fn` repeatedly for about `ms` milliseconds and returns operations per second. */
async function bench(fn: () => Promise<unknown>, ms = 400) {
  let n = 0;
  const start = performance.now();
  while (performance.now() - start < ms) {
    await fn();
    n++;
  }
  return n / ((performance.now() - start) / 1000);
}

async function run(): Promise<Row[]> {
  const s = crypto.subtle;
  const data = crypto.getRandomValues(new Uint8Array(CHUNK));
  const small = crypto.getRandomValues(new Uint8Array(32));
  const iv = new Uint8Array(12);
  const aes = await s.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const ec = (await s.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify'])) as CryptoKeyPair;
  const rsa = (await s.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const ecSig = await s.sign({ name: 'ECDSA', hash: 'SHA-256' }, ec.privateKey, small);

  const aesOps = await bench(() => s.encrypt({ name: 'AES-GCM', iv }, aes, data));
  const ecSign = await bench(() => s.sign({ name: 'ECDSA', hash: 'SHA-256' }, ec.privateKey, small));
  const ecVerify = await bench(() => s.verify({ name: 'ECDSA', hash: 'SHA-256' }, ec.publicKey, ecSig, small));
  const rsaSign = await bench(() => s.sign('RSASSA-PKCS1-v1_5', rsa.privateKey, small));
  return [
    { name: 'AES-256-GCM encrypt', kind: 'sym', ops: aesOps, bytes: CHUNK, note: 'symmetric' },
    { name: 'ECDSA P-256 sign', kind: 'asym', ops: ecSign, bytes: 32, note: 'asymmetric' },
    { name: 'ECDSA P-256 verify', kind: 'asym', ops: ecVerify, bytes: 32, note: 'asymmetric' },
    { name: 'RSA-2048 sign', kind: 'asym', ops: rsaSign, bytes: 32, note: 'asymmetric' },
  ];
}

export default function CryptoSpeed() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const rate = (r: Row) => r.ops * r.bytes; // bytes per second
  const max = rows ? Math.max(...rows.map(rate)) : 1;
  const log = (v: number) => Math.log10(Math.max(1, v));
  const aes = rows?.[0];
  const rsa = rows?.[3];
  const fmt = (b: number) => (b >= 1e6 ? `${Math.round(b / 1e6).toLocaleString('en-US')} MB/s` : `${Math.round(b / 1e3).toLocaleString('en-US')} KB/s`);
  // Two significant figures: a half-second benchmark doesn't justify more.
  const ratio = aes && rsa ? Number((rate(aes) / rate(rsa)).toPrecision(2)) : 0;

  return (
    <DiagramFrame
      title="How fast is each, on this device?"
      subtitle="measured live with the Web Crypto API"
      status={
        err ? (
          <>The Web Crypto API isn't available here (it needs HTTPS or localhost).</>
        ) : !rows ? (
          <>Press <strong>Measure</strong>. It runs each operation for about half a second, on this device, in this browser.</>
        ) : (
          <>
            AES-GCM encrypted about <strong>{fmt(rate(aes!))}</strong>. RSA-2048, working on 32-byte pieces, would get through about{' '}
            <strong>{fmt(rate(rsa!))}</strong>: roughly <strong>{ratio.toLocaleString('en-US')}× slower</strong> ({Math.round(rsa!.ops).toLocaleString('en-US')}{' '}
            signatures per second). That's why every real system uses asymmetric cryptography only to set up or protect a symmetric key. ECDSA
            signs far faster than RSA, which is why busy servers prefer ECDSA certificates.
          </>
        )
      }
      controls={
        <div className="dg-row">
          <button
            type="button"
            className="dg-btn is-primary"
            aria-disabled={busy}
            onClick={async () => {
              if (busy) return;
              if (!globalThis.crypto?.subtle) {
                setErr(true);
                return;
              }
              setBusy(true);
              try {
                setRows(await run());
              } catch {
                setErr(true);
              }
              setBusy(false);
            }}
          >
            {busy ? 'Measuring…' : rows ? 'Measure again' : 'Measure'}
          </button>
        </div>
      }
    >
      <div className="spd" aria-live="polite">
        {(rows ?? []).map((r) => (
          <div key={r.name} className="spd-row">
            <span className="spd-name">
              {r.name} <span className={`dg-pill ${r.kind === 'sym' ? 'ok' : 'info'}`}>{r.note}</span>
            </span>
            <div className="spd-bar">
              <span className={r.kind === 'sym' ? 'is-sym' : 'is-asym'} style={{ width: `${(log(rate(r)) / log(max)) * 100}%` }} />
            </div>
            <span className="spd-val">
              {fmt(rate(r))}
              <small>{Math.round(r.ops).toLocaleString('en-US')} ops/s × {r.bytes >= 1024 ? `${r.bytes / 1024} KB` : `${r.bytes} B`}</small>
            </span>
          </div>
        ))}
        <p className="ra-legend">Bars show data processed per second, on a logarithmic scale (each step is ten times more).</p>
      </div>
    </DiagramFrame>
  );
}
