import type { KeyboardEventHandler, ReactNode } from 'react';
import './diagram.css';

interface Props {
  /** Short name shown at the top of the diagram. */
  title: string;
  /** One-line description (from the guide's placeholder). */
  subtitle?: string;
  children: ReactNode;
  /** Live status text, announced to screen readers when it changes. */
  status?: ReactNode;
  /** Buttons / toggles shown under the diagram. */
  controls?: ReactNode;
  className?: string;
  /** e.g. arrow-key stepping; fires for key presses anywhere inside the diagram. */
  onKeyDown?: KeyboardEventHandler;
}

/** Shared chrome for every interactive diagram: header, figure, live status, controls. */
export default function DiagramFrame({ title, subtitle, children, status, controls, className, onKeyDown }: Props) {
  return (
    <figure className={`dg not-content ${className ?? ''}`} aria-label={title} onKeyDown={onKeyDown}>
      <figcaption className="dg-head">
        <span className="dg-title">{title}</span>
        {subtitle && <span className="dg-sub">{subtitle}</span>}
      </figcaption>
      <div className="dg-body">{children}</div>
      {status !== undefined && (
        <div className="dg-status" role="status" aria-live="polite">
          {status}
        </div>
      )}
      {controls && <div className="dg-controls">{controls}</div>}
    </figure>
  );
}
