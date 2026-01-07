// 楽天カードCSV行データ型
export interface RakutenCsvRow {
  利用日: string
  '利用店名・商品名': string
  利用者: string
  支払方法: string
  利用金額: string
  支払手数料: string
  支払総額: string
  支払月: string
  [key: string]: string
}

// 仕訳データ型
export interface JournalEntry {
  no: number
  date: string // YYYY/MM/DD
  debitAccount: string // 借方勘定科目
  creditAccount: string // 貸方勘定科目
  amount: number
  description: string // 摘要
  userType: string // 家族カード or 本人カード
  storeName: string // 元の店名（参照用）
}

// 勘定科目マスタ型
export interface AccountSubject {
  id?: number
  code: string
  name: string
  category: '借方' | '貸方'
  is_system?: number
}

// 学習ルール型
export interface LearningRule {
  id?: number
  store_name: string
  account_subject_code: string
  description_template: string
  use_count?: number
}

// AI推測リクエスト型
export interface AiPredictRequest {
  storeName: string
  amount: number
  userType: string
}

// AI推測レスポンス型
export interface AiPredictResponse {
  accountCode: string
  accountName: string
  description: string
  confidence: number // 0-1
}

// Cloudflare Bindings型
export type Bindings = {
  DB: D1Database
}
