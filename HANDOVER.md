# UserDictionaryUtil — 引き継ぎ書

作成日: 2026-03-28  
対象リポジトリ: https://github.com/kuugaming/UserDictionaryUtil  
作業ブランチ: `main`（ブランチ運用なし、main に直 push）

---

## ■ この引き継ぎ書の使い方

新しい AI 開発環境でこのリポジトリを継続開発するときの出発点。  
**必ず GitHub の main を clone / pull してから作業を始めること。**  
このファイルに書いてある内容より、実ファイルの方が常に正しい。

---

## ■ 絶対ルール

- GitHub リポジトリを source of truth にする
- 実ファイルを確認してから作業する（ファイルの存在を前提にしない）
- 作業後は `npm run build` → commit → push まで行う
- 変更内容・変更ファイル・build 結果・commit hash を毎回報告する
- ユーザーはスマホから指示する前提。報告は短く、次にやることを明示する

---

## ■ 環境セットアップ（新環境での初回手順）

```bash
git clone https://github.com/kuugaming/UserDictionaryUtil.git
cd UserDictionaryUtil
npm install
npm run build   # エラーがないか確認
```

---

## ■ 現在の commit 履歴（最新順）

| hash | 内容 |
|------|------|
| `2987974` | Phase B2/C/D/E/F — Bulk Edit UI, 確認ダイアログ, バックアップ差分, electron-builder, README 日英化 |
| `1cabc16` | Phase B — 重複解決モーダル UI 接続 |
| `7b0562c` | 初回ファイル一式を push |
| `0c962ea` | Initial commit (README のみ) |

---

## ■ プロジェクト構成

```text
UserDictionaryUtil/
├── electron/
│   ├── main.ts          # Electron main process。IPC ハンドラ・import/export ロジック全部ここ
│   ├── preload.ts       # contextBridge で renderer に window.udu を公開
│   └── tsconfig.json
├── src/
│   ├── App.tsx          # React UI。状態管理・イベント処理・全 JSX（1ファイル構成）
│   ├── styles.css       # ダークテーマ CSS。全スタイルここに集約
│   ├── types.ts         # 型定義 + window.udu の型宣言
│   └── main.tsx         # Vite レンダラーエントリ
├── docs/
│   └── screenshots/     # README 用画像（dashboard-overview, import-preview, duplicate-insight, workflow-demo.gif）
├── build/
│   └── icon.png         # 256x256 プレースホルダ（配布ビルド前に差し替え必要）
├── scripts/
│   └── generate_readme_gif.py  # GIF 生成スクリプト（補助ツール）
├── src/components/      # 空ディレクトリ（将来のコンポーネント分割用）
├── src/lib/             # 空ディレクトリ（将来のユーティリティ用）
├── index.html           # Vite エントリ HTML
├── package.json         # scripts + electron-builder build 設定
├── tsconfig.json        # renderer 用 TypeScript 設定
├── vite.config.ts       # Vite 設定
└── .gitignore           # node_modules, dist, dist-electron, release 等を除外
```

---

## ■ npm scripts

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発起動（Vite + Electron 同時起動） |
| `npm run build` | renderer(vite) + electron(tsc) をビルド |
| `npm run build:renderer` | Vite のみ → `dist/` |
| `npm run build:electron` | tsc のみ → `dist-electron/` |
| `npm run start` | ビルド済みファイルで Electron 起動 |
| `npm run dist:win` | Windows NSIS インストーラー → `release/` |
| `npm run dist:mac` | macOS DMG → `release/` |
| `npm run dist:linux` | Linux AppImage → `release/` |
| `npm run dist` | 現在のプラットフォーム向けにパッケージ |

---

## ■ アーキテクチャ概要

```
renderer (React/Vite)
    ↓ window.udu.xxx()
preload.ts (contextBridge)
    ↓ ipcRenderer.invoke()
main.ts (ipcMain.handle)
    ↓ fs / plist / dialog
ローカルファイルシステム
  ~/.../userData/master-dictionary.json   # マスター辞書
  ~/.../userData/backup-history.json      # スナップショット（最大20件）
```

### IPC チャネル一覧

| チャネル | 内容 |
|---|---|
| `entries:list` | 全エントリ取得 |
| `entries:saveAll` | 全エントリ保存（重複除去・正規化あり） |
| `entries:add` | 1件追加（重複なら `{ok:false}` を返す） |
| `import:preview:apple/google/csv/backup` | ファイル選択→プレビュー生成・トークン発行 |
| `import:applyPending` | トークン指定でインポート確定 |
| `import:discardPending` | トークン破棄 |
| `export:apple/google/csv/backup` | 書き出しダイアログ→ファイル保存 |
| `backup:list` | スナップショット一覧（エントリなし） |
| `backup:restore` | スナップショット復元 |
| `storage:path` | userData のパスを返す |

---

## ■ 実装済み機能（確認済み）

### データ操作
- [x] エントリの追加・インライン編集・削除
- [x] 「読み + 単語」を重複判定キーとして扱う（正規化: NFKC + カタカナ→ひらがな変換）
- [x] ⌘/Ctrl + S で保存

### Import / Export
- [x] Apple plist 取込 / 書出（`shortcut` → `reading`, `phrase` → `word`）
- [x] Google txt 取込 / 書出（タブ区切り、ヘッダー自動検出）
- [x] CSV / TSV 取込 / 書出（区切り文字自動検出、ヘッダーエイリアス対応）
- [x] Backup JSON 取込 / 書出
- [x] インポート前プレビュー（追加予定 / 重複スキップ / 不正行の件数と件数表示）

### 重複管理
- [x] Duplicate Insight パネル（重複グループ一覧、最大8グループ表示）
- [x] 「詳細で解決」ボタン → グループ展開モーダル → ラジオで残す1件を選択 → 除去
- [x] 「最新1件だけ残す」一括整理（確認ダイアログ経由）
- [x] テーブル行に `重複候補` フラグ表示

### 一括操作
- [x] Apple / Google ON/OFF（選択中 / 表示中）
- [x] 選択中・表示中 TSV コピー
- [x] 一括編集フォーム（品詞上書き / メモ前後付け / Apple・Google ラジオ切替）
- [x] 選択削除（確認ダイアログ経由）

### バックアップ
- [x] 自動スナップショット（保存前 / 追加前 / 取込前 / 復元前）、最大20件保持
- [x] 復元ポイント一覧（最新8件表示）
- [x] trigger 色分けバッジ（保存前=indigo / 追加前=green / 取込前=amber / 復元前=red）
- [x] 前後スナップショットとのエントリ件数差分表示（+N / -N / ±0）

### UI
- [x] ダークテーマ（`#0b1220` ベース）
- [x] フィルタチップ（すべて / Apple有効 / Google有効 / 両対応 / メモあり / 重複候補）
- [x] ソート（更新順 / 読み順 / 単語順）
- [x] 検索（読み / 単語 / 品詞 / メモ）
- [x] 選択行一括チェックボックス
- [x] Health Check（重複グループ数の警告表示）
- [x] Recent Activity ログ（最新12件）

### 配布ビルド
- [x] electron-builder 導入済み（`npm run dist:win/mac/linux`）
- [x] `build/icon.png` プレースホルダあり（**要差し替え**）

---

## ■ 未実装 / 要対応

| 項目 | 補足 |
|---|---|
| **アイコン差し替え** | `build/icon.ico`（Win）/ `build/icon.icns`（Mac）を用意してから配布ビルド |
| **LICENSE ファイル** | 未作成。MIT 等を選んで追加推奨 |
| **バックアップ詳細比較** | スナップショット間のエントリ差分をモーダルで確認する機能。未実装 |
| **コンポーネント分割** | `src/App.tsx` が 1200行超。`src/components/` は空。分割は任意 |
| **フィルタ連動一括編集** | 現在の一括編集は「選択中」「表示中」。フィルタ条件自体を保存・再利用する機能なし |
| **スプラッシュ画面** | 未実装 |

---

## ■ 型定義（src/types.ts 抜粋）

```ts
type DictionaryEntry = {
  id: string;          // "{timestamp}-{random}"
  reading: string;     // 正規化済み読み（ひらがな）
  word: string;        // 出力する単語
  pos: string;         // 品詞（デフォルト: "名詞"）
  enabledApple: boolean;
  enabledGoogle: boolean;
  note: string;
  createdAt: string;   // ISO 8601
  updatedAt: string;   // ISO 8601
};

type ImportSource = 'apple' | 'google' | 'csv' | 'backup';

type BackupSnapshotMeta = {
  id: string;
  createdAt: string;
  label: string;
  trigger: 'save' | 'add' | 'import' | 'restore';
  entryCount: number;
};
```

---

## ■ 開発方針（ユーザーからの指示）

> このプロジェクトは、まず「日常運用できる辞書ハブ」を目指す。  
> 派手さより以下を優先する:
> - 取り込み事故を減らす
> - 重複を見える化する
> - Apple / Google の往復を楽にする
> - 壊しても戻せるようにする

---

## ■ 次フェーズ候補（優先度順）

### 🔴 高優先

1. **配布ビルド完成**
   - `build/icon.ico` / `build/icon.icns` を実際のアイコンに差し替え
   - `npm run dist:win` で Windows インストーラーを生成して動作確認
   - `release/` に出力される `.exe` の起動・動作チェック手順を README に追記

2. **バックアップ詳細比較モーダル**
   - 復元ポイント一覧の各行に「差分を見る」ボタン
   - スナップショット N と N-1 のエントリを比較し、追加 / 削除 / 変更 を表示
   - `electron/main.ts` に `backup:diff` IPC を追加する方向

### 🟡 中優先

3. **重複解決 UI の更なる改善**
   - 現在: グループ単位で1件を残して除去
   - 候補: duplicate reason の詳細表示（既存と重複 / ファイル内重複）
   - 候補: 無効化（enabledApple=false）で残す選択肢

4. **一括編集の強化**
   - 現在: 品詞上書き / メモ前後付け / Apple・Google ラジオ
   - 候補: 正規表現での note 置換
   - 候補: フィルタ条件を保存して名前付きセットとして再利用

### 🟢 低優先

5. **LICENSE 追加**（MIT 推奨）

6. **コンポーネント分割**
   - `src/App.tsx` を ImportPreviewModal / DuplicateResolutionModal / BulkEditPanel 等に分割
   - `src/components/` に配置

7. **README スクリーンショット更新**
   - 現在の画像は Phase B 以前のもの
   - Bulk Edit フォームや Confirm モーダルが写っていない

---

## ■ 毎回の作業フロー

```bash
# 1. 最新化
cd /path/to/UserDictionaryUtil
git pull origin main

# 2. 実装

# 3. ビルド確認
npm run build   # vite + tsc、エラー 0 を確認

# 4. commit & push
git add -A
git commit -m "feat/fix: 変更内容の説明"
git push origin main
```

---

## ■ 注意事項

- `src/components/` と `src/lib/` は現時点では**空ディレクトリ**。git には含まれない（.gitkeep なし）
- `dist/`, `dist-electron/`, `release/` は `.gitignore` 済み。コミットしない
- `node_modules/` は `.gitignore` 済み。`npm install` で再現する
- `master-dictionary.json` と `backup-history.json` はユーザーの `userData` にのみ存在。リポジトリには入らない
- `build/icon.png` はプレースホルダ（256x256 の単色 PNG）。配布前に差し替えること
- electron-builder の `dist:win` は Windows 環境か Wine が必要。Mac で cross-compile する場合は追加設定が要る
