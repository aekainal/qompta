import type { QomptaApi } from "./index.js";

declare global {
  interface Window {
    api: QomptaApi;
  }
}

export {};
