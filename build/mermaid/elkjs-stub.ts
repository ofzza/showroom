/**
 * Stub module standing in for `elkjs` in the Mermaid bundle: Mermaid imports it for its `elk` layout, which `showroom` never asks for (its pages set
 * `layout: 'dagre'`), so none of elkjs's code is ever shipped. Constructing it throws, should anything ever ask for that layout.
 */

/**
 * Marker the bundle's test looks for, proving the stub replaced elkjs
 */
export const ELKJS_STUB_MARKER = 'showroom: the elk layout is not shipped';

/**
 * Represents elkjs's layout engine, which this stub never provides
 */
export default class ELK {
  /**
   * Throws, as elkjs isn't shipped
   */
  constructor() {
    throw new Error(ELKJS_STUB_MARKER);
  }
}
