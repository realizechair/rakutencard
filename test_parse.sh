#!/bin/bash
curl -s -X POST http://localhost:3000/api/parse-csv \
  -H "Content-Type: application/json" \
  -d '{
    "csvData": "利用日,利用店名・商品名,利用者,支払方法,利用金額,支払手数料,支払総額,1月支払金額,2月繰越残高,新規サイン,支払月\n2023/12/30,ｲｵﾝﾓ-ﾙﾜｶﾔﾏ,家族,1回払い,8880,0,8880,8880,0,*,2024年1月",
    "creditAccount": "楽天カード"
  }' | jq '.entries[0]'
