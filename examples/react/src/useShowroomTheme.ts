/**
 * A hook reading the theme a page is shown in: the showroom's, from the `data-showroom-theme` attribute of `<html>`, or the system's outside it
 */

import { useEffect, useState } from 'react';

/**
 * Represents a theme
 */
export type Theme = 'light' | 'dark';

/**
 * Reads the current theme
 * @returns The showroom's theme, or the system's
 */
function _readTheme(): Theme {
  const attribute = document.documentElement.getAttribute('data-showroom-theme');
  if (attribute === 'light' || attribute === 'dark') return attribute;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Gets the current theme, and follows its changes
 * @returns The current theme
 */
export function useShowroomTheme(): Theme {
  const [theme, setTheme] = useState(_readTheme);
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(_readTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-showroom-theme'] });
    return () => observer.disconnect();
  }, []);
  return theme;
}
