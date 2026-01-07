// グローバル変数
let debitAccounts = []
let rules = []

// 初期化
document.addEventListener('DOMContentLoaded', async () => {
  await loadAccountSubjects()
  await loadRules()
})

// 勘定科目をロード
async function loadAccountSubjects() {
  try {
    const response = await fetch('/api/account-subjects?category=借方')
    const data = await response.json()
    debitAccounts = data.subjects
    
    // セレクトボックスを更新
    renderAccountSelects()
  } catch (error) {
    console.error('Failed to load account subjects:', error)
  }
}

// 勘定科目セレクトボックスを描画
function renderAccountSelects() {
  const newSelect = document.getElementById('new-account')
  const editSelect = document.getElementById('edit-account')
  
  const optionsHTML = debitAccounts.map(acc => 
    `<option value="${acc.code}">${acc.name}</option>`
  ).join('')
  
  newSelect.innerHTML = optionsHTML
  editSelect.innerHTML = optionsHTML
}

// ルールをロード
async function loadRules() {
  try {
    const response = await fetch('/api/learning-rules')
    const data = await response.json()
    rules = data.rules
    renderRulesTable()
  } catch (error) {
    console.error('Failed to load rules:', error)
  }
}

// ルールテーブルを描画
function renderRulesTable() {
  const tbody = document.getElementById('rules-tbody')
  tbody.innerHTML = ''
  
  if (rules.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="px-4 py-8 text-center text-gray-500">
          <i class="fas fa-inbox text-4xl mb-2"></i>
          <p>登録されているルールがありません</p>
        </td>
      </tr>
    `
    return
  }
  
  rules.forEach(rule => {
    const account = debitAccounts.find(a => a.code === rule.account_subject_code)
    const row = document.createElement('tr')
    row.className = 'hover:bg-gray-50'
    row.innerHTML = `
      <td class="px-4 py-3 text-sm text-gray-700 font-medium">${rule.store_name}</td>
      <td class="px-4 py-3 text-sm text-gray-700">${account ? account.name : rule.account_subject_code}</td>
      <td class="px-4 py-3 text-sm text-gray-700">${rule.description_template || '-'}</td>
      <td class="px-4 py-3 text-sm text-gray-700">${rule.use_count || 0}回</td>
      <td class="px-4 py-3 text-sm space-x-2">
        <button onclick="editRule(${rule.id})" class="text-blue-600 hover:text-blue-800" title="編集">
          <i class="fas fa-edit"></i>
        </button>
        <button onclick="deleteRule(${rule.id})" class="text-red-600 hover:text-red-800" title="削除">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `
    tbody.appendChild(row)
  })
}

// ルール追加
async function addRule() {
  const pattern = document.getElementById('new-pattern').value.trim()
  const accountCode = document.getElementById('new-account').value
  const description = document.getElementById('new-description').value.trim()
  
  if (!pattern) {
    alert('店名パターンを入力してください')
    return
  }
  
  try {
    await fetch('/api/learning-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store_name: pattern,
        account_subject_code: accountCode,
        description_template: description
      })
    })
    
    // フォームをクリア
    document.getElementById('new-pattern').value = ''
    document.getElementById('new-description').value = ''
    
    await loadRules()
    alert('ルールを追加しました')
  } catch (error) {
    console.error('Failed to add rule:', error)
    alert('追加に失敗しました')
  }
}

// ルール編集モーダルを開く
function editRule(id) {
  const rule = rules.find(r => r.id === id)
  if (!rule) return
  
  document.getElementById('edit-id').value = rule.id
  document.getElementById('edit-pattern').value = rule.store_name
  document.getElementById('edit-account').value = rule.account_subject_code
  document.getElementById('edit-description').value = rule.description_template || ''
  
  document.getElementById('edit-modal').classList.remove('hidden')
  document.getElementById('edit-modal').classList.add('flex')
}

// ルール編集モーダルを閉じる
function closeEditModal() {
  document.getElementById('edit-modal').classList.add('hidden')
  document.getElementById('edit-modal').classList.remove('flex')
}

// ルール更新
async function updateRule() {
  const id = document.getElementById('edit-id').value
  const pattern = document.getElementById('edit-pattern').value.trim()
  const accountCode = document.getElementById('edit-account').value
  const description = document.getElementById('edit-description').value.trim()
  
  if (!pattern) {
    alert('店名パターンを入力してください')
    return
  }
  
  try {
    await fetch(`/api/learning-rules/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        store_name: pattern,
        account_subject_code: accountCode,
        description_template: description
      })
    })
    
    closeEditModal()
    await loadRules()
    alert('ルールを更新しました')
  } catch (error) {
    console.error('Failed to update rule:', error)
    alert('更新に失敗しました')
  }
}

// ルール削除
async function deleteRule(id) {
  if (!confirm('このルールを削除しますか？')) return
  
  try {
    await fetch(`/api/learning-rules/${id}`, {
      method: 'DELETE'
    })
    
    await loadRules()
    alert('ルールを削除しました')
  } catch (error) {
    console.error('Failed to delete rule:', error)
    alert('削除に失敗しました')
  }
}
