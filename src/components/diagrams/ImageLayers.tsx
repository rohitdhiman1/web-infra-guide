import { useState } from 'react';
import DiagramFrame from './DiagramFrame';
import { ToggleGroup } from './shared';

type Order = 'good' | 'bad';
type Change = 'code' | 'deps' | 'base';

interface Layer {
  line: string;
  /** What this layer's content depends on. */
  depends: Change[];
  seconds: number;
}

const DOCKERFILES: Record<Order, Layer[]> = {
  good: [
    { line: 'FROM eclipse-temurin:25-jre', depends: ['base'], seconds: 20 },
    { line: 'WORKDIR /app', depends: [], seconds: 0 },
    { line: 'COPY pom.xml .', depends: ['deps'], seconds: 1 },
    { line: 'RUN ./mvnw dependency:go-offline', depends: [], seconds: 90 },
    { line: 'COPY src ./src', depends: ['code'], seconds: 1 },
    { line: 'RUN ./mvnw package -DskipTests', depends: [], seconds: 40 },
    { line: 'USER 10001', depends: [], seconds: 0 },
  ],
  bad: [
    { line: 'FROM eclipse-temurin:25-jre', depends: ['base'], seconds: 20 },
    { line: 'WORKDIR /app', depends: [], seconds: 0 },
    { line: 'COPY . .', depends: ['code', 'deps'], seconds: 1 },
    { line: 'RUN ./mvnw dependency:go-offline', depends: [], seconds: 90 },
    { line: 'RUN ./mvnw package -DskipTests', depends: [], seconds: 40 },
    { line: 'USER 10001', depends: [], seconds: 0 },
  ],
};

/** A layer rebuilds if its own input changed, or any layer below it rebuilt: the cache key includes the parent. */
function plan(order: Order, change: Change) {
  let dirty = false;
  return DOCKERFILES[order].map((l) => {
    if (l.depends.includes(change)) dirty = true;
    return { ...l, rebuilt: dirty };
  });
}

const CHANGES: Record<Change, string> = {
  code: 'You edited a Java file',
  deps: 'You added a dependency to pom.xml',
  base: 'A new base image was released',
};

export default function ImageLayers() {
  const [order, setOrder] = useState<Order>('good');
  const [change, setChange] = useState<Change>('code');
  const layers = plan(order, change);
  const time = layers.filter((l) => l.rebuilt).reduce((s, l) => s + l.seconds, 0);
  const firstRebuilt = layers.findIndex((l) => l.rebuilt);

  return (
    <DiagramFrame
      title="Image layers and the build cache"
      subtitle="which layers rebuild after a change?"
      status={
        <>
          <strong>{CHANGES[change]}.</strong> Docker reuses every layer until the first one whose input changed, then
          rebuilds that layer and <strong>everything after it</strong>, because each layer's cache key includes the layer below.
          Rebuild time: <strong>about {time} s</strong>.{' '}
          {order === 'bad' && change === 'code' ? (
            <>
              <code>COPY . .</code> copies the source together with <code>pom.xml</code>, so a one-line code change also re-downloads
              every dependency. Copy the dependency manifest first.
            </>
          ) : order === 'good' && change === 'code' ? (
            <>The slow dependency download stays cached: only the source copy and the compile run again.</>
          ) : change === 'deps' ? (
            <>A dependency change really does need the download again, in either order.</>
          ) : (
            <>A new base image invalidates everything above it. That's expected, and it's how security patches reach your image.</>
          )}
        </>
      }
      controls={
        <>
          <ToggleGroup label="Dockerfile" value={order} onChange={setOrder} options={[{ value: 'good', label: 'Dependencies first' }, { value: 'bad', label: 'COPY . . first' }]} />
          <ToggleGroup label="What changed" value={change} onChange={setChange} options={(Object.keys(CHANGES) as Change[]).map((c) => ({ value: c, label: c === 'code' ? 'Source code' : c === 'deps' ? 'pom.xml' : 'Base image' }))} />
        </>
      }
    >
      <ol className="il" aria-label="Layers, bottom to top">
        {[...layers].reverse().map((l, ri) => {
          const i = layers.length - 1 - ri;
          return (
            <li key={l.line} className={`il-layer ${l.rebuilt ? 'is-rebuilt' : 'is-cached'}${i === firstRebuilt ? ' is-first' : ''}`}>
              <code>{l.line}</code>
              <span className="il-state">{l.rebuilt ? `rebuild${l.seconds ? ` · ${l.seconds} s` : ''}` : 'cached'}</span>
            </li>
          );
        })}
      </ol>
      <p className="ra-legend">Layers are stacked bottom to top, in Dockerfile order. A running container adds one writable layer above the top one.</p>
    </DiagramFrame>
  );
}
