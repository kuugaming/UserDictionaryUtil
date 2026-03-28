import { useEffect, useMemo, useState } from 'react';
import type { BackupSnapshotMeta, DictionaryEntry, ImportPreview, ImportSource } from './types';

const DEFAULT_POS = '名詞';

type ActivityItem = {
  id: string;
  label: string;
  tone: 'info' | 'success' | 'warn';
  timestamp: string;
};

type SortMode = 'updated-desc' | 'reading-asc' | 'word-asc';
type ViewMode = 'all' | 'apple' | 'google' | 'dual' | 'note' | 'duplicate';
type BulkScope = 'selected' | 'visible';

type DuplicateGroup = {
  key: string;
  reading: string;
  word: string;
  count: number;
  entries: DictionaryEntry[];
};

type BulkFlagMode = 'keep' | 'on' | 'off';

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('ja-JP', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return iso;
  }
}

function makeActivity(label: string, tone: ActivityItem['tone']): ActivityItem {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label,
    tone,
    timestamp: new Date().toISOString()
  };
}

function sourceLabel(source: ImportSource) {
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

function normalizeReading(value: string) {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[ァ-ン]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
}

function normalizeWord(value: string) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

function dedupeKey(reading: string, word: string) {
  return `${normalizeReading(reading)}\u0000${normalizeWord(word)}`;
}

function App() {
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [reading, setReading] = useState('');
  const [word, setWord] = useState('');
  const [pos, setPos] = useState(DEFAULT_POS);
  const [note, setNote] = useState('');
  const [query, setQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('updated-desc');
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [status, setStatus] = useState('公開リポジトリ運用OK。辞書の中身だけは private 取り扱い推奨。');
  const [storagePath, setStoragePath] = useState('');
  const [activities, setActivities] = useState<ActivityItem[]>([
    makeActivity('UserDictionaryUtil を起動しました。', 'info')
  ]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [isApplyingImport, setIsApplyingImport] = useState(false);
  const [backups, setBackups] = useState<BackupSnapshotMeta[]>([]);
  const [restoringBackupId, setRestoringBackupId] = useState<string | null>(null);
  const [bulkPosValue, setBulkPosValue] = useState('');
  const [bulkNotePrefix, setBulkNotePrefix] = useState('');
  const [bulkNoteSuffix, setBulkNoteSuffix] = useState('');
  const [bulkAppleMode, setBulkAppleMode] = useState<BulkFlagMode>('keep');
  const [bulkGoogleMode, setBulkGoogleMode] = useState<BulkFlagMode>('keep');
  const [activeDuplicateGroup, setActiveDuplicateGroup] = useState<DuplicateGroup | null>(null);
  const [keepDuplicateId, setKeepDuplicateId] = useState<string>('');

  async function refreshBackups() {
    const snapshotList = await window.udu.listBackups();
    setBackups(snapshotList);
  }

  async function refresh() {
    const [data, snapshotList] = await Promise.all([window.udu.listEntries(), window.udu.listBackups()]);
    setEntries(data);
    setBackups(snapshotList);
    setSelectedIds([]);
    setHasUnsavedChanges(false);
  }

  useEffect(() => {
    void refresh();
    window.udu.getStoragePath().then(setStoragePath).catch(() => undefined);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (hasUnsavedChanges) {
          void persistAll();
        }
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hasUnsavedChanges, entries]);

  useEffect(() => {
    return () => {
      if (importPreview) {
        void window.udu.discardPendingImport(importPreview.token);
      }
    };
  }, [importPreview]);

  function pushActivity(label: string, tone: ActivityItem['tone']) {
    setActivities((prev) => [makeActivity(label, tone), ...prev].slice(0, 12));
  }

  function backupTriggerLabel(trigger: BackupSnapshotMeta['trigger']) {
    switch (trigger) {
      case 'save':
        return '保存前';
      case 'add':
        return '追加前';
      case 'import':
        return '取込前';
      case 'restore':
        return '復元前';
      default:
        return trigger;
    }
  }

  function normalizeInlineNote(value: string) {
    return value.normalize('NFKC').trim();
  }

  const duplicateGroups = useMemo<DuplicateGroup[]>(() => {
    const map = new Map<string, DictionaryEntry[]>();
    for (const entry of entries) {
      const key = dedupeKey(entry.reading, entry.word);
      const bucket = map.get(key);
      if (bucket) {
        bucket.push(entry);
      } else {
        map.set(key, [entry]);
      }
    }

    return Array.from(map.entries())
      .filter(([, groupEntries]) => groupEntries.length > 1)
      .map(([key, groupEntries]) => ({
        key,
        reading: groupEntries[0]?.reading ?? '',
        word: groupEntries[0]?.word ?? '',
        count: groupEntries.length,
        entries: groupEntries
      }))
      .sort((a, b) => b.count - a.count || a.reading.localeCompare(b.reading, 'ja'));
  }, [entries]);

  const duplicateIdSet = useMemo(() => {
    const set = new Set<string>();
    duplicateGroups.forEach((group) => group.entries.forEach((entry) => set.add(entry.id)));
    return set;
  }, [duplicateGroups]);

  const sortedEntries = useMemo(() => {
    const cloned = [...entries];
    if (sortMode === 'reading-asc') {
      cloned.sort((a, b) => a.reading.localeCompare(b.reading, 'ja'));
    } else if (sortMode === 'word-asc') {
      cloned.sort((a, b) => a.word.localeCompare(b.word, 'ja'));
    } else {
      cloned.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
    return cloned;
  }, [entries, sortMode]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return sortedEntries.filter((entry) => {
      const matchesQuery =
        !q || [entry.reading, entry.word, entry.pos, entry.note].some((value) => value.toLowerCase().includes(q));

      if (!matchesQuery) return false;

      switch (viewMode) {
        case 'apple':
          return entry.enabledApple;
        case 'google':
          return entry.enabledGoogle;
        case 'dual':
          return entry.enabledApple && entry.enabledGoogle;
        case 'note':
          return entry.note.trim().length > 0;
        case 'duplicate':
          return duplicateIdSet.has(entry.id);
        default:
          return true;
      }
    });
  }, [sortedEntries, query, viewMode, duplicateIdSet]);

  const stats = useMemo(() => {
    const apple = entries.filter((entry) => entry.enabledApple).length;
    const google = entries.filter((entry) => entry.enabledGoogle).length;
    const dual = entries.filter((entry) => entry.enabledApple && entry.enabledGoogle).length;
    const notes = entries.filter((entry) => entry.note.trim().length > 0).length;

    return {
      total: entries.length,
      apple,
      google,
      dual,
      notes,
      duplicates: duplicateIdSet.size,
      duplicateGroups: duplicateGroups.length,
      visible: filtered.length,
      selected: selectedIds.length
    };
  }, [entries, filtered.length, selectedIds.length, duplicateIdSet.size, duplicateGroups.length]);

  const allVisibleSelected = filtered.length > 0 && filtered.every((entry) => selectedIds.includes(entry.id));
  const latestActivity = activities[0];
  const activeDuplicateEntries = useMemo(() => {
    if (!activeDuplicateGroup) return [];
    return entries
      .filter((entry) => dedupeKey(entry.reading, entry.word) === activeDuplicateGroup.key)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.createdAt.localeCompare(a.createdAt));
  }, [entries, activeDuplicateGroup]);

  function clearDraft() {
    setReading('');
    setWord('');
    setPos(DEFAULT_POS);
    setNote('');
  }

  async function handleAdd() {
    if (!reading.trim() || !word.trim()) {
      setStatus('読みと単語は必須。ここは嘘つけない。');
      pushActivity('追加失敗: 読みまたは単語が空です。', 'warn');
      return;
    }

    const res = await window.udu.addEntry({ reading, word, pos, note });
    if (!res.ok) {
      setStatus('同じ「読み + 単語」は既に登録済み。重複は増やさない設計。');
      pushActivity(`追加スキップ: ${reading} → ${word} は既存です。`, 'warn');
      return;
    }

    const addedReading = reading;
    const addedWord = word;
    clearDraft();
    setStatus('1件追加しました。');
    pushActivity(`追加: ${addedReading} → ${addedWord}`, 'success');
    await refresh();
  }

  async function handleToggle(id: string, field: 'enabledApple' | 'enabledGoogle') {
    const next = entries.map((entry) => (entry.id === id ? { ...entry, [field]: !entry[field] } : entry));
    setEntries(next);
    setHasUnsavedChanges(true);
  }

  function handleFieldChange(
    id: string,
    field: keyof Pick<DictionaryEntry, 'reading' | 'word' | 'pos' | 'note'>,
    value: string
  ) {
    const next = entries.map((entry) =>
      entry.id === id
        ? {
            ...entry,
            [field]: value,
            updatedAt: new Date().toISOString()
          }
        : entry
    );
    setEntries(next);
    setHasUnsavedChanges(true);
  }

  async function persistAll() {
    const beforeDuplicates = duplicateGroups.length;
    const saved = await window.udu.saveAllEntries(entries);
    setEntries(saved);
    setSelectedIds((prev) => prev.filter((id) => saved.some((entry) => entry.id === id)));
    setHasUnsavedChanges(false);
    await refreshBackups();
    const statusMessage = beforeDuplicates > 0
      ? `保存完了。${beforeDuplicates} 組の重複候補を自動圧縮しました。`
      : '保存完了。重複は自動圧縮しました。';
    setStatus(statusMessage);
    pushActivity('一覧を保存しました。', 'success');
  }

  async function startImportPreview(action: () => Promise<ImportPreview | null>) {
    if (importPreview) {
      await window.udu.discardPendingImport(importPreview.token);
      setImportPreview(null);
    }

    const preview = await action();
    if (!preview) return;

    setImportPreview(preview);
    const label = `${sourceLabel(preview.source)} プレビュー: 追加予定 ${preview.added} / 重複 ${preview.skippedDuplicate} / 不正 ${preview.skippedInvalid}`;
    setStatus(label);
    pushActivity(label, preview.added > 0 ? 'success' : 'info');
  }

  async function applyImportPreview() {
    if (!importPreview) return;

    setIsApplyingImport(true);
    try {
      const report = await window.udu.applyPendingImport(importPreview.token);
      if (!report) return;

      await refresh();
      const label = `${sourceLabel(report.source)} 取込完了: 追加 ${report.added} / 重複 ${report.skippedDuplicate} / 不正 ${report.skippedInvalid}`;
      setStatus(label);
      pushActivity(label, report.added > 0 ? 'success' : 'info');
      setImportPreview(null);
    } finally {
      setIsApplyingImport(false);
    }
  }

  async function closeImportPreview() {
    if (!importPreview) return;
    await window.udu.discardPendingImport(importPreview.token);
    setImportPreview(null);
    setStatus('インポートプレビューを閉じました。');
  }

  async function handleExport(action: () => Promise<{ count: number; filePath: string } | null>, label: string) {
    const res = await action();
    if (!res) return;

    const message = `${label} へ ${res.count} 件を書き出しました。`;
    setStatus(message);
    pushActivity(message, 'success');
  }

  async function removeEntry(id: string) {
    const next = entries.filter((entry) => entry.id !== id);
    const saved = await window.udu.saveAllEntries(next);
    setEntries(saved);
    setSelectedIds((prev) => prev.filter((selectedId) => selectedId !== id));
    setHasUnsavedChanges(false);
    await refreshBackups();
    setStatus('1件削除しました。');
    pushActivity('1件削除しました。', 'warn');
  }

  async function removeSelected() {
    if (selectedIds.length === 0) {
      setStatus('削除対象が選ばれていません。');
      return;
    }

    const deleteCount = selectedIds.length;
    const next = entries.filter((entry) => !selectedIds.includes(entry.id));
    const saved = await window.udu.saveAllEntries(next);
    setEntries(saved);
    setSelectedIds([]);
    setHasUnsavedChanges(false);
    await refreshBackups();
    setStatus(`${deleteCount} 件削除しました。`);
    pushActivity(`${deleteCount} 件まとめて削除しました。`, 'warn');
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  function toggleSelectAllVisible() {
    if (allVisibleSelected) {
      setSelectedIds((prev) => prev.filter((id) => !filtered.some((entry) => entry.id === id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...filtered.map((entry) => entry.id)])));
    }
  }

  function applyBulkToggle(scope: BulkScope, field: 'enabledApple' | 'enabledGoogle', nextValue: boolean) {
    const targetIds = new Set(scope === 'selected' ? selectedIds : filtered.map((entry) => entry.id));
    if (targetIds.size === 0) {
      setStatus(scope === 'selected' ? 'まず対象を選択してから一括操作して。' : '今表示されている行がありません。');
      return;
    }

    const changedEntries = entries.map((entry) =>
      targetIds.has(entry.id)
        ? {
            ...entry,
            [field]: nextValue,
            updatedAt: new Date().toISOString()
          }
        : entry
    );

    setEntries(changedEntries);
    setHasUnsavedChanges(true);

    const scopeLabel = scope === 'selected' ? '選択中' : '表示中';
    const fieldLabel = field === 'enabledApple' ? 'Apple' : 'Google';
    const valueLabel = nextValue ? 'ON' : 'OFF';
    const message = `${scopeLabel} ${targetIds.size} 件の ${fieldLabel} を ${valueLabel} にしました。`;
    setStatus(message);
    pushActivity(message, 'info');
  }

  async function copyEntriesAsTsv(scope: BulkScope) {
    const targetEntries = (scope === 'selected' ? entries.filter((entry) => selectedIds.includes(entry.id)) : filtered)
      .map((entry) => [
        entry.reading,
        entry.word,
        entry.pos,
        entry.note,
        entry.enabledApple ? 'TRUE' : 'FALSE',
        entry.enabledGoogle ? 'TRUE' : 'FALSE'
      ].join('\t'));

    if (targetEntries.length === 0) {
      setStatus(scope === 'selected' ? 'コピー対象の選択行がありません。' : 'コピー対象の表示行がありません。');
      return;
    }

    try {
      await navigator.clipboard.writeText(targetEntries.join('\n'));
      const scopeLabel = scope === 'selected' ? '選択中' : '表示中';
      const message = `${scopeLabel} ${targetEntries.length} 件を TSV 形式でクリップボードへコピーしました。`;
      setStatus(message);
      pushActivity(message, 'success');
    } catch {
      setStatus('クリップボードへのコピーに失敗しました。');
      pushActivity('コピー失敗: クリップボードへアクセスできませんでした。', 'warn');
    }
  }

  function collapseDuplicateGroups() {
    if (duplicateGroups.length === 0) {
      setStatus('解消すべき重複候補はありません。');
      return;
    }

    const removeIds = new Set<string>();
    for (const group of duplicateGroups) {
      const sortedGroup = [...group.entries].sort(
        (a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.createdAt.localeCompare(a.createdAt)
      );
      sortedGroup.slice(1).forEach((entry) => removeIds.add(entry.id));
    }

    const nextEntries = entries.filter((entry) => !removeIds.has(entry.id));
    setEntries(nextEntries);
    setSelectedIds((prev) => prev.filter((id) => !removeIds.has(id)));
    setHasUnsavedChanges(true);
    const message = `${duplicateGroups.length} 組の重複候補を整理し、${removeIds.size} 件を一覧上から外しました。保存すると確定します。`;
    setStatus(message);
    pushActivity(message, 'warn');
  }

  async function restoreBackup(snapshotId: string) {
    setRestoringBackupId(snapshotId);
    try {
      const restoredEntries = await window.udu.restoreBackup(snapshotId);
      if (!restoredEntries) {
        setStatus('復元対象のスナップショットが見つかりませんでした。');
        return;
      }

      await refresh();
      setStatus(`バックアップから ${restoredEntries.length} 件を復元しました。`);
      pushActivity(`バックアップ復元: ${restoredEntries.length} 件`, 'warn');
    } finally {
      setRestoringBackupId(null);
    }
  }

  function clearBulkEditDraft() {
    setBulkPosValue('');
    setBulkNotePrefix('');
    setBulkNoteSuffix('');
    setBulkAppleMode('keep');
    setBulkGoogleMode('keep');
  }

  function applyBulkEdit(scope: BulkScope) {
    const targetIds = new Set(scope === 'selected' ? selectedIds : filtered.map((entry) => entry.id));
    if (targetIds.size === 0) {
      setStatus(scope === 'selected' ? '一括編集するには対象を選択して。' : '一括編集する表示行がありません。');
      return;
    }

    const trimmedPos = bulkPosValue.trim();
    const trimmedPrefix = normalizeInlineNote(bulkNotePrefix);
    const trimmedSuffix = normalizeInlineNote(bulkNoteSuffix);
    const hasMutation = Boolean(trimmedPos || trimmedPrefix || trimmedSuffix || bulkAppleMode !== 'keep' || bulkGoogleMode !== 'keep');

    if (!hasMutation) {
      setStatus('一括編集の内容が空です。品詞・メモ・ON/OFF のどれかを指定してください。');
      return;
    }

    const nextEntries = entries.map((entry) => {
      if (!targetIds.has(entry.id)) return entry;

      const noteParts = [trimmedPrefix, normalizeInlineNote(entry.note), trimmedSuffix].filter(Boolean);
      return {
        ...entry,
        pos: trimmedPos || entry.pos,
        note: noteParts.join(' / '),
        enabledApple: bulkAppleMode === 'keep' ? entry.enabledApple : bulkAppleMode === 'on',
        enabledGoogle: bulkGoogleMode === 'keep' ? entry.enabledGoogle : bulkGoogleMode === 'on',
        updatedAt: new Date().toISOString()
      };
    });

    setEntries(nextEntries);
    setHasUnsavedChanges(true);
    const scopeLabel = scope === 'selected' ? '選択中' : '表示中';
    const message = `${scopeLabel} ${targetIds.size} 件へ一括編集を適用しました。保存で確定します。`;
    setStatus(message);
    pushActivity(message, 'info');
  }

  function openDuplicateResolution(group: DuplicateGroup) {
    const sortedGroup = [...group.entries].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.createdAt.localeCompare(a.createdAt));
    setActiveDuplicateGroup(group);
    setKeepDuplicateId(sortedGroup[0]?.id ?? '');
  }

  function resolveActiveDuplicateGroup() {
    if (!activeDuplicateGroup || !keepDuplicateId) return;

    const removeIds = new Set(
      entries
        .filter((entry) => dedupeKey(entry.reading, entry.word) === activeDuplicateGroup.key && entry.id !== keepDuplicateId)
        .map((entry) => entry.id)
    );

    if (removeIds.size === 0) {
      setActiveDuplicateGroup(null);
      return;
    }

    const nextEntries = entries.filter((entry) => !removeIds.has(entry.id));
    setEntries(nextEntries);
    setSelectedIds((prev) => prev.filter((id) => !removeIds.has(id)));
    setHasUnsavedChanges(true);
    const message = `重複候補 ${activeDuplicateGroup.reading} → ${activeDuplicateGroup.word} を整理し、${removeIds.size} 件を外しました。保存で確定します。`;
    setStatus(message);
    pushActivity(message, 'warn');
    setActiveDuplicateGroup(null);
  }

  function focusDuplicateGroup(group: DuplicateGroup) {
    setQuery(group.reading);
    setViewMode('duplicate');
    setStatus(`重複候補: ${group.reading} → ${group.word} を絞り込みました。`);
  }

  const filterItems: Array<{ key: ViewMode; label: string; count: number }> = [
    { key: 'all', label: 'すべて', count: stats.total },
    { key: 'apple', label: 'Apple有効', count: stats.apple },
    { key: 'google', label: 'Google有効', count: stats.google },
    { key: 'dual', label: '両対応', count: stats.dual },
    { key: 'note', label: 'メモあり', count: stats.notes },
    { key: 'duplicate', label: '重複候補', count: stats.duplicates }
  ];

  return (
    <>
      <div className="shell">
        <aside className="sidebar glass">
          <div className="brandBlock">
            <div className="brandBadge">UDU</div>
            <div>
              <h1>UserDictionaryUtil</h1>
              <p>Apple / Google IME をまたぐ、読みベース辞書のハブ。</p>
            </div>
          </div>

          <div className="sidebarSection">
            <span className="sectionLabel">Quick Actions</span>
            <div className="quickActionGrid fourCols">
              <button className="actionButton" onClick={() => void startImportPreview(window.udu.previewAppleImport)}>Apple取込</button>
              <button className="actionButton" onClick={() => void startImportPreview(window.udu.previewGoogleImport)}>Google取込</button>
              <button className="actionButton" onClick={() => void startImportPreview(window.udu.previewCsvImport)}>CSV取込</button>
              <button className="actionButton" onClick={() => void startImportPreview(window.udu.previewBackupImport)}>JSON取込</button>
              <button className="actionButton" onClick={() => void handleExport(window.udu.exportApple, 'Apple plist')}>Apple書出</button>
              <button className="actionButton" onClick={() => void handleExport(window.udu.exportGoogle, 'Google txt')}>Google書出</button>
              <button className="actionButton" onClick={() => void handleExport(window.udu.exportCsv, 'CSV')}>CSV書出</button>
              <button className="actionButton" onClick={() => void handleExport(window.udu.exportBackupJson, 'Backup JSON')}>JSON書出</button>
            </div>
            <button className="actionButton primary" onClick={() => void persistAll()} disabled={!hasUnsavedChanges}>変更を保存</button>
          </div>

          <div className="sidebarSection">
            <span className="sectionLabel">Snapshot</span>
            <div className="miniStats">
              <article className="miniStatCard">
                <span>総件数</span>
                <strong>{stats.total}</strong>
              </article>
              <article className="miniStatCard">
                <span>両対応</span>
                <strong>{stats.dual}</strong>
              </article>
              <article className={`miniStatCard ${stats.duplicateGroups > 0 ? 'warningCard' : ''}`}>
                <span>重複グループ</span>
                <strong>{stats.duplicateGroups}</strong>
              </article>
              <article className="miniStatCard wide">
                <span>最新アクション</span>
                <strong>{latestActivity ? latestActivity.label : 'まだ操作ログなし'}</strong>
                <small>{latestActivity ? formatTime(latestActivity.timestamp) : '—'}</small>
              </article>
            </div>
          </div>

          <div className="sidebarSection">
            <span className="sectionLabel">運用メモ</span>
            <ul className="notesList">
              <li>共通キーは「読み」。例: のむら → 野村空</li>
              <li>重複判定は「読み + 単語」。既存ならインポート時に無視。</li>
              <li>CSV はマスター辞書の受け渡し用。Windows との橋渡しにも使いやすい。</li>
              <li>Backup JSON を吐いておけば、丸ごと復元や別PC移行もかなり安全。</li>
            </ul>
          </div>

          <div className="sidebarSection compact">
            <span className="sectionLabel">Storage</span>
            <p className="pathText">{storagePath || '取得中...'}</p>
          </div>
        </aside>

        <main className="mainContent">
          <section className="topHero glass">
            <div>
              <div className="heroEyebrow">率直 / 未来志向 / GUI重視</div>
              <h2>見た目だけじゃなく、運用とメンテの強さまで持たせる</h2>
              <p>
                CSV の互換性を上げて、重複候補を可視化して、一括操作も入れる。
                日常運用で面倒なところをちゃんと削っていく。
              </p>
              <div className="heroTags">
                <span className="heroTag">読みベース</span>
                <span className="heroTag">重複候補の見える化</span>
                <span className="heroTag">CSV / Apple / Google / JSON</span>
                <span className="heroTag">自動バックアップ復元</span>
              </div>
            </div>

            <div className="heroAside">
              <div className="unsavedBox">
                <span className={`statusDot ${hasUnsavedChanges ? 'dirty' : 'clean'}`} />
                <div>
                  <strong>{hasUnsavedChanges ? '未保存の変更あり' : '保存済み'}</strong>
                  <p>{hasUnsavedChanges ? '編集内容はまだローカル保存前。⌘/Ctrl + S でも保存できる。' : '一覧はディスクに反映済み。'}</p>
                </div>
              </div>

              <div className={`commandCard ${stats.duplicateGroups > 0 ? 'warningCard' : ''}`}>
                <span className="sectionLabel">Health Check</span>
                <strong>{stats.duplicateGroups > 0 ? `重複候補が ${stats.duplicateGroups} 組あります` : '重複候補は見つかっていません'}</strong>
                <p>{stats.duplicateGroups > 0 ? '保存時に自動圧縮はされるが、その前にどれが被っているか確認できる。' : 'この状態ならマスター辞書としてかなり健全。'}</p>
              </div>
            </div>
          </section>

          <section className="statsGrid">
            <article className="statCard glass accentA">
              <span>全エントリ</span>
              <strong>{stats.total}</strong>
              <em>辞書マスターの総量</em>
            </article>
            <article className="statCard glass accentB">
              <span>Apple 有効</span>
              <strong>{stats.apple}</strong>
              <em>Text Replacements 書出対象</em>
            </article>
            <article className="statCard glass accentC">
              <span>Google 有効</span>
              <strong>{stats.google}</strong>
              <em>Google 日本語入力 書出対象</em>
            </article>
            <article className="statCard glass accentD">
              <span>現在表示中</span>
              <strong>{stats.visible}</strong>
              <em>検索 / フィルタ反映後</em>
            </article>
            <article className="statCard glass accentE">
              <span>選択中</span>
              <strong>{stats.selected}</strong>
              <em>一括操作の対象</em>
            </article>
          </section>

          <section className="contentGrid threePanelGrid">
            <article className="panel glass addPanel">
              <div className="panelHeader">
                <div>
                  <span className="sectionLabel">Create Entry</span>
                  <h3>新規登録</h3>
                </div>
                <div className="panelMeta">
                  <span className="metaPill">予測変換向け</span>
                  <span className="metaPill">重複は自動拒否</span>
                </div>
              </div>

              <div className="formGrid">
                <label>
                  <span>読み</span>
                  <input value={reading} onChange={(e) => setReading(e.target.value)} placeholder="のむら" />
                  <small>iPhone でも Windows でも、この読みから候補を出す想定。</small>
                </label>
                <label>
                  <span>単語</span>
                  <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="野村空" />
                  <small>最終的に予測変換へ出したい文字列。</small>
                </label>
                <label>
                  <span>品詞</span>
                  <input value={pos} onChange={(e) => setPos(e.target.value)} placeholder="名詞" />
                  <small>Google 日本語入力向け。通常は「名詞」で十分。</small>
                </label>
                <label>
                  <span>メモ</span>
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="配信名義 / 人名 / タグなど" />
                  <small>あとから一覧検索しやすくするための補助情報。</small>
                </label>
              </div>

              <div className="buttonRow">
                <button className="ghost" onClick={clearDraft}>クリア</button>
                <button className="primary" onClick={() => void handleAdd()}>追加する</button>
              </div>
            </article>

            <article className="panel glass bulkPanel">
              <div className="panelHeader compactHeader">
                <div>
                  <span className="sectionLabel">Bulk Actions</span>
                  <h3>一括操作</h3>
                </div>
              </div>

              <div className="bulkGroup">
                <strong>選択中の {stats.selected} 件</strong>
                <div className="bulkButtons">
                  <button onClick={() => applyBulkToggle('selected', 'enabledApple', true)}>Apple ON</button>
                  <button onClick={() => applyBulkToggle('selected', 'enabledApple', false)}>Apple OFF</button>
                  <button onClick={() => applyBulkToggle('selected', 'enabledGoogle', true)}>Google ON</button>
                  <button onClick={() => applyBulkToggle('selected', 'enabledGoogle', false)}>Google OFF</button>
                </div>
                <div className="utilityButtons">
                  <button className="ghost" onClick={() => void copyEntriesAsTsv('selected')}>選択をTSVコピー</button>
                </div>
              </div>

              <div className="bulkGroup">
                <strong>表示中の {stats.visible} 件</strong>
                <div className="bulkButtons">
                  <button onClick={() => applyBulkToggle('visible', 'enabledApple', true)}>Apple ON</button>
                  <button onClick={() => applyBulkToggle('visible', 'enabledApple', false)}>Apple OFF</button>
                  <button onClick={() => applyBulkToggle('visible', 'enabledGoogle', true)}>Google ON</button>
                  <button onClick={() => applyBulkToggle('visible', 'enabledGoogle', false)}>Google OFF</button>
                </div>
                <div className="utilityButtons">
                  <button className="ghost" onClick={() => void copyEntriesAsTsv('visible')}>表示中をTSVコピー</button>
                </div>
              </div>
            </article>

            <article className="panel glass backupPanel">
              <div className="panelHeader compactHeader">
                <div>
                  <span className="sectionLabel">Auto Backup</span>
                  <h3>復元ポイント</h3>
                </div>
                <span className="metaPill">最新 {backups.length} 件</span>
              </div>

              <div className="backupList">
                {backups.length === 0 ? (
                  <div className="backupEmptyState">
                    <strong>まだ自動スナップショットはありません。</strong>
                    <p>保存・追加・取込・復元の前に自動で積みます。</p>
                  </div>
                ) : (
                  backups.slice(0, 6).map((snapshot) => (
                    <div key={snapshot.id} className="backupItem">
                      <div>
                        <strong>{snapshot.label}</strong>
                        <span>{backupTriggerLabel(snapshot.trigger)} / {snapshot.entryCount} 件 / {formatTime(snapshot.createdAt)}</span>
                      </div>
                      <button
                        className="ghost"
                        onClick={() => void restoreBackup(snapshot.id)}
                        disabled={restoringBackupId === snapshot.id}
                      >
                        {restoringBackupId === snapshot.id ? '復元中...' : '復元'}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </article>

            <article className="panel glass activityPanel">
              <div className="panelHeader compactHeader">
                <div>
                  <span className="sectionLabel">Recent Activity</span>
                  <h3>最近の操作</h3>
                </div>
                <span className="metaPill statusPill">Status: {hasUnsavedChanges ? 'Dirty' : 'Synced'}</span>
              </div>

              <div className="activityList">
                {activities.map((item) => (
                  <div className={`activityItem ${item.tone}`} key={item.id}>
                    <div>
                      <strong>{item.label}</strong>
                      <span>{formatTime(item.timestamp)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="panel glass duplicatePanel">
            <div className="panelHeader">
              <div>
                <span className="sectionLabel">Duplicate Insight</span>
                <h3>重複候補の可視化</h3>
                <p className="panelLead">保存前に、同じ「読み + 単語」が何件被っているかを確認できる。</p>
              </div>
              <div className="panelMeta">
                <span className={`metaPill ${stats.duplicateGroups > 0 ? 'warningCard' : ''}`}>Groups {stats.duplicateGroups}</span>
                <span className="metaPill">Entries {stats.duplicates}</span>
                <button className="ghost" onClick={collapseDuplicateGroups} disabled={stats.duplicateGroups === 0}>最新1件だけ残す</button>
              </div>
            </div>

            {duplicateGroups.length === 0 ? (
              <div className="duplicateEmptyState">
                <strong>重複候補は見つかっていません。</strong>
                <p>このままなら保存時に意図しない圧縮は起きにくい状態。</p>
              </div>
            ) : (
              <div className="duplicateGroupList">
                {duplicateGroups.slice(0, 8).map((group) => (
                  <button key={group.key} className="duplicateGroupCard" onClick={() => focusDuplicateGroup(group)}>
                    <div>
                      <strong>{group.reading} → {group.word}</strong>
                      <span>{group.count} 件が重複候補。クリックで絞り込み。</span>
                    </div>
                    <em>{group.entries.map((entry) => entry.note).filter(Boolean).slice(0, 2).join(' / ') || 'メモなし'}</em>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="panel glass tablePanel">
            <div className="panelHeader tableHeaderWrap">
              <div>
                <span className="sectionLabel">Dictionary Entries</span>
                <h3>辞書一覧</h3>
                <p className="panelLead">読みと単語のペアを中心に、Apple / Google への出力対象を整理する。</p>
              </div>
              <div className="tableTools">
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="読み / 単語 / 品詞 / メモで検索" />
                <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)}>
                  <option value="updated-desc">更新順</option>
                  <option value="reading-asc">読み順</option>
                  <option value="word-asc">単語順</option>
                </select>
                <button className="ghost" onClick={() => { setQuery(''); setViewMode('all'); }}>絞り込み解除</button>
                <button className="danger" onClick={() => void removeSelected()} disabled={selectedIds.length === 0}>選択削除</button>
              </div>
            </div>

            <div className="filterBar">
              {filterItems.map((item) => (
                <button
                  key={item.key}
                  className={`filterChip ${viewMode === item.key ? 'active' : ''}`}
                  onClick={() => setViewMode(item.key)}
                >
                  <span>{item.label}</span>
                  <strong>{item.count}</strong>
                </button>
              ))}
            </div>

            <div className="tableMetaRow">
              <span>{stats.visible} 件を表示中</span>
              <span>{selectedIds.length} 件を選択中</span>
              <span>{latestActivity ? `最終操作 ${formatTime(latestActivity.timestamp)}` : 'まだ操作なし'}</span>
              {stats.duplicateGroups > 0 && <span className="warningText">保存前の重複候補 {stats.duplicateGroups} 組</span>}
            </div>

            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th><input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} /></th>
                    <th>Apple</th>
                    <th>Google</th>
                    <th>読み</th>
                    <th>単語</th>
                    <th>品詞</th>
                    <th>メモ</th>
                    <th>更新</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={9}>
                        <div className="emptyState">
                          <strong>該当するエントリがありません。</strong>
                          <p>検索条件かフィルタを見直すか、上のフォームから新しく追加してください。</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((entry) => (
                      <tr
                        key={entry.id}
                        className={[
                          selectedIds.includes(entry.id) ? 'selectedRow' : '',
                          duplicateIdSet.has(entry.id) ? 'duplicateRow' : ''
                        ].filter(Boolean).join(' ')}
                      >
                        <td>
                          <input type="checkbox" checked={selectedIds.includes(entry.id)} onChange={() => toggleSelected(entry.id)} />
                        </td>
                        <td>
                          <input type="checkbox" checked={entry.enabledApple} onChange={() => void handleToggle(entry.id, 'enabledApple')} />
                        </td>
                        <td>
                          <input type="checkbox" checked={entry.enabledGoogle} onChange={() => void handleToggle(entry.id, 'enabledGoogle')} />
                        </td>
                        <td>
                          <input value={entry.reading} onChange={(e) => handleFieldChange(entry.id, 'reading', e.target.value)} />
                        </td>
                        <td>
                          <input value={entry.word} onChange={(e) => handleFieldChange(entry.id, 'word', e.target.value)} />
                        </td>
                        <td>
                          <input value={entry.pos} onChange={(e) => handleFieldChange(entry.id, 'pos', e.target.value)} />
                        </td>
                        <td>
                          <input value={entry.note} onChange={(e) => handleFieldChange(entry.id, 'note', e.target.value)} />
                        </td>
                        <td className="timestampCell">
                          {formatTime(entry.updatedAt)}
                          {duplicateIdSet.has(entry.id) && <span className="rowFlag">重複候補</span>}
                        </td>
                        <td>
                          <button className="danger subtle" onClick={() => void removeEntry(entry.id)}>削除</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <footer className="footerStatus glass">
            <span>{status}</span>
            <strong>選択 {selectedIds.length} 件</strong>
          </footer>
        </main>
      </div>

      {importPreview && (
        <div className="modalOverlay" onClick={() => void closeImportPreview()}>
          <section className="modalCard glass" onClick={(event) => event.stopPropagation()}>
            <div className="modalHeader">
              <div>
                <span className="sectionLabel">Import Preview</span>
                <h3>{sourceLabel(importPreview.source)} の取込プレビュー</h3>
                <p className="panelLead filePathLead">{importPreview.filePath}</p>
              </div>
              <button className="ghost" onClick={() => void closeImportPreview()}>閉じる</button>
            </div>

            <div className="previewStatsGrid">
              <article className="previewStatCard successTone">
                <span>追加予定</span>
                <strong>{importPreview.added}</strong>
              </article>
              <article className="previewStatCard infoTone">
                <span>有効行</span>
                <strong>{importPreview.validRows}</strong>
              </article>
              <article className="previewStatCard warnTone">
                <span>重複スキップ</span>
                <strong>{importPreview.skippedDuplicate}</strong>
              </article>
              <article className="previewStatCard dangerTone">
                <span>不正行</span>
                <strong>{importPreview.skippedInvalid}</strong>
              </article>
            </div>

            <div className="previewSections">
              <article className="previewPanel">
                <div className="previewPanelHeader">
                  <strong>追加されるサンプル</strong>
                  <span>{importPreview.samples.toAdd.length} 件表示</span>
                </div>
                {importPreview.samples.toAdd.length === 0 ? (
                  <p className="previewEmpty">追加される行はありません。</p>
                ) : (
                  <div className="previewList">
                    {importPreview.samples.toAdd.map((item, index) => (
                      <div key={`${item.reading}-${item.word}-${index}`} className="previewRow">
                        <div>
                          <strong>{item.reading} → {item.word}</strong>
                          <span>{item.pos}{item.note ? ` / ${item.note}` : ''}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>

              <article className="previewPanel">
                <div className="previewPanelHeader">
                  <strong>重複スキップ例</strong>
                  <span>{importPreview.samples.duplicate.length} 件表示</span>
                </div>
                {importPreview.samples.duplicate.length === 0 ? (
                  <p className="previewEmpty">重複は見つかりませんでした。</p>
                ) : (
                  <div className="previewList">
                    {importPreview.samples.duplicate.map((item, index) => (
                      <div key={`${item.reading}-${item.word}-${index}`} className="previewRow muted">
                        <div>
                          <strong>{item.reading} → {item.word}</strong>
                          <span>{item.reason}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>

              <article className="previewPanel fullWidthPanel">
                <div className="previewPanelHeader">
                  <strong>不正行サンプル</strong>
                  <span>{importPreview.samples.invalid.length} 件表示</span>
                </div>
                {importPreview.samples.invalid.length === 0 ? (
                  <p className="previewEmpty">不正行はありません。</p>
                ) : (
                  <div className="previewList">
                    {importPreview.samples.invalid.map((item, index) => (
                      <div key={`${item.reading}-${item.word}-${index}`} className="previewRow dangerRow">
                        <div>
                          <strong>{item.reading || '（空）'} → {item.word || '（空）'}</strong>
                          <span>{item.reason}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            </div>

            <div className="modalActions">
              <button className="ghost" onClick={() => void closeImportPreview()}>キャンセル</button>
              <button className="primary" onClick={() => void applyImportPreview()} disabled={isApplyingImport || importPreview.added === 0}>
                {isApplyingImport ? '取り込み中...' : `${importPreview.added} 件を取り込む`}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

export default App;
