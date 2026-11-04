# 樹木風險評估工具集（Form 2 / Excel）

公開工具頁：[https://davychan188.github.io/form2-vs-excel/](https://davychan188.github.io/form2-vs-excel/)

單一頁面（`index.html`）用頂部三個按鈕切換三種檢查模式，全部喺瀏覽器本地處理。

## 線上用法

開啟 [GitHub Pages](https://davychan188.github.io/form2-vs-excel/)，按頂部按鈕選擇模式：

| 按鈕 | 功能 |
|------|------|
| **Form 2 vs Excel** | 上傳 Excel Tree Inventory + 多份 Form 2 PDF，用 Tree ID 配對，對比 Height／Crown Spread／Aggregated DBH，並高亮差異 |
| **兩份 Form 2 對比** | 上傳多份 Form 2 PDF，揀兩份做完整欄位對比，差異黃色標示 |
| **巡查時間間隔** | 上傳多份 Form 2 PDF；同一 Inspection Officer、同一日相鄰巡查須 ≥ 20 分鐘；Last Inspection Date 不可晚於當次日期；衝突紅色標示，可匯出 Excel |

## 獨立備份檔（可選）

Repo 仍保留原本獨立工具，方便本機單開或離線下載：

| 檔案 | 說明 |
|------|------|
| `index.html` | **主工具**：單頁三模式（GitHub Pages 根） |
| `Form2_vs_Excel_Compare.html` | Form 2 vs Excel 獨立頁備份 |
| `Form2_Full_Compare.html` | 兩份 Form 2 完整對比獨立頁備份 |
| `tree_inspection_interval_checker.py` | 本機 Python／tkinter 巡查間隔檢查（可選下載） |

### Python 離線版（可選）

```bash
pip install pdfplumber openpyxl
python tree_inspection_interval_checker.py
```

（GUI 另需本機有 tkinter。）

## 技術說明

- 瀏覽器端：pdf.js + SheetJS（XLSX），無需上傳伺服器
- 巡查間隔模式已喺瀏覽器內實作（等同 Python 腳本邏輯）；`.py` 仍可供本機批次使用

## 授權

供個人／項目內部使用。問題或改進歡迎開 Issue。
