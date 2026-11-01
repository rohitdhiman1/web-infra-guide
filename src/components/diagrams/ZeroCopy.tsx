import { useState, type ReactNode } from 'react';
import DiagramFrame from './DiagramFrame';
import { StepControls, ToggleGroup, arrowKeys, useStepper } from './shared';

type Mode = 'copy' | 'sendfile' | 'sg';
type Zone = 'disk' | 'cache' | 'user' | 'sock' | 'nic';

const ZONES: { id: Zone; label: string; space: 'hw' | 'kernel' | 'user' }[] = [
  { id: 'disk', label: 'Disk', space: 'hw' },
  { id: 'cache', label: 'Page cache', space: 'kernel' },
  { id: 'user', label: 'App buffer', space: 'user' },
  { id: 'sock', label: 'Socket buffer', space: 'kernel' },
  { id: 'nic', label: 'Network card', space: 'hw' },
];

interface Step {
  from?: Zone;
  to?: Zone;
  kind: 'dma' | 'cpu' | 'switch' | 'desc' | 'start';
  where: 'user' | 'kernel';
  text: ReactNode;
}

const STEPS: Record<Mode, Step[]> = {
  copy: [
    { kind: 'start', where: 'user', text: <>The app serves a file the classic way: <code>read(file, buf)</code>, then <code>write(socket, buf)</code>, in a loop. Press Next.</> },
    { kind: 'switch', where: 'kernel', text: <><code>read()</code> is a system call: the CPU switches from user mode to kernel mode (<strong>context switch 1</strong>).</> },
    { from: 'disk', to: 'cache', kind: 'dma', where: 'kernel', text: <>The disk controller copies the data into the kernel's <strong>page cache</strong> by DMA, without the CPU doing the copying (<strong>copy 1</strong>). Next time the file is already cached.</> },
    { from: 'cache', to: 'user', kind: 'cpu', where: 'user', text: <>The CPU copies the data from the page cache into the app's buffer (<strong>copy 2, by the CPU</strong>), and <code>read()</code> returns to user mode (<strong>switch 2</strong>). The app doesn't even look at the bytes.</> },
    { from: 'user', to: 'sock', kind: 'cpu', where: 'kernel', text: <><code>write()</code> enters the kernel again (<strong>switch 3</strong>), and the CPU copies the same bytes into the socket's send buffer (<strong>copy 3, by the CPU</strong>).</> },
    { from: 'sock', to: 'nic', kind: 'dma', where: 'user', text: <>The network card pulls the data from the socket buffer by DMA (<strong>copy 4</strong>), and <code>write()</code> returns (<strong>switch 4</strong>). Total: 4 copies, 2 of them by the CPU, and 4 mode switches, for data the app never needed to see.</> },
  ],
  sendfile: [
    { kind: 'start', where: 'user', text: <>Now the app calls <code>sendfile(socket, file, offset, count)</code>: “send this file to that socket”. The data never comes up to user space. Press Next.</> },
    { kind: 'switch', where: 'kernel', text: <>One system call: user mode to kernel mode (<strong>switch 1</strong>).</> },
    { from: 'disk', to: 'cache', kind: 'dma', where: 'kernel', text: <>DMA from disk into the page cache, as before (<strong>copy 1</strong>), or nothing at all if it's already cached.</> },
    { from: 'cache', to: 'sock', kind: 'cpu', where: 'kernel', text: <>The kernel copies straight from the page cache into the socket buffer (<strong>copy 2, by the CPU</strong>). The app's buffer is skipped entirely.</> },
    { from: 'sock', to: 'nic', kind: 'dma', where: 'user', text: <>DMA to the network card (<strong>copy 3</strong>), and the call returns (<strong>switch 2</strong>). Total: 3 copies (1 by the CPU) and 2 switches, instead of 4 and 4.</> },
  ],
  sg: [
    { kind: 'start', where: 'user', text: <>Same <code>sendfile()</code>, but the network card supports <strong>scatter-gather DMA</strong>, which most modern cards do. Press Next.</> },
    { kind: 'switch', where: 'kernel', text: <>One system call (<strong>switch 1</strong>).</> },
    { from: 'disk', to: 'cache', kind: 'dma', where: 'kernel', text: <>DMA into the page cache (<strong>copy 1</strong>), unless it's already cached.</> },
    { from: 'cache', to: 'sock', kind: 'desc', where: 'kernel', text: <>Instead of copying the data, the kernel only appends a <strong>descriptor</strong> to the socket buffer: “the bytes are at this page-cache address”. No data is copied by the CPU.</> },
    { from: 'cache', to: 'nic', kind: 'dma', where: 'user', text: <>The network card gathers the bytes directly from the page cache by DMA (<strong>copy 2</strong>), and the call returns (<strong>switch 2</strong>). The CPU never copies the data: <strong>true zero-copy</strong>. This is what Kafka relies on to send log segments to consumers.</> },
  ],
};

const SUMMARY: Record<Mode, { copies: number; cpu: number; switches: number }> = {
  copy: { copies: 4, cpu: 2, switches: 4 },
  sendfile: { copies: 3, cpu: 1, switches: 2 },
  sg: { copies: 2, cpu: 0, switches: 2 },
};

export default function ZeroCopy() {
  const [mode, setMode] = useState<Mode>('copy');
  const steps = STEPS[mode];
  const stepper = useStepper(steps.length);
  const cur = steps[Math.min(stepper.step, steps.length - 1)];
  const done = steps.slice(1, stepper.step + 1);
  const copies = done.filter((s) => s.kind === 'dma' || s.kind === 'cpu').length;
  const cpu = done.filter((s) => s.kind === 'cpu').length;
  const switches = mode === 'copy'
    ? [0, 1, 1, 2, 3, 4][stepper.step]
    : [0, 1, 1, 1, 2][stepper.step];
  const total = SUMMARY[mode];

  return (
    <DiagramFrame
      title="Zero-copy"
      subtitle="serving a file: read + write vs sendfile"
      onKeyDown={arrowKeys(stepper.prev, stepper.next)}
      status={cur.text}
      controls={
        <>
          <ToggleGroup
            label="How the app sends the file"
            value={mode}
            onChange={(m) => {
              setMode(m);
              stepper.reset();
            }}
            options={[
              { value: 'copy', label: 'read() + write()' },
              { value: 'sendfile', label: 'sendfile()' },
              { value: 'sg', label: 'sendfile() + scatter-gather' },
            ]}
          />
          <StepControls stepper={stepper} intro />
        </>
      }
    >
      <div className={`zc mode-${cur.where}`}>
        <div className="zc-spaces" aria-hidden="true">
          <span className={`zc-space is-user${cur.where === 'user' && stepper.step > 0 ? ' is-now' : ''}`}>user space</span>
          <span className={`zc-space is-kernel${cur.where === 'kernel' ? ' is-now' : ''}`}>kernel space</span>
        </div>
        <ol className="zc-zones" aria-label="Where the data is">
          {ZONES.map((z) => {
            const isFrom = cur.from === z.id;
            const isTo = cur.to === z.id;
            const skipped = mode !== 'copy' && z.id === 'user';
            return (
              <li key={z.id} className={`zc-zone space-${z.space}${isTo ? ' is-to' : ''}${isFrom ? ' is-from' : ''}${skipped ? ' is-skipped' : ''}`}>
                <span className="zc-zone-label">{z.label}</span>
                <span className="zc-zone-sub">{z.space === 'hw' ? 'hardware' : z.space === 'user' ? 'user space' : 'kernel'}</span>
                {isTo && (
                  <span className={`zc-chip kind-${cur.kind}`}>
                    {cur.kind === 'dma' ? 'DMA copy' : cur.kind === 'cpu' ? 'CPU copy' : 'descriptor only'}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        <dl className="zc-count">
          <div>
            <dt>Copies</dt>
            <dd>{copies} <span>of {total.copies}</span></dd>
          </div>
          <div>
            <dt>By the CPU</dt>
            <dd className={cpu ? 'is-bad' : 'is-ok'}>{cpu} <span>of {total.cpu}</span></dd>
          </div>
          <div>
            <dt>Mode switches</dt>
            <dd>{switches} <span>of {total.switches}</span></dd>
          </div>
        </dl>
      </div>
    </DiagramFrame>
  );
}
