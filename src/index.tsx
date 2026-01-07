import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import type { Bindings, RakutenCsvRow, JournalEntry, AccountSubject, LearningRule, AiPredictRequest } from './types'

const app = new Hono<{ Bindings: Bindings }>()

// CORS設定
app.use('/api/*', cors())

// 静的ファイル配信
app.use('/static/*', serveStatic({ root: './public' }))

// ==================== API Routes ====================

// 勘定科目マスタ取得
app.get('/api/account-subjects', async (c) => {
  const { env } = c
  const category = c.req.query('category') // '借方' or '貸方'
  
  let query = 'SELECT * FROM account_subjects'
  const params: string[] = []
  
  if (category) {
    query += ' WHERE category = ?'
    params.push(category)
  }
  
  query += ' ORDER BY is_system DESC, name ASC'
  
  const { results } = await env.DB.prepare(query).bind(...params).all<AccountSubject>()
  return c.json({ subjects: results })
})

// 勘定科目追加
app.post('/api/account-subjects', async (c) => {
  const { env } = c
  const { code, name, category } = await c.req.json<AccountSubject>()
  
  await env.DB.prepare(
    'INSERT INTO account_subjects (code, name, category, is_system) VALUES (?, ?, ?, 0)'
  ).bind(code, name, category).run()
  
  return c.json({ success: true })
})

// 勘定科目削除（システムデータ以外）
app.delete('/api/account-subjects/:code', async (c) => {
  const { env } = c
  const code = c.req.param('code')
  
  await env.DB.prepare(
    'DELETE FROM account_subjects WHERE code = ? AND is_system = 0'
  ).bind(code).run()
  
  return c.json({ success: true })
})

// 学習ルール取得
app.get('/api/learning-rules', async (c) => {
  const { env } = c
  const { results } = await env.DB.prepare(
    'SELECT * FROM learning_rules ORDER BY use_count DESC, store_name ASC'
  ).all<LearningRule>()
  
  return c.json({ rules: results })
})

// 学習ルール保存（更新 or 作成）
app.post('/api/learning-rules', async (c) => {
  const { env } = c
  const { store_name, account_subject_code, description_template } = await c.req.json<LearningRule>()
  
  // 既存ルールがあれば更新、なければ作成
  const existing = await env.DB.prepare(
    'SELECT id FROM learning_rules WHERE store_name = ?'
  ).bind(store_name).first<{ id: number }>()
  
  if (existing) {
    await env.DB.prepare(
      'UPDATE learning_rules SET account_subject_code = ?, description_template = ?, use_count = use_count + 1, updated_at = CURRENT_TIMESTAMP WHERE store_name = ?'
    ).bind(account_subject_code, description_template, store_name).run()
  } else {
    await env.DB.prepare(
      'INSERT INTO learning_rules (store_name, account_subject_code, description_template, use_count) VALUES (?, ?, ?, 1)'
    ).bind(store_name, account_subject_code, description_template).run()
  }
  
  return c.json({ success: true })
})

// 学習ルール更新
app.put('/api/learning-rules/:id', async (c) => {
  const { env } = c
  const id = c.req.param('id')
  const { store_name, account_subject_code, description_template } = await c.req.json<LearningRule>()
  
  await env.DB.prepare(
    'UPDATE learning_rules SET store_name = ?, account_subject_code = ?, description_template = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(store_name, account_subject_code, description_template, id).run()
  
  return c.json({ success: true })
})

// 学習ルール削除
app.delete('/api/learning-rules/:id', async (c) => {
  const { env } = c
  const id = c.req.param('id')
  
  await env.DB.prepare('DELETE FROM learning_rules WHERE id = ?').bind(id).run()
  
  return c.json({ success: true })
})

// 勘定科目更新
app.put('/api/account-subjects/:code', async (c) => {
  const { env } = c
  const code = c.req.param('code')
  const { name, category } = await c.req.json<AccountSubject>()
  
  await env.DB.prepare(
    'UPDATE account_subjects SET name = ?, category = ? WHERE code = ? AND is_system = 0'
  ).bind(name, category, code).run()
  
  return c.json({ success: true })
})

// CSV解析とAI推測
app.post('/api/parse-csv', async (c) => {
  const { env } = c
  const { csvData, creditAccount } = await c.req.json<{ csvData: string, creditAccount: string }>()
  
  // CSV解析（シンプルなパーサー）
  const lines = csvData.trim().split('\n')
  const headers = lines[0].split(',').map(h => h.replace(/"/g, ''))
  
  const rows: RakutenCsvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.replace(/"/g, ''))
    const row: any = {}
    headers.forEach((header, index) => {
      row[header] = values[index] || ''
    })
    rows.push(row as RakutenCsvRow)
  }
  
  // 各行を仕訳データに変換
  const entries: JournalEntry[] = []
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const storeName = row['利用店名・商品名'] || ''
    const amount = parseInt(row['利用金額'] || '0')
    const userType = row['利用者'] === '家族' ? '家族カード' : '本人カード'
    const date = row['利用日'] || ''
    
    // 1. 学習ルールから検索（部分一致）
    const { results: rules } = await env.DB.prepare(
      'SELECT * FROM learning_rules'
    ).all<LearningRule>()
    
    // 部分一致でルールを検索
    const rule = rules.find(r => storeName.includes(r.store_name))
    
    let debitAccount = 'OTHER'
    let description = storeName
    
    if (rule) {
      // 学習ルールがあればそれを使用
      debitAccount = rule.account_subject_code
      description = rule.description_template || storeName
    } else {
      // 2. AI推測を実行
      const prediction = await predictAccountSubject(storeName, amount, userType)
      debitAccount = prediction.accountCode
      description = prediction.description
    }
    
    // 勘定科目名を取得
    const subject = await env.DB.prepare(
      'SELECT name FROM account_subjects WHERE code = ?'
    ).bind(debitAccount).first<{ name: string }>()
    
    entries.push({
      no: i + 1,
      date: date,
      debitAccount: subject?.name || '雑費',
      creditAccount: creditAccount,
      amount: amount,
      description: description,
      userType: userType,
      storeName: storeName
    })
  }
  
  return c.json({ entries })
})

// AI推測関数（シンプルなルールベース推測）
function predictAccountSubject(storeName: string, amount: number, userType: string): { accountCode: string, description: string } {
  const name = storeName.toLowerCase()
  
  // ドラッグストア・薬局
  if (name.includes('マツキヨ') || name.includes('ツルハ') || name.includes('薬')) {
    return { accountCode: 'CONSUMABLES', description: `${storeName} 消耗品購入` }
  }
  
  // スーパー・コンビニ
  if (name.includes('イオン') || name.includes('ロツクスタ') || name.includes('ローソン') || name.includes('セブン')) {
    return { accountCode: 'FOOD', description: `${storeName} 食料品` }
  }
  
  // 交通
  if (name.includes('駅') || name.includes('鉄道') || name.includes('バス') || name.includes('タクシー')) {
    return { accountCode: 'TRAVEL', description: `${storeName} 交通費` }
  }
  
  // カフェ・飲食
  if (name.includes('スタバ') || name.includes('カフェ') || name.includes('喫茶') || name.includes('レストラン')) {
    return { accountCode: 'MEETING', description: `${storeName} 会議費` }
  }
  
  // 書店
  if (name.includes('書店') || name.includes('ブックス')) {
    return { accountCode: 'BOOKS', description: `${storeName} 書籍購入` }
  }
  
  // 通信
  if (name.includes('携帯') || name.includes('ドコモ') || name.includes('au') || name.includes('ソフトバンク')) {
    return { accountCode: 'COMMUNICATION', description: `${storeName} 通信費` }
  }
  
  // 医療
  if (name.includes('病院') || name.includes('クリニック') || name.includes('医院') || name.includes('内科')) {
    return { accountCode: 'MEDICAL', description: `${storeName} 医療費` }
  }
  
  // デフォルト
  return { accountCode: 'OTHER', description: storeName }
}

// ==================== Frontend HTML ====================

// 店舗別ルール管理画面
app.get('/rules', (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>店舗別ルール管理</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
</head>
<body class="bg-gray-50">
    <div class="container mx-auto px-4 py-8 max-w-6xl">
        <!-- ヘッダー -->
        <div class="bg-white rounded-lg shadow-md p-6 mb-6">
            <div class="flex justify-between items-center">
                <div>
                    <h1 class="text-3xl font-bold text-gray-800 mb-2">
                        <i class="fas fa-store text-blue-600 mr-3"></i>
                        店舗別ルール管理
                    </h1>
                    <p class="text-gray-600">店名パターンから勘定科目と摘要を自動変換するルールを管理</p>
                </div>
                <a href="/" class="text-blue-600 hover:text-blue-800">
                    <i class="fas fa-home mr-2"></i>メイン画面へ戻る
                </a>
            </div>
        </div>

        <!-- 新規ルール追加 -->
        <div class="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 class="text-xl font-bold text-gray-800 mb-4">新規ルール追加</h2>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">店名パターン</label>
                    <input type="text" id="new-pattern" 
                           class="w-full border border-gray-300 rounded-lg px-3 py-2" 
                           placeholder="例: Amazon">
                    <p class="text-xs text-gray-500 mt-1">部分一致で検索されます</p>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">借方勘定科目</label>
                    <select id="new-account" class="w-full border border-gray-300 rounded-lg px-3 py-2">
                        <!-- JavaScriptで動的生成 -->
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">摘要テンプレート</label>
                    <input type="text" id="new-description" 
                           class="w-full border border-gray-300 rounded-lg px-3 py-2" 
                           placeholder="例: Amazon購入">
                </div>
                <div>
                    <button onclick="addRule()" class="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                        <i class="fas fa-plus mr-2"></i>追加
                    </button>
                </div>
            </div>
        </div>

        <!-- ルール一覧 -->
        <div class="bg-white rounded-lg shadow-md p-6">
            <h2 class="text-xl font-bold text-gray-800 mb-4">登録済みルール一覧</h2>
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">店名パターン</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">借方勘定科目</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">摘要</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">使用回数</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
                        </tr>
                    </thead>
                    <tbody id="rules-tbody" class="bg-white divide-y divide-gray-200">
                        <!-- データはJavaScriptで動的生成 -->
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <!-- 編集モーダル -->
    <div id="edit-modal" class="fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-50">
        <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 class="text-xl font-bold mb-4">ルール編集</h3>
            <input type="hidden" id="edit-id">
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">店名パターン</label>
                    <input type="text" id="edit-pattern" class="w-full border border-gray-300 rounded-lg px-3 py-2">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">借方勘定科目</label>
                    <select id="edit-account" class="w-full border border-gray-300 rounded-lg px-3 py-2">
                        <!-- JavaScriptで動的生成 -->
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">摘要テンプレート</label>
                    <input type="text" id="edit-description" class="w-full border border-gray-300 rounded-lg px-3 py-2">
                </div>
            </div>
            <div class="flex justify-end space-x-3 mt-6">
                <button onclick="closeEditModal()" class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">キャンセル</button>
                <button onclick="updateRule()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">更新</button>
            </div>
        </div>
    </div>

    <script src="/static/rules.js"></script>
</body>
</html>
  `)
})

app.get('/', (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>クレジットカード仕訳アプリ</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
</head>
<body class="bg-gray-50">
    <div class="container mx-auto px-4 py-8 max-w-7xl">
        <!-- ヘッダー -->
        <div class="bg-white rounded-lg shadow-md p-6 mb-6">
            <div class="flex justify-between items-center">
                <div>
                    <h1 class="text-3xl font-bold text-gray-800 mb-2">
                        <i class="fas fa-credit-card text-blue-600 mr-3"></i>
                        クレジットカード仕訳アプリ
                    </h1>
                    <p class="text-gray-600">CSVファイルから自動で仕訳データを作成します</p>
                </div>
                <a href="/rules" class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                    <i class="fas fa-store mr-2"></i>店舗別ルール管理
                </a>
            </div>
        </div>

        <!-- ステップ1: カードブランド選択 -->
        <div class="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 class="text-xl font-bold text-gray-800 mb-4">
                <span class="bg-blue-600 text-white rounded-full w-8 h-8 inline-flex items-center justify-center mr-2">1</span>
                貸方勘定科目（カードブランド）を選択
            </h2>
            <div id="card-brands" class="grid grid-cols-2 md:grid-cols-5 gap-4">
                <!-- カードボタンはJavaScriptで動的生成 -->
            </div>
            <div class="mt-4">
                <button onclick="showAddCardModal()" class="text-blue-600 hover:text-blue-800">
                    <i class="fas fa-plus-circle mr-2"></i>カードを追加
                </button>
            </div>
        </div>

        <!-- ステップ2: CSVアップロード -->
        <div class="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 class="text-xl font-bold text-gray-800 mb-4">
                <span class="bg-blue-600 text-white rounded-full w-8 h-8 inline-flex items-center justify-center mr-2">2</span>
                CSVファイルをアップロード
            </h2>
            <div class="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <input type="file" id="csv-file" accept=".csv" class="hidden" onchange="handleFileUpload(event)">
                <label for="csv-file" class="cursor-pointer">
                    <i class="fas fa-cloud-upload-alt text-6xl text-gray-400 mb-4"></i>
                    <p class="text-gray-600 mb-2">クリックしてファイルを選択</p>
                    <p class="text-sm text-gray-500">楽天カードCSV形式に対応</p>
                </label>
            </div>
            <div id="file-info" class="mt-4 text-sm text-gray-600"></div>
        </div>

        <!-- ステップ3: 仕訳データ編集 -->
        <div id="journal-section" class="bg-white rounded-lg shadow-md p-6 mb-6 hidden">
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-xl font-bold text-gray-800">
                    <span class="bg-blue-600 text-white rounded-full w-8 h-8 inline-flex items-center justify-center mr-2">3</span>
                    仕訳データ編集
                </h2>
                <button onclick="exportToExcel()" class="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700">
                    <i class="fas fa-file-excel mr-2"></i>Excelで出力
                </button>
            </div>
            
            <div class="overflow-x-auto">
                <table id="journal-table" class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">No</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">日付</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">借方勘定科目</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">貸方勘定科目</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">金額</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">摘要</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">区分</th>
                            <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
                        </tr>
                    </thead>
                    <tbody id="journal-tbody" class="bg-white divide-y divide-gray-200">
                        <!-- データはJavaScriptで動的生成 -->
                    </tbody>
                </table>
            </div>
        </div>

        <!-- 勘定科目管理 -->
        <div class="bg-white rounded-lg shadow-md p-6">
            <h2 class="text-xl font-bold text-gray-800 mb-4">
                <i class="fas fa-list-alt text-blue-600 mr-2"></i>
                勘定科目管理
            </h2>
            <button onclick="showAccountModal()" class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 mb-4">
                <i class="fas fa-plus mr-2"></i>勘定科目を追加
            </button>
            <div id="account-list" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- 勘定科目リストはJavaScriptで動的生成 -->
            </div>
        </div>
    </div>

    <!-- モーダル: 勘定科目追加 -->
    <div id="account-modal" class="fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-50" data-mode="add">
        <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 id="account-modal-title" class="text-xl font-bold mb-4">勘定科目を追加</h3>
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">コード</label>
                    <input type="text" id="account-code" class="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="CUSTOM_001">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">科目名</label>
                    <input type="text" id="account-name" class="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="例: 駐車場代">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">分類</label>
                    <select id="account-category" class="w-full border border-gray-300 rounded-lg px-3 py-2">
                        <option value="借方">借方</option>
                        <option value="貸方">貸方</option>
                    </select>
                </div>
            </div>
            <div class="flex justify-end space-x-3 mt-6">
                <button onclick="closeAccountModal()" class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">キャンセル</button>
                <button onclick="addAccountSubject()" id="account-submit-btn" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">追加</button>
            </div>
        </div>
    </div>

    <!-- モーダル: カード追加 -->
    <div id="card-modal" class="fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-50">
        <div class="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 class="text-xl font-bold mb-4">カードを追加</h3>
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">カード名</label>
                    <input type="text" id="card-name" class="w-full border border-gray-300 rounded-lg px-3 py-2" placeholder="例: ANA VISAカード">
                </div>
            </div>
            <div class="flex justify-end space-x-3 mt-6">
                <button onclick="closeCardModal()" class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">キャンセル</button>
                <button onclick="addCard()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">追加</button>
            </div>
        </div>
    </div>

    <script src="/static/app.js"></script>
</body>
</html>
  `)
})

export default app
