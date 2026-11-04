# 樹木風險評估工具集（Form 2 / Excel）

公開工具頁：[https://davychan188.github.io/form2-vs-excel/](https://davychan188.github.io/form2-vs-excel/)

本 repo 收錄三個同 Form 2 Tree Risk Assessment 相關嘅工具。

## 1. Form 2 vs Excel（瀏覽器）

檔案：[`Form2_vs_Excel_Compare.html`](Form2_vs_Excel_Compare.html)

**做乜：** 上傳一份 Excel Tree Inventory 同多份 Form 2 PDF，用 **Tree ID** 自動配對，對比：

- Height（樹高）
- Crown Spread（樹冠闊度）
- Aggregated DBH（合計胸徑）

差異會高亮顯示。

**點用：** 用瀏覽器開啟上述 HTML（或由 [GitHub Pages 入口](https://davychan188.github.io/form2-vs-excel/) 點入），上傳 Excel + PDF 即可。無需安裝。

## 2. 兩份 Form 2 完整欄位對比（瀏覽器）

檔案：[`Form2_Full_Compare.html`](Form2_Full_Compare.html)

**做乜：** 上傳兩份 Form 2 PDF，逐欄對比所有欄位，並標出差異。

**點用：** 瀏覽器開啟即可，無需安裝。

## 3. 巡查時間間隔檢查（本機 Python）

檔案：[`tree_inspection_interval_checker.py`](tree_inspection_interval_checker.py)

**做乜：**

- 由多份 Form 2 PDF 擷取 Inspection Officer、Date、Time、Last Inspection Date 等
- 同一 officer、同一日：相鄰巡查間隔須 **≥ 20 分鐘**
- **Last Inspection Date** 不可晚於當次巡查日期
- 輸出 Excel，衝突以紅色標示

**需要：**

```bash
pip install pdfplumber openpyxl
```

（GUI 模式另需本機有 tkinter。）

**執行：**

```bash
python tree_inspection_interval_checker.py
```

## 線上入口（GitHub Pages）

- 首頁：https://davychan188.github.io/form2-vs-excel/
- Form 2 vs Excel：https://davychan188.github.io/form2-vs-excel/Form2_vs_Excel_Compare.html
- Form 2 完整對比：https://davychan188.github.io/form2-vs-excel/Form2_Full_Compare.html

## 檔案一覽

| 檔案 | 說明 |
|------|------|
| `index.html` | Pages 入口頁（工具目錄） |
| `Form2_vs_Excel_Compare.html` | Form 2 vs Excel 對比 |
| `Form2_Full_Compare.html` | 兩份 Form 2 完整欄位對比 |
| `tree_inspection_interval_checker.py` | 巡查間隔檢查腳本 |

## 授權

供個人／項目內部使用。問題或改進歡迎開 Issue。
