-- 勘定科目マスタテーブル
CREATE TABLE IF NOT EXISTS account_subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL, -- 借方 or 貸方
  is_system INTEGER DEFAULT 0, -- システム初期データは1
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 学習ルールテーブル（店名 → 勘定科目・摘要のマッピング）
CREATE TABLE IF NOT EXISTS learning_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  store_name TEXT NOT NULL,
  account_subject_code TEXT NOT NULL,
  description_template TEXT,
  use_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_subject_code) REFERENCES account_subjects(code)
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_learning_rules_store_name ON learning_rules(store_name);
CREATE INDEX IF NOT EXISTS idx_account_subjects_code ON account_subjects(code);
CREATE INDEX IF NOT EXISTS idx_account_subjects_category ON account_subjects(category);

-- 初期勘定科目データ（借方科目）
INSERT OR IGNORE INTO account_subjects (code, name, category, is_system) VALUES
  ('CONSUMABLES', '消耗品費', '借方', 1),
  ('TRAVEL', '旅費交通費', '借方', 1),
  ('MEETING', '会議費', '借方', 1),
  ('COMMUNICATION', '通信費', '借方', 1),
  ('UTILITIES', '水道光熱費', '借方', 1),
  ('RENT', '地代家賃', '借方', 1),
  ('WELFARE', '福利厚生費', '借方', 1),
  ('ENTERTAINMENT', '交際費', '借方', 1),
  ('ADVERTISING', '広告宣伝費', '借方', 1),
  ('BOOKS', '新聞図書費', '借方', 1),
  ('REPAIR', '修繕費', '借方', 1),
  ('FOOD', '食費', '借方', 1),
  ('MEDICAL', '医療費', '借方', 1),
  ('OTHER', '雑費', '借方', 1);

-- 初期勘定科目データ（貸方科目 - カードブランド）
INSERT OR IGNORE INTO account_subjects (code, name, category, is_system) VALUES
  ('RAKUTEN_CARD', '楽天カード', '貸方', 1),
  ('JCB_CARD', 'JCBカード', '貸方', 1),
  ('VISA_CARD', 'VISAカード', '貸方', 1),
  ('MASTER_CARD', 'Mastercardカード', '貸方', 1),
  ('AMEX_CARD', 'AMEXカード', '貸方', 1);
