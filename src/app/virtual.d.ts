/**
 * Type of the virtual module serving the shown host information, which tsshowcase's Vite plugin provides when serving or building the showcase application
 */

declare module 'virtual:tsshowcase-host' {
  /**
   * The shown host information of the host repository being served or built
   */
  const host: import('./host/index.js').ShownHostInformation;
  export default host;
}
