import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('udu', {
  listEntries: () => ipcRenderer.invoke('entries:list'),
  saveAllEntries: (entries: unknown) => ipcRenderer.invoke('entries:saveAll', entries),
  addEntry: (payload: unknown) => ipcRenderer.invoke('entries:add', payload),
  previewAppleImport: () => ipcRenderer.invoke('import:preview:apple'),
  previewGoogleImport: () => ipcRenderer.invoke('import:preview:google'),
  previewCsvImport: () => ipcRenderer.invoke('import:preview:csv'),
  previewBackupImport: () => ipcRenderer.invoke('import:preview:backup'),
  applyPendingImport: (token: string) => ipcRenderer.invoke('import:applyPending', token),
  discardPendingImport: (token: string) => ipcRenderer.invoke('import:discardPending', token),
  exportApple: () => ipcRenderer.invoke('export:apple'),
  exportGoogle: () => ipcRenderer.invoke('export:google'),
  exportCsv: () => ipcRenderer.invoke('export:csv'),
  exportBackupJson: () => ipcRenderer.invoke('export:backup'),
  listBackups: () => ipcRenderer.invoke('backup:list'),
  restoreBackup: (snapshotId: string) => ipcRenderer.invoke('backup:restore', snapshotId),
  diffBackup: (snapshotId: string) => ipcRenderer.invoke('backup:diff', snapshotId),
  getStoragePath: () => ipcRenderer.invoke('storage:path'),
  getAppMeta: () => ipcRenderer.invoke('app:meta')
});
