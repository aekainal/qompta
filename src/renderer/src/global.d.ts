/**
 * Global declaration of the API exposed by the preload (window.api).
 * Typed from the shared IPC contract.
 */

import type { IpcChannel, IpcInput, IpcOutput } from "@shared/ipc.js";

declare global {
  interface Window {
    api: {
      invoke<C extends IpcChannel>(channel: C, input: IpcInput<C>): Promise<IpcOutput<C>>;
    };
  }

  /** Version from package.json, injected at build time (electron.vite.config.ts). */
  const __APP_VERSION__: string;
}

export {};
