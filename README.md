# Form 2 vs Excel 對比工具

三合一網頁工具（[GitHub Pages](https://davychan188.github.io/form2-vs-excel/)）：

1. **Form 2 vs Excel** — 用 Tree ID 對比 Height／Crown Spread／Aggregated DBH／分流顏色（Excel 有對應欄才一併對比；沒有仍顯示 PDF 值）
2. **兩份 Form 2 對比** — 完整欄位差異
3. **巡查時間間隔** — 同一人員同日 ≥ 20 分鐘；另檢查 Last Inspection Date；表格同 Excel 匯出亦顯示樹高、樹冠闊度、Aggregated DBH、分流顏色

兩份 Form 2 對比嘅總覽表同樣列出樹高、樹冠闊度、Aggregated DBH 同分流顏色。

## Form 2 數值提取

Housing Department Form 2 版面中，pdf.js 常把數值排在英文標籤**之前**；若用 `Crown Spread[^\d]*(\d+)` 會誤抓 Height。  
現改為以文字座標（標籤右側／附近數字）提取，見 `form2_extract.mjs`。  
Date and Time of Inspection、Last Inspection Date 亦以座標提取（日期 `dd/mm/yyyy`、時間由 (hr)(min) 格組成 `HH:MM`）；扁平文字後備同時支援「標籤後數值」同「數值後標籤」。
Triage Colour／分流顏色以標籤右側座標提取，只接受 Black／Red／Orange／Yellow／NIL。

## 驗證

```bash
npm install pdfjs-dist@4.8.69   # 若本機尚未安裝
node verify_sample.mjs
# 預期：FTA-T0012 / Height 18 / Spread 6 / Aggregated DBH 230 / Triage Orange
#       Date 27/12/2025 / Time 09:30 / Last Inspection Date 22/10/2024
```

樣本：`fixtures/sample-FTA-T0012.pdf`
