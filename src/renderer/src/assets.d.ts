/**
 * Types for the assets Vite turns into URLs at build time.
 *
 * This file must stay free of any top-level `import`/`export`: inside a module,
 * `declare module "…"` means *augmenting* an existing module, and augmenting one
 * that does not exist is an error. As a plain script, the declarations below are
 * ambient, which is what a wildcard module pattern needs.
 *
 * `@resources/*` is deliberately absent from tsconfig `paths`: a path mapping
 * would make TypeScript resolve the real `.png` and fail to type it. Vite alone
 * resolves the alias (see electron.vite.config.ts).
 */

declare module "*.png" {
  const src: string;
  export default src;
}

declare module "@resources/*" {
  const src: string;
  export default src;
}
