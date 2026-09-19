/**
 * preload.ts — 渲染器唯一入口（contextIsolation 下的最小暴露面）
 */
import { contextBridge, ipcRenderer } from 'electron';
import type { LaunchResult, Payload, ToolCategory, ToolStatus } from './main/types';

const api = {
  list: (): Promise<Payload> => ipcRenderer.invoke('toolbox:list'),
  launch: (id: string, opts: { admin?: boolean } = {}): Promise<LaunchResult> =>
    ipcRenderer.invoke('toolbox:launch', id, opts),
  openDir: (id: string): Promise<LaunchResult> => ipcRenderer.invoke('toolbox:openDir', id),
  copyCommand: (id: string): Promise<LaunchResult> => ipcRenderer.invoke('toolbox:copyCommand', id),
  favorite: (id: string, next?: boolean) => ipcRenderer.invoke('toolbox:favorite', id, next),
  hide: (id: string, hidden: boolean): Promise<Payload> => ipcRenderer.invoke('toolbox:hide', id, hidden),
  setCategory: (id: string, cat: ToolCategory) => ipcRenderer.invoke('toolbox:setCategory', id, cat),
  rescan: (): Promise<Payload> => ipcRenderer.invoke('toolbox:rescan'),
  probe: (): Promise<ToolStatus[]> => ipcRenderer.invoke('toolbox:probe'),
  icon: (id: string): Promise<string | null> => ipcRenderer.invoke('toolbox:icon', id),
  openDataDir: () => ipcRenderer.invoke('toolbox:openDataDir'),
  showInExplorer: (path: string) => ipcRenderer.invoke('toolbox:showInExplorer', path),
  onStatus: (cb: (s: ToolStatus[]) => void) => {
    ipcRenderer.on('toolbox:status', (_e, s) => cb(s));
  },
  onRescan: (cb: (s: { stage: string; summary?: string }) => void) => {
    ipcRenderer.on('toolbox:rescanned', (_e, s) => cb(s));
  },
};

contextBridge.exposeInMainWorld('toolbox', api);

export type ToolboxApi = typeof api;
