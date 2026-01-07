// グローバル変数
let selectedCreditAccount = ''
let journalEntries = []
let debitAccounts = []
let creditAccounts = []

// 初期化
document.addEventListener('DOMContentLoaded', async () => {
  await loadAccountSubjects()
  await loadCardBrands()
})

// 勘定科目をロード
async function loadAccountSubjects() {
  try {
    const response = await fetch('/api/account-subjects')
    const data = await response.json()
    
    debitAccounts = data.subjects.filter(s => s.category === '借方')
    creditAccounts = data.subjects.filter(s => s.category === '貸方')
    
    renderAccountList()
  } catch (error) {
    console.error('Failed to load account subjects:', error)
  }
}

// カードブランドボタンを表示
async function loadCardBrands() {
  const container = document.getElementById('card-brands')
  container.innerHTML = ''
  
  creditAccounts.forEach(card => {
    const button = document.createElement('button')
    button.className = 'p-4 border-2 border-gray-300 rounded-lg hover:border-blue-600 hover:bg-blue-50 transition-colors'
    button.innerHTML = `
      <div class="text-center">
        <i class="fas fa-credit-card text-3xl text-gray-600 mb-2"></i>
        <p class="font-medium text-gray-800">${card.name}</p>
      </div>
    `
    button.onclick = () => selectCard(card.name)
    container.appendChild(button)
  })
}

// カード選択
function selectCard(cardName) {
  selectedCreditAccount = cardName
  
  // すべてのボタンのスタイルをリセット
  document.querySelectorAll('#card-brands button').forEach(btn => {
    btn.classList.remove('border-blue-600', 'bg-blue-50')
    btn.classList.add('border-gray-300')
  })
  
  // 選択されたボタンをハイライト
  event.target.closest('button').classList.remove('border-gray-300')
  event.target.closest('button').classList.add('border-blue-600', 'bg-blue-50')
  
  alert(`${cardName} を選択しました`)
}

// CSVファイルアップロード
async function handleFileUpload(event) {
  const file = event.target.files[0]
  if (!file) return
  
  if (!selectedCreditAccount) {
    alert('先にカードブランドを選択してください')
    event.target.value = ''
    return
  }
  
  document.getElementById('file-info').innerHTML = `
    <i class="fas fa-spinner fa-spin mr-2"></i>
    <span>${file.name} を解析中...</span>
  `
  
  const reader = new FileReader()
  reader.onload = async (e) => {
    const csvData = e.target.result
    
    try {
      const response = await fetch('/api/parse-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csvData: csvData,
          creditAccount: selectedCreditAccount
        })
      })
      
      const data = await response.json()
      journalEntries = data.entries
      
      document.getElementById('file-info').innerHTML = `
        <i class="fas fa-check-circle text-green-600 mr-2"></i>
        <span class="text-green-600">${file.name} - ${journalEntries.length}件の仕訳データを読み込みました</span>
      `
      
      renderJournalTable()
      document.getElementById('journal-section').classList.remove('hidden')
      
    } catch (error) {
      console.error('CSV parsing failed:', error)
      document.getElementById('file-info').innerHTML = `
        <i class="fas fa-exclamation-circle text-red-600 mr-2"></i>
        <span class="text-red-600">ファイルの解析に失敗しました</span>
      `
    }
  }
  
  reader.readAsText(file, 'Shift_JIS') // 楽天カードCSVはShift_JIS
}

// 仕訳テーブルを描画
function renderJournalTable() {
  const tbody = document.getElementById('journal-tbody')
  tbody.innerHTML = ''
  
  journalEntries.forEach((entry, index) => {
    const row = document.createElement('tr')
    row.className = 'hover:bg-gray-50'
    row.innerHTML = `
      <td class="px-4 py-3 text-sm text-gray-700">${entry.no}</td>
      <td class="px-4 py-3 text-sm text-gray-700">
        <input type="text" value="${entry.date}" 
               onchange="updateEntry(${index}, 'date', this.value)"
               class="border border-gray-300 rounded px-2 py-1 w-32">
      </td>
      <td class="px-4 py-3 text-sm">
        <select onchange="updateEntry(${index}, 'debitAccount', this.value)"
                class="border border-gray-300 rounded px-2 py-1 w-full">
          ${debitAccounts.map(acc => `
            <option value="${acc.name}" ${acc.name === entry.debitAccount ? 'selected' : ''}>
              ${acc.name}
            </option>
          `).join('')}
        </select>
      </td>
      <td class="px-4 py-3 text-sm text-gray-700">${entry.creditAccount}</td>
      <td class="px-4 py-3 text-sm text-gray-700 text-right">
        <input type="number" value="${entry.amount}" 
               onchange="updateEntry(${index}, 'amount', this.value)"
               class="border border-gray-300 rounded px-2 py-1 w-28 text-right">
      </td>
      <td class="px-4 py-3 text-sm">
        <input type="text" value="${entry.description}" 
               onchange="updateEntry(${index}, 'description', this.value)"
               class="border border-gray-300 rounded px-2 py-1 w-full">
      </td>
      <td class="px-4 py-3 text-sm text-gray-700">${entry.userType}</td>
      <td class="px-4 py-3 text-sm">
        <button onclick="saveRule(${index})" 
                class="text-blue-600 hover:text-blue-800" 
                title="この設定を学習">
          <i class="fas fa-save"></i>
        </button>
      </td>
    `
    tbody.appendChild(row)
  })
}

// 仕訳データ更新
function updateEntry(index, field, value) {
  journalEntries[index][field] = field === 'amount' ? parseInt(value) : value
}

// 学習ルールを保存
async function saveRule(index) {
  const entry = journalEntries[index]
  
  // 勘定科目名からコードを取得
  const account = debitAccounts.find(a => a.name === entry.debitAccount)
  if (!account) return
  
  try {
    await fetch('/api/learning-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store_name: entry.storeName,
        account_subject_code: account.code,
        description_template: entry.description
      })
    })
    
    alert('学習ルールを保存しました。次回から自動で適用されます。')
  } catch (error) {
    console.error('Failed to save rule:', error)
    alert('保存に失敗しました')
  }
}

// Excelエクスポート
function exportToExcel() {
  const data = journalEntries.map(entry => ({
    'No': entry.no,
    '日付': entry.date,
    '借方勘定科目': entry.debitAccount,
    '貸方勘定科目': entry.creditAccount,
    '金額': entry.amount,
    '摘要': entry.description,
    '区分': entry.userType
  }))
  
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(data)
  
  // 列幅を設定
  ws['!cols'] = [
    { wch: 5 },  // No
    { wch: 12 }, // 日付
    { wch: 20 }, // 借方
    { wch: 20 }, // 貸方
    { wch: 12 }, // 金額
    { wch: 30 }, // 摘要
    { wch: 15 }  // 区分
  ]
  
  XLSX.utils.book_append_sheet(wb, ws, '仕訳データ')
  XLSX.writeFile(wb, `仕訳データ_${new Date().toISOString().split('T')[0]}.xlsx`)
}

// 勘定科目リスト表示
function renderAccountList() {
  const container = document.getElementById('account-list')
  container.innerHTML = ''
  
  // 借方科目セクション
  const debitSection = document.createElement('div')
  debitSection.innerHTML = '<h3 class="font-bold text-gray-700 mb-2">借方科目</h3>'
  debitAccounts.forEach(account => {
    const card = document.createElement('div')
    card.className = 'p-3 border border-gray-200 rounded-lg flex justify-between items-center mb-2'
    card.innerHTML = `
      <div>
        <span class="font-medium text-gray-800">${account.name}</span>
        <span class="text-xs text-gray-500 ml-2">(${account.code})</span>
      </div>
      <div class="space-x-2">
        ${!account.is_system ? 
          `<button onclick="editAccount('${account.code}')" class="text-blue-600 hover:text-blue-800" title="編集">
            <i class="fas fa-edit"></i>
          </button>
          <button onclick="deleteAccount('${account.code}')" class="text-red-600 hover:text-red-800" title="削除">
            <i class="fas fa-trash"></i>
          </button>` : 
          '<span class="text-xs text-gray-400">システム</span>'
        }
      </div>
    `
    debitSection.appendChild(card)
  })
  container.appendChild(debitSection)
  
  // 貸方科目セクション
  const creditSection = document.createElement('div')
  creditSection.innerHTML = '<h3 class="font-bold text-gray-700 mb-2 mt-4">貸方科目</h3>'
  creditAccounts.forEach(account => {
    const card = document.createElement('div')
    card.className = 'p-3 border border-gray-200 rounded-lg flex justify-between items-center mb-2'
    card.innerHTML = `
      <div>
        <span class="font-medium text-gray-800">${account.name}</span>
        <span class="text-xs text-gray-500 ml-2">(${account.code})</span>
      </div>
      <div class="space-x-2">
        ${!account.is_system ? 
          `<button onclick="editAccount('${account.code}')" class="text-blue-600 hover:text-blue-800" title="編集">
            <i class="fas fa-edit"></i>
          </button>
          <button onclick="deleteAccount('${account.code}')" class="text-red-600 hover:text-red-800" title="削除">
            <i class="fas fa-trash"></i>
          </button>` : 
          '<span class="text-xs text-gray-400">システム</span>'
        }
      </div>
    `
    creditSection.appendChild(card)
  })
  container.appendChild(creditSection)
}

// 勘定科目追加モーダル
function showAccountModal() {
  document.getElementById('account-modal').classList.remove('hidden')
  document.getElementById('account-modal').classList.add('flex')
  document.getElementById('account-code').disabled = false
  document.getElementById('account-code').value = ''
  document.getElementById('account-name').value = ''
  document.getElementById('account-modal').dataset.mode = 'add'
  document.getElementById('account-modal-title').textContent = '勘定科目を追加'
  document.getElementById('account-submit-btn').textContent = '追加'
}

function closeAccountModal() {
  document.getElementById('account-modal').classList.add('hidden')
  document.getElementById('account-modal').classList.remove('flex')
}

function editAccount(code) {
  const allAccounts = [...debitAccounts, ...creditAccounts]
  const account = allAccounts.find(a => a.code === code)
  if (!account || account.is_system) return
  
  document.getElementById('account-code').value = account.code
  document.getElementById('account-code').disabled = true
  document.getElementById('account-name').value = account.name
  document.getElementById('account-category').value = account.category
  document.getElementById('account-modal').dataset.mode = 'edit'
  document.getElementById('account-modal-title').textContent = '勘定科目を編集'
  document.getElementById('account-submit-btn').textContent = '更新'
  
  document.getElementById('account-modal').classList.remove('hidden')
  document.getElementById('account-modal').classList.add('flex')
}

async function addAccountSubject() {
  const code = document.getElementById('account-code').value
  const name = document.getElementById('account-name').value
  const category = document.getElementById('account-category').value
  const mode = document.getElementById('account-modal').dataset.mode
  
  if (!code || !name) {
    alert('コードと科目名を入力してください')
    return
  }
  
  try {
    if (mode === 'edit') {
      // 編集モード
      await fetch(`/api/account-subjects/${code}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, category })
      })
      alert('勘定科目を更新しました')
    } else {
      // 追加モード
      await fetch('/api/account-subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, name, category })
      })
      alert('勘定科目を追加しました')
    }
    
    await loadAccountSubjects()
    if (category === '貸方') {
      await loadCardBrands()
    }
    closeAccountModal()
    
    document.getElementById('account-code').value = ''
    document.getElementById('account-name').value = ''
  } catch (error) {
    console.error('Failed to save account:', error)
    alert('保存に失敗しました')
  }
}

async function deleteAccount(code) {
  if (!confirm('この勘定科目を削除しますか？')) return
  
  try {
    await fetch(`/api/account-subjects/${code}`, {
      method: 'DELETE'
    })
    
    await loadAccountSubjects()
    await loadCardBrands()
  } catch (error) {
    console.error('Failed to delete account:', error)
    alert('削除に失敗しました')
  }
}

// カード追加モーダル
function showAddCardModal() {
  document.getElementById('card-modal').classList.remove('hidden')
  document.getElementById('card-modal').classList.add('flex')
}

function closeCardModal() {
  document.getElementById('card-modal').classList.add('hidden')
  document.getElementById('card-modal').classList.remove('flex')
}

async function addCard() {
  const name = document.getElementById('card-name').value
  
  if (!name) {
    alert('カード名を入力してください')
    return
  }
  
  const code = 'CARD_' + Date.now()
  
  try {
    await fetch('/api/account-subjects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: code,
        name: name,
        category: '貸方'
      })
    })
    
    await loadAccountSubjects()
    await loadCardBrands()
    closeCardModal()
    
    document.getElementById('card-name').value = ''
  } catch (error) {
    console.error('Failed to add card:', error)
    alert('追加に失敗しました')
  }
}
