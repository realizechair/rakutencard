# クレジットカード仕訳アプリ

## 📋 プロジェクト概要
- **名称**: クレジットカード仕訳アプリ
- **目的**: 楽天カードなどのクレジットカード明細CSVから自動で仕訳データを作成し、Excelファイルとして出力
- **主な機能**:
  - CSVファイルアップロード
  - AI推測 + 学習ルールによる勘定科目・摘要の自動設定
  - 仕訳データの手動編集
  - 店舗別ルール管理（部分一致検索）
  - 勘定科目マスタ管理（追加・編集・削除）
  - Excelファイル出力（.xlsx形式）

## 🌐 アクセスURL
- **開発環境**: https://3000-ix7kgpilm13yvgeo1a94y-5c13a017.sandbox.novita.ai
- **メイン画面**: https://3000-ix7kgpilm13yvgeo1a94y-5c13a017.sandbox.novita.ai
- **店舗別ルール管理**: https://3000-ix7kgpilm13yvgeo1a94y-5c13a017.sandbox.novita.ai/rules

## 💾 データ構造

### データベーステーブル（Cloudflare D1）

#### 1. 勘定科目マスタ（account_subjects）
```sql
- id: INTEGER PRIMARY KEY
- code: TEXT UNIQUE NOT NULL          -- 科目コード（例: CONSUMABLES）
- name: TEXT NOT NULL                 -- 科目名（例: 消耗品費）
- category: TEXT NOT NULL             -- 分類（借方 or 貸方）
- is_system: INTEGER DEFAULT 0        -- システム初期データフラグ（1=システム、0=ユーザー追加）
- created_at: DATETIME
```

**初期借方科目**:
- 消耗品費、旅費交通費、会議費、通信費、水道光熱費、地代家賃、福利厚生費、交際費、広告宣伝費、新聞図書費、修繕費、食費、医療費、雑費

**初期貸方科目**:
- 楽天カード、JCBカード、VISAカード、Mastercardカード、AMEXカード

#### 2. 学習ルール（learning_rules）
```sql
- id: INTEGER PRIMARY KEY
- store_name: TEXT NOT NULL           -- 店名パターン（部分一致で検索）
- account_subject_code: TEXT NOT NULL -- 勘定科目コード
- description_template: TEXT          -- 摘要テンプレート
- use_count: INTEGER DEFAULT 0        -- 使用回数
- created_at: DATETIME
- updated_at: DATETIME
```

### 仕訳データ構造（出力形式）
```typescript
{
  no: number                  // 連番
  date: string                // 日付（YYYY/MM/DD）
  debitAccount: string        // 借方勘定科目名
  creditAccount: string       // 貸方勘定科目名（カードブランド）
  amount: number              // 金額
  description: string         // 摘要
  userType: string            // 区分（家族カード or 本人カード）
}
```

## 📖 使い方

### 1. カードブランドを選択
- メイン画面で使用したカードブランド（楽天カード、JCB等）を選択

### 2. CSVファイルをアップロード
- 楽天カードの明細CSVファイルをアップロード
- 自動的に解析し、仕訳データを生成

### 3. 仕訳データの確認・編集
- 自動生成された仕訳データを確認
- 必要に応じて手動で修正（日付、借方科目、金額、摘要）
- 修正内容を学習ルールとして保存（次回から自動適用）
- **「最新ルールで更新」ボタン**: 店舗別ルール管理で登録・編集したルールを既存の仕訳データに一括適用

### 4. 店舗別ルールの管理
- 「店舗別ルール管理」画面で店名パターンを登録
- パターン例: 「Amazon」→「消耗品費」+「Amazon購入」
- 部分一致で検索されるため、「Amazon.co.jp」「Amazonマーケットプレイス」両方に対応

### 5. 勘定科目の管理
- メイン画面の「勘定科目管理」セクションで追加・編集・削除
- システム初期科目も編集・削除可能

### 6. Excelファイル出力
- 「Excelで出力」ボタンをクリック
- `仕訳データ_YYYY-MM-DD.xlsx` 形式でダウンロード

## 🚀 デプロイ情報
- **プラットフォーム**: Cloudflare Pages + Workers
- **データベース**: Cloudflare D1（SQLite）
- **技術スタック**: 
  - バックエンド: Hono（TypeScript）
  - フロントエンド: TailwindCSS + Vanilla JavaScript
  - ライブラリ: SheetJS (XLSX)、Font Awesome
- **ステータス**: ✅ 開発環境で稼働中

## ✅ 実装済み機能
1. ✅ CSVファイルアップロード・解析
2. ✅ AI推測エンジン（店名から勘定科目・摘要を推測）
3. ✅ 学習ルール（部分一致検索）
4. ✅ 仕訳データ編集UI（表形式、手動修正可能）
5. ✅ 店舗別ルール管理画面（追加・編集・削除）
6. ✅ 勘定科目マスタ管理（追加・編集・削除、システム科目も対応）
7. ✅ 最新ルールで一括更新機能
8. ✅ Excelファイル出力（.xlsx形式）
9. ✅ 楽天カードCSV形式対応（Shift_JIS）

## 🔄 今後の改善案
1. 複数カード会社のCSV形式に対応
2. 仕訳データの一括編集機能
3. 学習ルールのインポート・エクスポート
4. 仕訳データの履歴管理
5. 月次・年次レポート機能
6. AI推測精度の向上（より多くのパターン対応）

## 🛠️ ローカル開発

### 前提条件
- Node.js 18以上
- npm または yarn

### セットアップ
```bash
# 依存関係のインストール
npm install

# データベースマイグレーション
npm run db:migrate:local

# 開発サーバー起動（PM2使用）
npm run build
pm2 start ecosystem.config.cjs

# サービス確認
curl http://localhost:3000
```

### 利用可能なスクリプト
```bash
npm run dev              # Vite開発サーバー
npm run dev:sandbox      # Wranglerローカルサーバー
npm run build            # プロダクションビルド
npm run preview          # ビルド結果のプレビュー
npm run deploy           # Cloudflare Pagesにデプロイ
npm run db:migrate:local # ローカルD1マイグレーション
npm run db:migrate:prod  # 本番D1マイグレーション
npm run clean-port       # ポート3000をクリーンアップ
```

## 📝 更新履歴
- **2026-01-07**: 初回リリース
  - 基本機能実装
  - 店舗別ルール管理画面追加
  - 勘定科目編集機能追加
  - 部分一致検索実装
  - システム科目も編集・削除可能に変更
  - 貸方科目の編集・削除機能を修正
  - 「最新ルールで更新」ボタンを追加（既存仕訳データに一括適用）
