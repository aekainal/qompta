/**
 * Preload: exposes a minimal, typed IPC surface to the renderer via contextBridge.
 * No direct Node access is given to the renderer (contextIsolation enabled).
 */

import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS, type IpcChannel, type IpcInput, type IpcOutput } from "../shared/ipc.js";

const api = {
  invoke<C extends IpcChannel>(channel: C, input: IpcInput<C>): Promise<IpcOutput<C>> {
    if (!IPC_CHANNELS.includes(channel)) {
      return Promise.reject(new Error(`Canal IPC non autorisé : ${channel}`));
    }
    return ipcRenderer.invoke(channel, input) as Promise<IpcOutput<C>>;
  },
};

export type QomptaApi = typeof api;

contextBridge.exposeInMainWorld("api", api);
