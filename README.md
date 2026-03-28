# UserDictionaryUtil

Apple Text Replacements と Google 日本語入力のあいだで、**「読み -> 単語」ベースの共通辞書**をまとめて管理する Electron アプリです。

個別の IME ごとに辞書を触るのではなく、**1つのマスター辞書**を持って、Apple / Google / CSV / Backup JSON へ安全に出し入れすることを目的にしています。

## デモ

README 用のサンプルデータで作成したデモ GIF です。実データは使っていません。

![UserDictionaryUtil workflow demo](docs/screenshots/workflow-demo.gif)

## スクリーンショット

### ダッシュボード全体

![UserDictionaryUtil ダッシュボード](docs/screenshots/dashboard-overview.png)

### インポートプレビュー

![UserDictionaryUtil インポートプレビュー](docs/screenshots/import-preview.png)

### 重複候補の可視化

![UserDictionaryUtil 重複候補の可視化](docs/screenshots/duplicate-insight.png)

## 何ができるか

- 読み + 単語のペアで辞書エントリを一元管理
- 重複判定キーは `読み + 単語`
- Apple Text Replacements (`plist`) の取込 / 書出
- Google 日本語入力 (`txt`) の取込 / 書出
- CSV / TSV の取込 / 書出
- Backup JSON の取込 / 書出
- インポート前プレビュー
- 重複候補の可視化と一括整理
- 一括 Apple / Google ON/OFF
- 自動スナップショットと復元ポイント
- 表示中 / 選択中データの TSV コピー
- ローカル JSON にマスター辞書を保存

## このアプリが向いているケース

- iPhone と Windows で同じ固有名詞や活動名義を出したい
- Apple と Google IME の辞書を別々に触るのが面倒
- CSV を経由して辞書を整理・バックアップしたい
- 取り込み前に重複や不正行を確認したい
- 失敗したときに復元ポイントから戻したい

## 対応フォーマット

### 入力
- Apple Text Replacements: `plist`
- Google 日本語入力: `txt`
- 汎用表形式: `csv`, `tsv`, `txt`
- アプリ用バックアップ: `json`

### 出力
- Apple出力: `shortcut = 読み`, `phrase = 単語`
- Google出力: `読み<TAB>単語<TAB>品詞`
- CSV出力: `reading, word, pos, note, enabledApple, enabledGoogle`
- Backup JSON出力: アプリ復元用の完全バックアップ

## 基本フロー

1. マスター辞書にエントリを追加・編集する
2. 必要に応じて CSV / Apple / Google / JSON を取り込む
3. プレビューで **追加予定 / 重複 / 不正行** を確認する
4. 重複候補があれば一覧または重複パネルで整理する
5. Apple / Google それぞれへ書き出す
6. 何かあれば復元ポイントから戻す

## 開発

### 必要環境
- Node.js
- npm

### セットアップ
```bash
npm install
```

### 開発起動
```bash
npm run dev
```

### ビルド
```bash
npm run build
```

### 本番ビルド起動
```bash
npm run start
```

## プロジェクト構成

```text
src/
  App.tsx          # メインUI
  styles.css       # ダークテーマUI
  types.ts         # 型定義
  main.tsx         # レンダラー起点

electron/
  main.ts          # Electron main process / IPC / import-export logic
  preload.ts       # renderer に公開する API
```

## データ保存について

- マスター辞書は Electron の `userData` 配下に JSON で保存されます
- 保存・追加・取込・復元の前に、自動でスナップショットを残します
- Backup JSON を書き出しておくと、別PC移行や丸ごと復元がしやすいです

## 現状の方針

このアプリは、まず **日常運用できる辞書ハブ** を作る方針です。
派手さより、以下を優先しています。

- 取り込み事故を減らす
- 重複を見える化する
- Apple / Google の往復を楽にする
- 壊しても戻せるようにする

## 今後の候補

- 重複解決 UI の強化
- 一括編集の拡張
- 配布ビルド整備
- README / スクリーンショット / リリース導線の強化

## ライセンス

現時点では未設定です。必要なら後で追加してください。
