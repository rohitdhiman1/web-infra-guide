import { useState } from 'react';
import DiagramFrame from './DiagramFrame';
import { ToggleGroup } from './shared';

const LIMITS = ['1024', '2048', '4096'] as const;
const PERCENTS = ['25', '50', '75', '90'] as const;
const THREADS = ['50', '200', '500'] as const;
type Limit = (typeof LIMITS)[number];
type Pct = (typeof PERCENTS)[number];
type Threads = (typeof THREADS)[number];

/** Rough, typical sizes for a Spring Boot service; real numbers vary with the app. */
function budget(limitMb: number, pct: number, threads: number) {
  const heap = Math.round((limitMb * pct) / 100);
  const parts = [
    { key: 'heap', label: 'Heap (-XX:MaxRAMPercentage)', mb: heap },
    { key: 'meta', label: 'Metaspace (loaded classes)', mb: 120 },
    { key: 'code', label: 'Code cache (JIT)', mb: 48 },
    { key: 'threads', label: `Thread stacks (${threads} × 1 MB)`, mb: threads },
    { key: 'direct', label: 'Direct buffers (Netty, NIO, Kafka client)', mb: 128 },
    { key: 'gc', label: 'GC and JVM internals', mb: Math.round(heap * 0.05) + 40 },
  ];
  const total = parts.reduce((s, p) => s + p.mb, 0);
  return { parts, total, heap };
}

export default function JvmMemory() {
  const [limit, setLimit] = useState<Limit>('2048');
  const [pct, setPct] = useState<Pct>('25');
  const [threads, setThreads] = useState<Threads>('200');
  const L = Number(limit);
  const b = budget(L, Number(pct), Number(threads));
  const over = b.total > L;
  const tight = !over && b.total > L * 0.9;
  const scale = Math.max(L, b.total);

  return (
    <DiagramFrame
      title="A JVM's memory inside a container"
      subtitle="the heap is only part of it"
      status={
        <>
          <strong>
            {b.total.toLocaleString('en-US')} MB of {L.toLocaleString('en-US')} MB
          </strong>{' '}
          (typical sizes for a Spring Boot service).{' '}
          {over ? (
            <>
              <span className="dg-pill bad">OOM kill</span> The process needs more than the limit, so the kernel kills it: exit code
              137, with no Java <code>OutOfMemoryError</code> and no heap dump. The heap was given too much of the container.
            </>
          ) : tight ? (
            <>
              <span className="dg-pill warn">tight</span> It fits, barely. Traffic spikes (more threads, bigger direct buffers)
              could push it over the limit.
            </>
          ) : pct === '25' ? (
            <>
              <span className="dg-pill warn">wasted</span> The default heap is only {b.heap} MB, a quarter of the container, so
              most of the memory you pay for sits unused, and the heap fills and runs GC more often than it needs to.
            </>
          ) : (
            <>
              <span className="dg-pill ok">balanced</span> A good heap size, with room for everything that lives outside it.
            </>
          )}
        </>
      }
      controls={
        <>
          <ToggleGroup label="Container memory (--memory)" value={limit} onChange={setLimit} options={LIMITS.map((l) => ({ value: l, label: `${Number(l) / 1024} GB` }))} />
          <ToggleGroup label="Heap share (MaxRAMPercentage)" value={pct} onChange={setPct} options={PERCENTS.map((p) => ({ value: p, label: p === '25' ? '25% (default)' : `${p}%` }))} />
          <ToggleGroup label="Threads" value={threads} onChange={setThreads} options={THREADS.map((t) => ({ value: t, label: t }))} />
        </>
      }
    >
      <div className="jvm">
        <div className="jvm-bar" role="img" aria-label={`Memory: ${b.total} MB used against a ${L} MB limit`}>
          {b.parts.map((p) => (
            <span key={p.key} className={`jvm-seg seg-${p.key}`} style={{ width: `${(p.mb / scale) * 100}%` }} title={`${p.label}: ${p.mb} MB`} />
          ))}
          <span className={`jvm-limit${over ? ' is-over' : ''}`} style={{ left: `${(L / scale) * 100}%` }}>
            <span>limit</span>
          </span>
        </div>
        <ul className="jvm-legend">
          {b.parts.map((p) => (
            <li key={p.key}>
              <span className={`jvm-swatch seg-${p.key}`} aria-hidden="true" />
              {p.label}: <strong>{p.mb.toLocaleString('en-US')} MB</strong>
            </li>
          ))}
        </ul>
      </div>
    </DiagramFrame>
  );
}
