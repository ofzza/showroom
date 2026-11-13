// The host's own declarations of what Vite bundles: an asset, and the environment
declare module '*.svg' {
  const url: string;
  export default url;
}
interface ImportMeta {
  readonly env: { readonly MODE: string };
}
