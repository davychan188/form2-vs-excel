# Form 2 vs Excel 對比工具

三合一網頁工具（[GitHub Pages](https://davychan188.github.io/form2-vs-excel/)）：

1. **Form 2 vs Excel** — 用 Tree ID 對比 Height／Crown Spread／Aggregated DBH
2. **兩份 Form 2 對比** — 完整欄位差異
3. **巡查時間間隔** — 同一人員同日 ≥ 20 分鐘；另檢查 Last Inspection Date

## Form 2 數值提取

Housing Department Form 2 版面中，pdf.js 常把數值排在英文標籤**之前**；若用 `Crown Spread[^\d]*(\d+)` 會誤抓 Height。  
現改為以文字座標（標籤右側／附近數字）提取，見 `form2_extract.mjs`。

## 驗證

```bash
npm install pdfjs-dist@4.8.69   # 若本機尚未安裝
node verify_sample.mjs
# 預期：FTA-T0012 / Height 18 / Spread 6 / Aggregated DBH 230
```

樣本：`fixtures/sample-FTA-T0012.pdf`
