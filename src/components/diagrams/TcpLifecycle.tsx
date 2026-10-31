import { useState, type ReactNode } from 'react';
import DiagramFrame from './DiagramFrame';
import Sequence, { type Message, type Phase } from './Sequence';
import { StepControls, ToggleGroup, arrowKeys, useStepper } from './shared';

interface Step {
  msg?: Message;
  client: string;
  server: string;
  text: ReactNode;
}

const OPEN: Step[] = [
  {
    client: 'CLOSED',
    server: 'LISTEN',
    text: (
      <>
        The server has called <code>bind()</code> and <code>listen()</code> on port 80, so <code>ss -tan</code> shows it
        in <strong>LISTEN</strong>. The client has no socket yet. Press Next.
      </>
    ),
  },
  {
    msg: { from: 'client', to: 'server', label: 'SYN', sub: 'seq=100' },
    client: 'SYN-SENT',
    server: 'SYN-RECV',
    text: (
      <>
        The client calls <code>connect()</code> and sends a <strong>SYN</strong> with a random starting sequence
        number. The server puts the half-open connection in its SYN queue: <strong>SYN-RECV</strong>.
      </>
    ),
  },
  {
    msg: { from: 'server', to: 'client', label: 'SYN-ACK', sub: 'seq=300 ack=101' },
    client: 'ESTAB',
    server: 'SYN-RECV',
    text: (
      <>
        The server answers <strong>SYN-ACK</strong>: its own sequence number, and an acknowledgement of the client's.
        On receiving it, the client considers the connection <strong>ESTAB</strong>lished.
      </>
    ),
  },
  {
    msg: { from: 'client', to: 'server', label: 'ACK', sub: 'ack=301' },
    client: 'ESTAB',
    server: 'ESTAB',
    text: (
      <>
        The final <strong>ACK</strong> completes the three-way handshake. The connection moves to the accept queue
        (the listen backlog) until the server calls <code>accept()</code>. One full round trip has passed and no data
        has moved yet.
      </>
    ),
  },
  {
    msg: { from: 'client', to: 'server', label: 'GET / HTTP/1.1', sub: 'PSH, ACK · 78 bytes', tone: 'data' },
    client: 'ESTAB',
    server: 'ESTAB',
    text: (
      <>
        Now data flows. The HTTP request is just bytes in the TCP stream; TCP numbers and acknowledges every byte, and
        retransmits anything that's lost.
      </>
    ),
  },
  {
    msg: { from: 'server', to: 'client', label: 'HTTP/1.1 200 OK', sub: 'PSH, ACK · 1,256 bytes', tone: 'data' },
    client: 'ESTAB',
    server: 'ESTAB',
    text: (
      <>
        The response comes back on the same connection. With keep-alive, more requests could follow here without a
        new handshake.
      </>
    ),
  },
];

const FIN_CLOSE: Step[] = [
  {
    msg: { from: 'client', to: 'server', label: 'FIN', sub: 'client closes first', tone: 'muted' },
    client: 'FIN-WAIT-1',
    server: 'CLOSE-WAIT',
    text: (
      <>
        The client calls <code>close()</code> and sends <strong>FIN</strong>: "I have nothing more to send." The server
        moves to <strong>CLOSE-WAIT</strong> until its application closes the socket too.
      </>
    ),
  },
  {
    msg: { from: 'server', to: 'client', label: 'ACK', tone: 'muted' },
    client: 'FIN-WAIT-2',
    server: 'CLOSE-WAIT',
    text: (
      <>
        The server acknowledges the FIN. The client now waits in <strong>FIN-WAIT-2</strong> for the server's own FIN.
        Lots of sockets stuck in CLOSE-WAIT on a server means the app forgets to close them.
      </>
    ),
  },
  {
    msg: { from: 'server', to: 'client', label: 'FIN', tone: 'muted' },
    client: 'FIN-WAIT-2',
    server: 'LAST-ACK',
    text: (
      <>
        The server's application closes its side and sends its own <strong>FIN</strong>, then waits in{' '}
        <strong>LAST-ACK</strong>.
      </>
    ),
  },
  {
    msg: { from: 'client', to: 'server', label: 'ACK', tone: 'muted' },
    client: 'TIME-WAIT',
    server: 'CLOSED',
    text: (
      <>
        The client acknowledges and enters <strong>TIME-WAIT</strong>. The server is done. The side that closed first
        is the one that waits.
      </>
    ),
  },
  {
    client: 'CLOSED',
    server: 'CLOSED',
    text: (
      <>
        After 60 seconds on Linux, TIME-WAIT expires and the 4-tuple (and its ephemeral port) can be reused. A proxy
        opening thousands of short connections per second can have tens of thousands of ports parked in TIME-WAIT.
      </>
    ),
  },
];

const RST_CLOSE: Step[] = [
  {
    msg: { from: 'client', to: 'server', label: 'RST', sub: 'abrupt close', tone: 'bad' },
    client: 'CLOSED',
    server: 'CLOSED',
    text: (
      <>
        An <strong>RST</strong> tears the connection down at once: no FIN exchange and no TIME-WAIT. Unread data is
        discarded, and the other side's next read fails with "Connection reset by peer". It's also what comes back
        when you connect to a port where nothing is listening: "Connection refused".
      </>
    ),
  },
];

export default function TcpLifecycle() {
  const [close, setClose] = useState<'fin' | 'rst'>('fin');
  const steps = [...OPEN, ...(close === 'fin' ? FIN_CLOSE : RST_CLOSE)];
  const stepper = useStepper(steps.length);
  const cur = steps[Math.min(stepper.step, steps.length - 1)];
  const messages = steps.flatMap((s) => (s.msg ? [s.msg] : []));
  const shown = steps.slice(0, stepper.step + 1).filter((s) => s.msg).length;
  const phases: Phase[] = [
    { label: 'Handshake', start: 0, end: 2 },
    { label: 'Data', start: 3, end: 4 },
    { label: 'Teardown', start: 5, end: messages.length - 1 },
  ];

  return (
    <DiagramFrame
      title="TCP connection lifecycle"
      subtitle="handshake, data, teardown"
      onKeyDown={arrowKeys(stepper.prev, stepper.next)}
      status={cur.text}
      controls={
        <>
          <StepControls stepper={stepper} intro />
          <ToggleGroup
            label="Close with"
            value={close}
            onChange={(v) => {
              setClose(v);
              if (stepper.step >= OPEN.length) stepper.setStep(OPEN.length - 1);
            }}
            options={[
              { value: 'fin', label: 'FIN (graceful)' },
              { value: 'rst', label: 'RST (abrupt)' },
            ]}
          />
        </>
      }
    >
      <Sequence
        label="Sequence diagram of TCP packets between client and server, with each side's socket state"
        actors={[
          { id: 'client', label: 'Client', sub: '10.0.0.5:51514' },
          { id: 'server', label: 'Server', sub: '10.0.0.9:80' },
        ]}
        messages={messages}
        shown={shown}
        states={{ client: cur.client, server: cur.server }}
        phases={phases}
        colWidth={190}
      />
    </DiagramFrame>
  );
}
