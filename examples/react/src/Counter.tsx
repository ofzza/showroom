/**
 * A counter: a number stepped up and down between bounds
 */

import { useState } from 'react';
import './ticker.css';

/**
 * Represents a counter's properties
 */
export interface CounterProps {
  /**
   * The label shown before the number
   */
  label: string;
  /**
   * The number it starts at (0 by default)
   */
  start?: number;
  /**
   * How much each click adds or takes away (1 by default)
   */
  step?: number;
  /**
   * The lowest number it goes down to
   */
  min?: number;
  /**
   * The highest number it goes up to
   */
  max?: number;
  /**
   * Called with the new number after every change
   */
  onChange?: (value: number) => void;
}

/**
 * Renders a counter
 * @param props The counter's properties
 * @returns The counter
 */
export function Counter({ label, start = 0, step = 1, min = -Infinity, max = Infinity, onChange }: CounterProps) {
  const [value, setValue] = useState(start);
  const change = (by: number): void => {
    const next = Math.min(max, Math.max(min, value + by));
    setValue(next);
    onChange?.(next);
  };
  return (
    <div className="ticker-row">
      <span>{label}</span>
      <button onClick={() => change(-step)} disabled={value <= min}>
        −{step}
      </button>
      <strong className="ticker-display">{value}</strong>
      <button onClick={() => change(step)} disabled={value >= max}>
        +{step}
      </button>
    </div>
  );
}
