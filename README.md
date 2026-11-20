# Form 2 vs Excel 對比工具

網頁工具（[GitHub Pages](https://davychan188.github.io/form2-vs-excel/)）：

1. **Form 2 vs Excel** — 用 Tree ID 對比 Height／Crown Spread／Aggregated DBH／樹種／分流顏色（Excel 有對應欄才一併對比；沒有仍顯示 PDF 值）
2. **兩份 Form 2 對比** — 完整欄位差異
3. **巡查時間間隔** — 同一人員同日 ≥ 20 分鐘；同一巡查人員每日最多 15 份 Form 2（按巡查人員 + 巡檢日期計算，超出會標紅並列出摘要）；另檢查 Last Inspection Date；表格同 Excel 匯出亦顯示樹高、樹冠闊度、Aggregated DBH、分流顏色，並附「每日份數」工作表
4. **目標物／風險摘要** — 批次抽出每份 Form 2 嘅 Target Assessment、Risk Categorisation、Mitigation Measures、Notes、綜合風險評級同下次檢查日期，並可匯出 Word（.docx）或 Excel（.xlsx；含摘要、Target Assessment、Risk Categorisation、Mitigation Measures 工作表）

兩份 Form 2 對比嘅總覽表同樣列出樹種、樹高、樹冠闊度、Aggregated DBH 同分流顏色。

## 每日份數上限

同一巡查人員（Inspection Officer／巡查人員，頁首姓名，不是簽署欄）於同一**巡檢日期**（Date and Time of Inspection／巡查日期及時間）最多可完成 15 份 Form 2；不以「完成表格2日期」計算。姓名只做輕微正規化（首尾空白同連續空白），顯示第一次抽出嘅寫法。缺少人員或日期嘅記錄會另外以「未能提取」列出，不計入配額，亦不會標為超限。分析完成後，三個可上載多份 Form 2 嘅分頁都會顯示摘要（巡查人員、巡檢日期、份數、是否超限），超限列同對應結果列會標紅。

## Form 2 數值提取

Housing Department Form 2 版面中，pdf.js 常把數值排在英文標籤**之前**；若用 `Crown Spread[^\d]*(\d+)` 會誤抓 Height。  
現改為以文字座標（標籤右側／附近數字）提取，見 `form2_extract.mjs`。  
Date and Time of Inspection、Last Inspection Date 亦以座標提取（日期 `dd/mm/yyyy`、時間由 (hr)(min) 格組成 `HH:MM`）；扁平文字後備同時支援「標籤後數值」同「數值後標籤」。
Triage Colour／分流顏色以標籤右側座標提取，接受 Black／Red／Orange／Yellow／NIL，以及「No Triage colour」（或中文「沒有／無／不分流顏色」）。
Tree Species／樹種以標籤右側座標提取（截於分流顏色欄之前），扁平文字後備同時支援「標籤後樹種」同「樹種後標籤」，並避免誤抓 Tree ID、分流顏色、人員或地點。
與 Excel 對比時以學名為準：會忽略「學名/中文名」（或全形斜線 ／）後面嘅中文俗名，並正規化空白、標點同雜交符號 ×／x；畫面仍顯示 Excel 原文字。學名相同就不標紅。


## 驗證

```bash
npm install pdfjs-dist@4.8.69   # 若本機尚未安裝
node verify_sample.mjs
# 預期：FTA-T0012 / Height 18 / Spread 6 / Aggregated DBH 230 / Species Michelia x alba / Triage Orange
#       Date 27/12/2025 / Time 09:30 / Last Inspection Date 22/10/2024
```

樣本：`fixtures/sample-FTA-T0012.pdf`（目標物／風險摘要另用 `/workspace/form2-sample-OT-T0015.pdf` 作第二樣本，該檔不納入 git）。

目標物評估等欄位以座標抽出（與 Height／樹種／人員相同做法），風險表會喺矩陣（Matrix 1）同註腳之前停下，下次檢查日期唔會同「預算完成日期」混淆。
