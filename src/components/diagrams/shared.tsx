import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

/* ------------------------------------------------------------------ stepper */

export function useStepper(total: number, initial = 0) {
  const [step, setStep] = useState(initial);
  // Keep the step in range if the number of steps changes (e.g. a mode toggle).
  useEffect(() => {
    if (step > total - 1) setStep(Math.max(0, total - 1));
  }, [total, step]);
  const next = useCallback(() => setStep((s) => Math.min(total - 1, s + 1)), [total]);
  const prev = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);
  const reset = useCallback(() => setStep(initial), [initial]);
  return { step, setStep, next, prev, reset, atStart: step === 0, atEnd: step >= total - 1, total };
}

/**
 * Arrow-key handler for a diagram: ← / → step backwards and forwards while
 * focus is anywhere inside the diagram (except form fields).
 */
export function arrowKeys(prev: () => void, next: () => void) {
  return (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('input, select, textarea')) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      next();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prev();
    }
  };
}

interface StepControlsProps {
  stepper: ReturnType<typeof useStepper>;
  /** Text for the counter, e.g. "Step 3 of 8". */
  counter?: ReactNode;
  /** Step 0 is an intro screen: count it as "Start" and number the rest 1…n. */
  intro?: boolean;
  children?: ReactNode;
}

/**
 * Prev / Next / Reset. Buttons use aria-disabled rather than `disabled`, so
 * keyboard focus is never lost when you reach the first or last step.
 */
export function StepControls({ stepper, counter, intro, children }: StepControlsProps) {
  const { prev, next, reset, atStart, atEnd, step, total } = stepper;
  const text = counter ?? (intro ? (step === 0 ? 'Start' : `Step ${step} of ${total - 1}`) : `Step ${step + 1} of ${total}`);
  return (
    <div className="dg-row">
      <button type="button" className="dg-btn" onClick={prev} aria-disabled={atStart} aria-label="Previous step">
        ← Prev
      </button>
      <button
        type="button"
        className="dg-btn is-primary"
        onClick={next}
        aria-disabled={atEnd}
        aria-label="Next step"
      >
        Next →
      </button>
      <button type="button" className="dg-btn" onClick={reset} aria-disabled={atStart}>
        Reset
      </button>
      <span className="dg-progress" aria-hidden="true">
        {text}
      </span>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ toggles */

interface ToggleGroupProps<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  /** Hide the visible label (it is still announced). */
  hideLabel?: boolean;
}

/** A row of mutually exclusive buttons (aria-pressed), e.g. a mode switch. */
export function ToggleGroup<T extends string>({ label, value, options, onChange, hideLabel }: ToggleGroupProps<T>) {
  return (
    <div className="dg-toggle" role="group" aria-label={label}>
      {!hideLabel && <span className="dg-label">{label}</span>}
      <div className="dg-btn-group">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className="dg-btn"
            aria-pressed={value === o.value}
            title={o.title}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** A single on/off button. */
export function Switch({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className="dg-btn dg-switch" aria-pressed={checked} onClick={() => onChange(!checked)}>
      <span className="dg-switch-track" aria-hidden="true">
        <span className="dg-switch-thumb" />
      </span>
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ timers */

/** Calls fn every `ms` while `running` is true. */
export function useInterval(fn: () => void, ms: number, running: boolean) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => ref.current(), ms);
    return () => window.clearInterval(id);
  }, [ms, running]);
}

/** A DOM-safe id for SVG references (React's useId can contain ':' or '«'). */
export function safeId(id: string) {
  return id.replace(/[^a-zA-Z0-9_-]/g, '');
}
