export type DictionaryEntry = {
  id: string;
  reading: string;
  word: string;
  pos: string;
  enabledApple: boolean;
  enabledGoogle: boolean;
  note: string;
  createdAt: string;
  updatedAt: string;
};

export type ImportSource = 'apple' | 'google' | 'csv' | 'backup';

export type ImportReport = {
  source: ImportSource;
  added: number;
  skippedDuplicate: number;
  skippedInvalid: number;
  totalRows: number;
};

export type ImportPreviewItem = {
  reading: string;
  word: string;
  pos: string;
  note: string;
  enabledApple: boolean;
  enabledGoogle: boolean;
  reason?: string;
};

export type ImportPreview = {
  token: string;
  source: ImportSource;
  filePath: string;
  totalRows: number;
  validRows: number;
  added: number;
  skippedDuplicate: number;
  skippedInvalid: number;
  samples: {
    toAdd: ImportPreviewItem[];
    duplicate: ImportPreviewItem[];
    invalid: ImportPreviewItem[];
  };
};

export type BackupSnapshotMeta = {
  id: string;
  createdAt: string;
  label: string;
  trigger: 'save' | 'add' | 'import' | 'restore';
  entryCount: number;
};

export type BackupDiffItem = {
  id: string;
  reading: string;
  word: string;
  pos: string;
  note: string;
  enabledApple: boolean;
  enabledGoogle: boolean;
};

export type BackupDiffChange = {
  id: string;
  before: BackupDiffItem;
  after: BackupDiffItem;
  changedFields: Array<'reading' | 'word' | 'pos' | 'note' | 'enabledApple' | 'enabledGoogle'>;
};

export type BackupDiffReport = {
  snapshot: BackupSnapshotMeta;
  previous: BackupSnapshotMeta;
  summary: {
    added: number;
    removed: number;
    changed: number;
  };
  samples: {
    added: BackupDiffItem[];
    removed: BackupDiffItem[];
    changed: BackupDiffChange[];
  };
};

declare global {
  interface Window {
    udu: {
      listEntries: () => Promise<DictionaryEntry[]>;
      saveAllEntries: (entries: DictionaryEntry[]) => Promise<DictionaryEntry[]>;
      addEntry: (payload: { reading: string; word: string; pos?: string; note?: string }) => Promise<{ ok: boolean; reason?: string; entry?: DictionaryEntry }>;
      previewAppleImport: () => Promise<ImportPreview | null>;
      previewGoogleImport: () => Promise<ImportPreview | null>;
      previewCsvImport: () => Promise<ImportPreview | null>;
      previewBackupImport: () => Promise<ImportPreview | null>;
      applyPendingImport: (token: string) => Promise<ImportReport | null>;
      discardPendingImport: (token: string) => Promise<boolean>;
      exportApple: () => Promise<{ count: number; filePath: string } | null>;
      exportGoogle: () => Promise<{ count: number; filePath: string } | null>;
      exportCsv: () => Promise<{ count: number; filePath: string } | null>;
      exportBackupJson: () => Promise<{ count: number; filePath: string } | null>;
      listBackups: () => Promise<BackupSnapshotMeta[]>;
      restoreBackup: (snapshotId: string) => Promise<DictionaryEntry[] | null>;
      diffBackup: (snapshotId: string) => Promise<BackupDiffReport | null>;
      getStoragePath: () => Promise<string>;
    };
  }
}

export {};
