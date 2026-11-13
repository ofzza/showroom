// Declares what Vite bundles and TypeScript doesn't know of: CSS, assets, and the environment
declare module '*.css';
declare module '*.svg' {
  const url: string;
  export default url;
}
interface ImportMetaEnv {
  readonly MODE: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
declare const process: { env: { NODE_ENV: string } };
