import { useState } from 'react';
import DiagramFrame from './DiagramFrame';

type Kind = 'tty' | 'file' | 'socket' | 'listen' | 'pipe';
interface Fd {
  n: number;
  kind: Kind;
  what: string;
}

const START: Fd[] = [
  { n: 0, kind: 'tty', what: 'stdin  → /dev/pts/0' },
  { n: 1, kind: 'tty', what: 'stdout → /dev/pts/0' },
  { n: 2, kind: 'tty', what: 'stderr → /dev/pts/0' },
  { n: 3, kind: 'listen', what: 'TCP *:8080 (LISTEN)' },
];

/** The lowest free number is always used: that's a POSIX rule, and why fds get reused. */
function lowestFree(fds: Fd[]) {
  let n = 0;
  while (fds.some((f) => f.n === n)) n++;
  return n;
}

export default function FdTable() {
  const [fds, setFds] = useState<Fd[]>(START);
  const [limit, setLimit] = useState(10);
  const [msg, setMsg] = useState<{ text: string; bad?: boolean }>({
    text: 'A process starts with 0, 1 and 2, and here a listening socket on 3. Open files and accept connections, and watch what each one costs.',
  });
  const [clients, setClients] = useState(0);

  const add = (kind: Kind, what: string, count = 1) => {
    if (fds.length + count > limit) {
      setMsg({
        text: `${kind === 'socket' ? 'accept()' : kind === 'pipe' ? 'pipe()' : 'open()'} failed: EMFILE, “Too many open files”. The process has ${fds.length} of its ${limit} allowed descriptors in use. New connections now sit in the listen backlog until it fills, and the server looks dead to new clients while existing ones work fine.`,
        bad: true,
      });
      return;
    }
    const next = [...fds];
    const made: number[] = [];
    for (let i = 0; i < count; i++) {
      const n = lowestFree(next);
      next.push({ n, kind, what: count === 2 ? `pipe ${i === 0 ? 'read end' : 'write end'}` : what });
      made.push(n);
    }
    next.sort((a, b) => a.n - b.n);
    setFds(next);
    setMsg({
      text:
        kind === 'socket'
          ? `accept() returned fd ${made[0]}: every client connection is its own file descriptor, separate from the listening socket.`
          : kind === 'pipe'
            ? `pipe() returned two descriptors, ${made[0]} and ${made[1]}: one to read, one to write.`
            : `open() returned fd ${made[0]}, the lowest free number. A log file or config file costs a descriptor too, as long as it's open.`,
    });
  };

  const closeOne = () => {
    const closable = fds.filter((f) => f.n > 3);
    if (!closable.length) return;
    const victim = closable.find((f) => f.kind === 'socket') ?? closable[0];
    setFds(fds.filter((f) => f !== victim));
    setMsg({ text: `close(${victim.n}): descriptor ${victim.n} is free again, and the next open or accept will reuse that exact number. Forgetting to close is a leak: the count only goes up.` });
  };

  const reset = () => {
    setFds(START);
    setLimit(10);
    setClients(0);
    setMsg({ text: 'Back to the start: 0, 1, 2 and the listening socket on 3.' });
  };

  const used = fds.length;

  return (
    <DiagramFrame
      title="A process’s file descriptor table"
      subtitle={`ulimit -n ${limit} (shrunk so the limit is easy to hit)`}
      status={msg.bad ? <><span className="dg-pill bad">EMFILE</span> {msg.text}</> : msg.text}
      controls={
        <div className="dg-toggle">
          <span className="dg-label">System calls</span>
          <div className="dg-btn-group">
            <button
              type="button"
              className="dg-btn is-primary"
              onClick={() => {
                setClients((c) => c + 1);
                add('socket', `TCP 10.0.1.25:8080 ↔ 203.0.113.${(clients % 200) + 9}:5${String(1000 + clients).slice(-4)}`);
              }}
            >
              accept() a client
            </button>
            <button type="button" className="dg-btn" onClick={() => add('file', '/var/log/app.log')}>
              open() a file
            </button>
            <button type="button" className="dg-btn" onClick={() => add('pipe', '', 2)}>
              pipe()
            </button>
            <button type="button" className="dg-btn" aria-disabled={!fds.some((f) => f.n > 3)} onClick={closeOne}>
              close()
            </button>
            <button
              type="button"
              className="dg-btn"
              onClick={() => {
                setLimit((l) => l + 10);
                setMsg({ text: `Raised the limit to ${limit + 10}. In production this is LimitNOFILE= in the systemd unit, or nofile in /etc/security/limits.conf: typically 65,536 or more for proxies and brokers.` });
              }}
            >
              Raise the limit (+10)
            </button>
            <button type="button" className="dg-btn" onClick={reset}>
              Reset
            </button>
          </div>
        </div>
      }
    >
      <div className="fdt">
        <div className="fdt-meter" role="meter" aria-label="Descriptors in use" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used}>
          <span className={used >= limit ? 'is-full' : used >= limit * 0.8 ? 'is-high' : ''} style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} />
        </div>
        <div className="fdt-count">
          {used} of {limit} descriptors in use <code>ls -l /proc/$PID/fd | wc -l</code>
        </div>
        <ol className="fdt-list" aria-label="File descriptors">
          {fds.map((f) => (
            <li key={`${f.n}-${f.what}`} className={`fdt-row kind-${f.kind}`}>
              <span className="fdt-n">{f.n}</span>
              <span className="fdt-kind">{f.kind === 'listen' ? 'socket' : f.kind === 'tty' ? 'terminal' : f.kind}</span>
              <span className="fdt-what">{f.what}</span>
            </li>
          ))}
        </ol>
      </div>
    </DiagramFrame>
  );
}
