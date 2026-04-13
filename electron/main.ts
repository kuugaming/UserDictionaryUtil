import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { parse as parsePlist, build as buildPlist } from 'plist';

type DictionaryEntry = {
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

type ImportSource = 'apple' | 'google' | 'csv' | 'backup';

type ImportReport = {
  source: ImportSource;
  added: number;
  skippedDuplicate: number;
  skippedInvalid: number;
  totalRows: number;
};

type ImportPreviewItem = {
  reading: string;
  word: string;
  pos: string;
  note: string;
  enabledApple: boolean;
  enabledGoogle: boolean;
  reason?: string;
};

type ImportPreview = {
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

type ImportCandidate = {
  reading: string;
  word: string;
  pos: string;
  note: string;
  enabledApple: boolean;
  enabledGoogle: boolean;
};

type ParsedImport = {
  totalRows: number;
  candidates: ImportCandidate[];
  invalid: ImportPreviewItem[];
};

type PendingImport = {
  source: ImportSource;
  filePath: string;
  totalRows: number;
  invalidCount: number;
  candidates: ImportCandidate[];
};

type BackupTrigger = 'save' | 'add' | 'import' | 'restore';

type BackupSnapshot = {
  id: string;
  createdAt: string;
  label: string;
  trigger: BackupTrigger;
  entryCount: number;
  entries: DictionaryEntry[];
};

type BackupSnapshotMeta = Omit<BackupSnapshot, 'entries'>;

type BackupDiffItem = Pick<DictionaryEntry, 'id' | 'reading' | 'word' | 'pos' | 'note' | 'enabledApple' | 'enabledGoogle'>;
type BackupDiffField = 'reading' | 'word' | 'pos' | 'note' | 'enabledApple' | 'enabledGoogle';
type BackupDiffChange = {
  id: string;
  before: BackupDiffItem;
  after: BackupDiffItem;
  changedFields: BackupDiffField[];
};

type BackupDiffReport = {
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

const DEFAULT_POS = '名詞';
const CSV_HEADERS = ['reading', 'word', 'pos', 'note', 'enabledApple', 'enabledGoogle'];
const MAX_BACKUP_HISTORY = 20;
const pendingImports = new Map<string, PendingImport>();
const SPLASH_MIN_SHOW_MS = 900;
let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;

function normalizeReading(value: string): string {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[ァ-ン]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
}

function normalizeWord(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

function normalizeNote(value: string): string {
  return value.normalize('NFKC').trim();
}

function dedupeKey(reading: string, word: string): string {
  return `${normalizeReading(reading)}\u0000${normalizeWord(word)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function makeEntry(candidate: ImportCandidate): DictionaryEntry {
  const now = nowIso();
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    reading: normalizeReading(candidate.reading),
    word: normalizeWord(candidate.word),
    pos: candidate.pos?.trim() || DEFAULT_POS,
    enabledApple: candidate.enabledApple,
    enabledGoogle: candidate.enabledGoogle,
    note: normalizeNote(candidate.note),
    createdAt: now,
    updatedAt: now
  };
}

function getDataFilePath() {
  return path.join(app.getPath('userData'), 'master-dictionary.json');
}

function readEntries(): DictionaryEntry[] {
  const file = getDataFilePath();
  if (!fs.existsSync(file)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8')) as DictionaryEntry[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeEntries(entries: DictionaryEntry[]) {
  const file = getDataFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(entries, null, 2), 'utf-8');
}

function getBackupHistoryFilePath() {
  return path.join(app.getPath('userData'), 'backup-history.json');
}

function readBackupSnapshots(): BackupSnapshot[] {
  const file = getBackupHistoryFilePath();
  if (!fs.existsSync(file)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf-8')) as BackupSnapshot[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeBackupSnapshots(snapshots: BackupSnapshot[]) {
  const file = getBackupHistoryFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(snapshots, null, 2), 'utf-8');
}

function cloneEntries(entries: DictionaryEntry[]): DictionaryEntry[] {
  return entries.map((entry) => ({ ...entry }));
}

function recordBackup(trigger: BackupTrigger, label: string, entries: DictionaryEntry[]) {
  if (entries.length === 0) return;

  const snapshots = readBackupSnapshots();
  const snapshot: BackupSnapshot = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: nowIso(),
    label,
    trigger,
    entryCount: entries.length,
    entries: cloneEntries(entries)
  };

  writeBackupSnapshots([snapshot, ...snapshots].slice(0, MAX_BACKUP_HISTORY));
}

function toBackupMeta(snapshot: BackupSnapshot): BackupSnapshotMeta {
  return {
    id: snapshot.id,
    createdAt: snapshot.createdAt,
    label: snapshot.label,
    trigger: snapshot.trigger,
    entryCount: snapshot.entryCount
  };
}

function toBackupDiffItem(entry: DictionaryEntry): BackupDiffItem {
  return {
    id: entry.id,
    reading: entry.reading,
    word: entry.word,
    pos: entry.pos,
    note: entry.note,
    enabledApple: entry.enabledApple,
    enabledGoogle: entry.enabledGoogle
  };
}

function diffBackupEntries(
  current: DictionaryEntry[],
  previous: DictionaryEntry[]
): { summary: BackupDiffReport['summary']; samples: BackupDiffReport['samples'] } {
  const currentMap = new Map(current.map((entry) => [entry.id, entry]));
  const previousMap = new Map(previous.map((entry) => [entry.id, entry]));

  const added: BackupDiffItem[] = [];
  const removed: BackupDiffItem[] = [];
  const changed: BackupDiffChange[] = [];

  for (const [id, entry] of currentMap) {
    if (!previousMap.has(id)) {
      added.push(toBackupDiffItem(entry));
      continue;
    }

    const before = previousMap.get(id);
    if (!before) continue;

    const changedFields: BackupDiffField[] = [];
    if (entry.reading !== before.reading) changedFields.push('reading');
    if (entry.word !== before.word) changedFields.push('word');
    if (entry.pos !== before.pos) changedFields.push('pos');
    if (entry.note !== before.note) changedFields.push('note');
    if (entry.enabledApple !== before.enabledApple) changedFields.push('enabledApple');
    if (entry.enabledGoogle !== before.enabledGoogle) changedFields.push('enabledGoogle');

    if (changedFields.length > 0) {
      changed.push({
        id,
        before: toBackupDiffItem(before),
        after: toBackupDiffItem(entry),
        changedFields
      });
    }
  }

  for (const [id, entry] of previousMap) {
    if (!currentMap.has(id)) {
      removed.push(toBackupDiffItem(entry));
    }
  }

  return {
    summary: {
      added: added.length,
      removed: removed.length,
      changed: changed.length
    },
    samples: {
      added: added.slice(0, 12),
      removed: removed.slice(0, 12),
      changed: changed.slice(0, 12)
    }
  };
}

function importSourceLabel(source: ImportSource) {
  switch (source) {
    case 'apple':
      return 'Apple plist';
    case 'google':
      return 'Google txt';
    case 'csv':
      return 'CSV';
    case 'backup':
      return 'Backup JSON';
    default:
      return source;
  }
}

function createWindow() {
  const splashStartedAt = Date.now();

  splashWindow = new BrowserWindow({
    width: 520,
    height: 320,
    frame: false,
    resizable: false,
    movable: true,
    show: true,
    transparent: false,
    alwaysOnTop: true,
    backgroundColor: '#0b1220',
    webPreferences: {
      contextIsolation: true
    }
  });

  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { margin:0; font-family: system-ui, -apple-system, Segoe UI, sans-serif; background:#0b1220; color:#dbeafe; display:flex; align-items:center; justify-content:center; height:100vh; }
          .card { text-align:center; padding:28px 24px; border-radius:18px; border:1px solid rgba(125,211,252,.25); background:linear-gradient(160deg, rgba(30,64,175,.35), rgba(76,29,149,.3)); box-shadow:0 16px 40px rgba(2,6,23,.45); }
          h1 { margin:0 0 8px; font-size:22px; letter-spacing:.02em; }
          p { margin:0; color:#bfdbfe; font-size:13px; }
          .dot { margin:16px auto 0; width:10px; height:10px; border-radius:999px; background:#38bdf8; animation:pulse 1.2s infinite; }
          @keyframes pulse { 0%{opacity:.35;transform:scale(.9);} 60%{opacity:1;transform:scale(1);} 100%{opacity:.35;transform:scale(.9);} }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>UserDictionaryUtil</h1>
          <p>辞書ハブを起動しています...</p>
          <div class="dot"></div>
        </div>
      </body>
    </html>
  `)}`);

  mainWindow = new BrowserWindow({
    width: 1380,
    height: 920,
    minWidth: 1180,
    minHeight: 780,
    backgroundColor: '#0b1220',
    show: false,
    webPreferences: {
      preload: path.join(app.getAppPath(), 'dist-electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    const elapsed = Date.now() - splashStartedAt;
    const remain = Math.max(0, SPLASH_MIN_SHOW_MS - elapsed);
    setTimeout(() => {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
        splashWindow = null;
      }
      mainWindow?.show();
    }, remain);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (!app.isPackaged) {
    mainWindow.loadURL('http://127.0.0.1:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'));
  }
}

function previewItemFromCandidate(candidate: Partial<ImportCandidate>, reason?: string): ImportPreviewItem {
  return {
    reading: normalizeReading(candidate.reading ?? ''),
    word: normalizeWord(candidate.word ?? ''),
    pos: candidate.pos?.trim() || DEFAULT_POS,
    note: normalizeNote(candidate.note ?? ''),
    enabledApple: candidate.enabledApple ?? true,
    enabledGoogle: candidate.enabledGoogle ?? true,
    reason
  };
}

function parseDelimitedRows(raw: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    const next = raw[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      row.push(field);
      field = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function parseBooleanFlag(value: string | undefined, defaultValue = true): boolean {
  if (value == null) return defaultValue;
  const normalized = value.normalize('NFKC').trim().toLowerCase();
  if (!normalized) return defaultValue;
  if (['1', 'true', 'yes', 'y', 'on', 'enabled', 'enable', '有効', 'はい', '〇', '○', '丸'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off', 'disabled', 'disable', '無効', 'いいえ', '×', 'x', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function parseAppleImport(raw: string): ParsedImport {
  const parsed = parsePlist(raw) as unknown;
  const rows = Array.isArray(parsed) ? parsed : [];
  const candidates: ImportCandidate[] = [];
  const invalid: ImportPreviewItem[] = [];

  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      invalid.push(previewItemFromCandidate({}, 'オブジェクトとして解釈できない行'));
      continue;
    }

    const source = row as Record<string, unknown>;
    const reading = String(source.shortcut ?? '').trim();
    const word = String(source.phrase ?? '').trim();

    if (!reading || !word) {
      invalid.push(previewItemFromCandidate({ reading, word }, 'shortcut または phrase が空です'));
      continue;
    }

    candidates.push({
      reading,
      word,
      pos: DEFAULT_POS,
      note: '',
      enabledApple: true,
      enabledGoogle: true
    });
  }

  return { totalRows: rows.length, candidates, invalid };
}

function looksLikeHeaderRow(values: string[]) {
  const normalized = values.map((value) => value.normalize('NFKC').trim().toLowerCase().replace(/[\s_\-]/g, ''));
  return normalized.some((value) => ['reading', 'yomi', 'word', 'phrase', '単語', '読み', 'pos', 'note'].includes(value));
}

function parseGoogleImport(raw: string): ParsedImport {
  let lines = raw
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0 && !line.trim().startsWith('#'));

  if (lines.length > 0) {
    const firstCols = lines[0].split('\t');
    if (looksLikeHeaderRow(firstCols)) {
      lines = lines.slice(1);
    }
  }

  const candidates: ImportCandidate[] = [];
  const invalid: ImportPreviewItem[] = [];

  for (const line of lines) {
    const cols = line.split('\t');
    if (cols.length < 2) {
      invalid.push(previewItemFromCandidate({}, 'タブ区切りの列数が不足しています'));
      continue;
    }

    const reading = String(cols[0] ?? '').trim();
    const word = String(cols[1] ?? '').trim();
    const pos = String(cols[2] ?? DEFAULT_POS).trim() || DEFAULT_POS;
    const note = String(cols[3] ?? '').trim();
    const enabledApple = parseBooleanFlag(cols[4], true);
    const enabledGoogle = parseBooleanFlag(cols[5], true);

    if (!reading || !word) {
      invalid.push(previewItemFromCandidate({ reading, word, pos, note, enabledApple, enabledGoogle }, '読みまたは単語が空です'));
      continue;
    }

    candidates.push({
      reading,
      word,
      pos,
      note,
      enabledApple,
      enabledGoogle
    });
  }

  return { totalRows: lines.length, candidates, invalid };
}

function detectDelimiter(raw: string): string {
  const sampleLines = raw
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .slice(0, 5);

  const candidates = [',', '\t', ';'];
  let best = ',';
  let bestScore = -1;

  for (const delimiter of candidates) {
    let score = 0;
    for (const line of sampleLines) {
      const count = line.split(delimiter).length;
      if (count > 1) score += count;
    }
    if (score > bestScore) {
      best = delimiter;
      bestScore = score;
    }
  }

  return best;
}

function detectHeaderIndexMap(headerRow: string[]): Map<string, number> {
  const aliases: Record<string, string[]> = {
    reading: ['reading', 'yomi', 'shortcut', 'key', '読み', 'よみ', '入力'],
    word: ['word', 'phrase', 'term', 'value', 'text', '単語', '語句', '候補', '出力'],
    pos: ['pos', 'partofspeech', 'hinshi', '品詞'],
    note: ['note', 'memo', 'comment', 'description', 'メモ', '備考', '説明'],
    enabledApple: ['enabledapple', 'apple', 'appleenabled', 'apple有効', 'icloudapple', 'forapple'],
    enabledGoogle: ['enabledgoogle', 'google', 'googleenabled', 'google有効', 'googleime', 'forgoogle']
  };

  const normalizedHeader = headerRow.map((cell) => cell.normalize('NFKC').trim().toLowerCase().replace(/[\s_\-]/g, ''));
  const result = new Map<string, number>();

  for (const [key, list] of Object.entries(aliases)) {
    const index = normalizedHeader.findIndex((value) => list.includes(value));
    if (index >= 0) result.set(key, index);
  }

  return result;
}

function parseCsvImport(raw: string): ParsedImport {
  const cleaned = raw.replace(/^\uFEFF/, '');
  const delimiter = detectDelimiter(cleaned);
  const rows = parseDelimitedRows(cleaned, delimiter).filter((row) => row.some((cell) => cell.trim().length > 0));

  if (rows.length === 0) {
    return { totalRows: 0, candidates: [], invalid: [] };
  }

  let dataRows = rows;
  let headerMap = detectHeaderIndexMap(rows[0]);
  if (headerMap.has('reading') || headerMap.has('word')) {
    dataRows = rows.slice(1);
  } else {
    headerMap = new Map([
      ['reading', 0],
      ['word', 1],
      ['pos', 2],
      ['note', 3],
      ['enabledApple', 4],
      ['enabledGoogle', 5]
    ]);
  }

  const candidates: ImportCandidate[] = [];
  const invalid: ImportPreviewItem[] = [];

  for (const row of dataRows) {
    const reading = String(row[headerMap.get('reading') ?? 0] ?? '').trim();
    const word = String(row[headerMap.get('word') ?? 1] ?? '').trim();
    const pos = String(row[headerMap.get('pos') ?? 2] ?? DEFAULT_POS).trim() || DEFAULT_POS;
    const note = String(row[headerMap.get('note') ?? 3] ?? '').trim();
    const enabledApple = parseBooleanFlag(row[headerMap.get('enabledApple') ?? 4], true);
    const enabledGoogle = parseBooleanFlag(row[headerMap.get('enabledGoogle') ?? 5], true);

    if (!reading || !word) {
      invalid.push(previewItemFromCandidate({ reading, word, pos, note, enabledApple, enabledGoogle }, 'reading または word が空です'));
      continue;
    }

    candidates.push({
      reading,
      word,
      pos,
      note,
      enabledApple,
      enabledGoogle
    });
  }

  return { totalRows: dataRows.length, candidates, invalid };
}

function parseBackupImport(raw: string): ParsedImport {
  const parsed = JSON.parse(raw) as unknown;
  const rows = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).entries)
      ? ((parsed as Record<string, unknown>).entries as unknown[])
      : [];

  const candidates: ImportCandidate[] = [];
  const invalid: ImportPreviewItem[] = [];

  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      invalid.push(previewItemFromCandidate({}, 'JSON エントリをオブジェクトとして読めません'));
      continue;
    }

    const source = row as Record<string, unknown>;
    const reading = String(source.reading ?? '').trim();
    const word = String(source.word ?? '').trim();
    const pos = String(source.pos ?? DEFAULT_POS).trim() || DEFAULT_POS;
    const note = String(source.note ?? '').trim();
    const enabledApple = typeof source.enabledApple === 'boolean' ? source.enabledApple : parseBooleanFlag(String(source.enabledApple ?? ''), true);
    const enabledGoogle = typeof source.enabledGoogle === 'boolean' ? source.enabledGoogle : parseBooleanFlag(String(source.enabledGoogle ?? ''), true);

    if (!reading || !word) {
      invalid.push(previewItemFromCandidate({ reading, word, pos, note, enabledApple, enabledGoogle }, 'reading または word が空です'));
      continue;
    }

    candidates.push({ reading, word, pos, note, enabledApple, enabledGoogle });
  }

  return { totalRows: rows.length, candidates, invalid };
}

function buildPreview(source: ImportSource, filePath: string, parsed: ParsedImport): ImportPreview {
  const existing = new Set(readEntries().map((entry) => dedupeKey(entry.reading, entry.word)));
  const seenNew = new Set<string>();
  const toAdd: ImportPreviewItem[] = [];
  const duplicate: ImportPreviewItem[] = [];

  for (const candidate of parsed.candidates) {
    const item = previewItemFromCandidate(candidate);
    const key = dedupeKey(item.reading, item.word);

    if (existing.has(key)) {
      duplicate.push({ ...item, reason: '既存の辞書データと重複しています' });
      continue;
    }

    if (seenNew.has(key)) {
      duplicate.push({ ...item, reason: '同じインポートファイル内で重複しています' });
      continue;
    }

    seenNew.add(key);
    toAdd.push(item);
  }

  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  pendingImports.set(token, {
    source,
    filePath,
    totalRows: parsed.totalRows,
    invalidCount: parsed.invalid.length,
    candidates: toAdd.map((item) => ({
      reading: item.reading,
      word: item.word,
      pos: item.pos,
      note: item.note,
      enabledApple: item.enabledApple,
      enabledGoogle: item.enabledGoogle
    }))
  });

  return {
    token,
    source,
    filePath,
    totalRows: parsed.totalRows,
    validRows: parsed.candidates.length,
    added: toAdd.length,
    skippedDuplicate: duplicate.length,
    skippedInvalid: parsed.invalid.length,
    samples: {
      toAdd: toAdd.slice(0, 10),
      duplicate: duplicate.slice(0, 10),
      invalid: parsed.invalid.slice(0, 10)
    }
  };
}

async function previewImportDialog(source: ImportSource) {
  const config = {
    apple: {
      title: 'Apple Text Replacements plist を選択',
      filters: [{ name: 'plist', extensions: ['plist'] }],
      parse: parseAppleImport
    },
    google: {
      title: 'Google 日本語入力 txt を選択',
      filters: [{ name: 'Text', extensions: ['txt', 'tsv', 'csv'] }, { name: 'All', extensions: ['*'] }],
      parse: parseGoogleImport
    },
    csv: {
      title: 'CSV / TSV ファイルを選択',
      filters: [{ name: 'Delimited', extensions: ['csv', 'tsv', 'txt'] }, { name: 'All', extensions: ['*'] }],
      parse: parseCsvImport
    },
    backup: {
      title: 'バックアップ JSON を選択',
      filters: [{ name: 'JSON', extensions: ['json'] }, { name: 'All', extensions: ['*'] }],
      parse: parseBackupImport
    }
  }[source];

  const result = await dialog.showOpenDialog({
    title: config.title,
    properties: ['openFile'],
    filters: config.filters
  });

  if (result.canceled || result.filePaths.length === 0) return null;

  const filePath = result.filePaths[0];
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = config.parse(raw);
  return buildPreview(source, filePath, parsed);
}

function escapeCsvCell(value: string): string {
  const normalized = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!/[",\n]/.test(normalized)) return normalized;
  return `"${normalized.replace(/"/g, '""')}"`;
}

app.whenReady().then(() => {
  ipcMain.handle('entries:list', async () => readEntries());

  ipcMain.handle('entries:saveAll', async (_event, entries: DictionaryEntry[]) => {
    const currentEntries = readEntries();
    const seen = new Set<string>();
    const cleaned = entries
      .map((entry) => ({
        ...entry,
        reading: normalizeReading(entry.reading),
        word: normalizeWord(entry.word),
        pos: entry.pos?.trim() || DEFAULT_POS,
        note: normalizeNote(entry.note),
        updatedAt: nowIso()
      }))
      .filter((entry) => entry.reading && entry.word)
      .filter((entry) => {
        const key = dedupeKey(entry.reading, entry.word);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    recordBackup('save', '一覧保存前の自動スナップショット', currentEntries);
    writeEntries(cleaned);
    return cleaned;
  });

  ipcMain.handle('entries:add', async (_event, payload: { reading: string; word: string; pos?: string; note?: string }) => {
    const entries = readEntries();
    const key = dedupeKey(payload.reading, payload.word);
    if (entries.some((entry) => dedupeKey(entry.reading, entry.word) === key)) {
      return { ok: false, reason: 'duplicate' };
    }

    const entry = makeEntry({
      reading: payload.reading,
      word: payload.word,
      pos: payload.pos?.trim() || DEFAULT_POS,
      note: payload.note?.trim() || '',
      enabledApple: true,
      enabledGoogle: true
    });

    recordBackup('add', '新規追加前の自動スナップショット', entries);
    entries.unshift(entry);
    writeEntries(entries);
    return { ok: true, entry };
  });

  ipcMain.handle('import:preview:apple', async () => previewImportDialog('apple'));
  ipcMain.handle('import:preview:google', async () => previewImportDialog('google'));
  ipcMain.handle('import:preview:csv', async () => previewImportDialog('csv'));
  ipcMain.handle('import:preview:backup', async () => previewImportDialog('backup'));

  ipcMain.handle('import:applyPending', async (_event, token: string) => {
    const pending = pendingImports.get(token);
    if (!pending) return null;

    const entries = readEntries();
    const existing = new Set(entries.map((entry) => dedupeKey(entry.reading, entry.word)));
    let added = 0;
    let skippedDuplicate = 0;

    recordBackup('import', `${importSourceLabel(pending.source)} 取り込み前の自動スナップショット`, entries);

    for (const candidate of pending.candidates) {
      const key = dedupeKey(candidate.reading, candidate.word);
      if (existing.has(key)) {
        skippedDuplicate += 1;
        continue;
      }
      entries.push(makeEntry(candidate));
      existing.add(key);
      added += 1;
    }

    writeEntries(entries);
    pendingImports.delete(token);

    const report: ImportReport = {
      source: pending.source,
      added,
      skippedDuplicate,
      skippedInvalid: pending.invalidCount,
      totalRows: pending.totalRows
    };
    return report;
  });

  ipcMain.handle('import:discardPending', async (_event, token: string) => pendingImports.delete(token));

  ipcMain.handle('export:apple', async () => {
    const result = await dialog.showSaveDialog({
      title: 'Apple Text Replacements plist を保存',
      defaultPath: 'TextReplacements.plist',
      filters: [{ name: 'plist', extensions: ['plist'] }]
    });

    if (result.canceled || !result.filePath) return null;
    const entries = readEntries().filter((entry) => entry.enabledApple);
    const payload = entries.map((entry) => ({
      shortcut: normalizeReading(entry.reading),
      phrase: normalizeWord(entry.word)
    }));

    fs.writeFileSync(result.filePath, buildPlist(payload), 'utf-8');
    return { count: payload.length, filePath: result.filePath };
  });

  ipcMain.handle('export:google', async () => {
    const result = await dialog.showSaveDialog({
      title: 'Google 日本語入力 txt を保存',
      defaultPath: 'GoogleJapaneseInputDictionary.txt',
      filters: [{ name: 'Text', extensions: ['txt'] }]
    });

    if (result.canceled || !result.filePath) return null;
    const entries = readEntries().filter((entry) => entry.enabledGoogle);
    const output = entries
      .map((entry) => `${normalizeReading(entry.reading)}\t${normalizeWord(entry.word)}\t${entry.pos || DEFAULT_POS}`)
      .join('\n');

    fs.writeFileSync(result.filePath, output, 'utf-8');
    return { count: entries.length, filePath: result.filePath };
  });

  ipcMain.handle('export:csv', async () => {
    const result = await dialog.showSaveDialog({
      title: 'マスター辞書 CSV を保存',
      defaultPath: 'UserDictionaryUtil-master.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    });

    if (result.canceled || !result.filePath) return null;
    const entries = readEntries();
    const header = CSV_HEADERS.join(',');
    const lines = entries.map((entry) =>
      [
        entry.reading,
        entry.word,
        entry.pos,
        entry.note,
        entry.enabledApple ? 'TRUE' : 'FALSE',
        entry.enabledGoogle ? 'TRUE' : 'FALSE'
      ]
        .map((cell) => escapeCsvCell(String(cell)))
        .join(',')
    );

    fs.writeFileSync(result.filePath, `\uFEFF${[header, ...lines].join('\n')}`, 'utf-8');
    return { count: entries.length, filePath: result.filePath };
  });

  ipcMain.handle('export:backup', async () => {
    const result = await dialog.showSaveDialog({
      title: 'バックアップ JSON を保存',
      defaultPath: 'UserDictionaryUtil-backup.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });

    if (result.canceled || !result.filePath) return null;
    const entries = readEntries();
    const payload = {
      app: 'UserDictionaryUtil',
      version: 1,
      exportedAt: new Date().toISOString(),
      entries
    };

    fs.writeFileSync(result.filePath, JSON.stringify(payload, null, 2), 'utf-8');
    return { count: entries.length, filePath: result.filePath };
  });

  ipcMain.handle('backup:list', async () => readBackupSnapshots().map(toBackupMeta));

  ipcMain.handle('backup:restore', async (_event, snapshotId: string) => {
    const snapshots = readBackupSnapshots();
    const snapshot = snapshots.find((item) => item.id === snapshotId);
    if (!snapshot) return null;

    const currentEntries = readEntries();
    recordBackup('restore', '復元前の自動スナップショット', currentEntries);
    writeEntries(cloneEntries(snapshot.entries));
    return readEntries();
  });

  ipcMain.handle('backup:diff', async (_event, snapshotId: string) => {
    const snapshots = readBackupSnapshots();
    const index = snapshots.findIndex((item) => item.id === snapshotId);
    if (index < 0) return null;
    const snapshot = snapshots[index];
    const previous = snapshots[index + 1];
    if (!snapshot || !previous) return null;

    const diff = diffBackupEntries(snapshot.entries, previous.entries);
    return {
      snapshot: toBackupMeta(snapshot),
      previous: toBackupMeta(previous),
      summary: diff.summary,
      samples: diff.samples
    } satisfies BackupDiffReport;
  });

  ipcMain.handle('storage:path', async () => getDataFilePath());
  ipcMain.handle('app:meta', async () => ({
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    platform: process.platform
  }));

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
