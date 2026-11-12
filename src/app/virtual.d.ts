/**
 * Type of the virtual module serving the shown host information, which `showroom`'s Vite plugin provides when serving or building the showroom
 */

declare module 'virtual:showroom-host' {
  /**
   * The shown host information of the host repository being served or built
   */
  const host: import('./host/index.js').ShownHostInformation;
  export default host;
  /**
   * The current issues of the host repository being served (the check's, and the showcases' build errors); none when building
   */
  export const issues: import('../cli/check/index.js').CheckIssue[];
}
