/**
 * A stopwatch: start, stop and reset, showing the elapsed time in hundredths
 */

import { useEffect, useState } from 'react';
import { formatElapsed } from './format.js';
import './ticker.css';

/**
 * Represents a stopwatch's properties
 */
export interface StopwatchProps {
  /**
   * Milliseconds between updates of the display (10 by default)
   */
  interval?: number;
}

/**
 * Renders a stopwatch
 * @param props The stopwatch's properties
 * @returns The stopwatch
 */
export function Stopwatch({ interval = 10 }: StopwatchProps) {
  const [elapsed, setElapsed] = useState(0);
  const [startedAt, setStartedAt] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (startedAt === undefined) return undefined;
    const timer = setInterval(() => setElapsed(Date.now() - startedAt), interval);
    return () => clearInterval(timer);
  }, [startedAt, interval]);

  const toggle = (): void => setStartedAt(startedAt === undefined ? Date.now() - elapsed : undefined);
  const reset = (): void => {
    setElapsed(0);
    setStartedAt(startedAt === undefined ? undefined : Date.now());
  };
  return (
    <div>
      <div className="ticker-display">{formatElapsed(elapsed)}</div>
      <div className="ticker-row">
        <button onClick={toggle}>{startedAt === undefined ? 'Start' : 'Stop'}</button>
        <button onClick={reset}>Reset</button>
      </div>
    </div>
  );
}
