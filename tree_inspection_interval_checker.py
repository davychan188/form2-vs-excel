#!/usr/bin/env python3
"""
Tree Inspection Interval Checker
For Hong Kong DEVB TMCP Form 2 Tree Risk Assessment PDFs

Extracts Inspection Officer, Date, Time from each PDF.
Checks that for the same officer on the same day, inspection intervals >= 20 minutes.
Exports Excel with data and highlights conflicts in red.
"""

import os
import re
import sys
from datetime import datetime
from pathlib import Path
from collections import defaultdict

try:
    import pdfplumber
except ImportError:
    print("Missing library: pdfplumber. Please run: pip install pdfplumber openpyxl")
    sys.exit(1)

try:
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
except ImportError:
    print("Missing library: openpyxl. Please run: pip install openpyxl")
    sys.exit(1)

try:
    import tkinter as tk
    from tkinter import filedialog, messagebox, ttk
except ImportError:
    print("tkinter not available. GUI mode disabled.")
    tk = None


def extract_from_pdf(pdf_path):
    """Extract key fields from Form 2 PDF page 1."""
    result = {
        'filename': os.path.basename(pdf_path),
        'officer': 'Unknown',
        'date': 'Unknown',
        'time': 'Unknown',
        'tree_id': 'Unknown',
        'file_ref': 'Unknown',
        'last_insp_date': 'Unknown',
        'height': None,
        'spread': None,
        'dbh': None,
        'triage': '',
        'error': None
    }
    try:
        with pdfplumber.open(pdf_path) as pdf:
            if not pdf.pages:
                result['error'] = 'Empty PDF'
                return result
            text = pdf.pages[0].extract_text() or ''

        # Inspection Officer (handles titles like Mr. and hyphens in names)
        m = re.search(
            r'Inspection Officer 巡查人員\s+([A-Za-z0-9\s\.\-\']+?)\s+Post',
            text
        )
        if m:
            result['officer'] = m.group(1).strip()

        # Date and Time: 27/01/2026 09 01
        m = re.search(r'Date and Time of Inspection\s+(\d{2}/\d{2}/\d{4})\s+(\d{2})\s+(\d{2})', text)
        if m:
            result['date'] = m.group(1)
            result['time'] = f"{m.group(2)}:{m.group(3)}"

        # Last Inspection Date
        m = re.search(r'Last Inspection Date\s+(\d{2}/\d{2}/\d{4})', text)
        if m:
            result['last_insp_date'] = m.group(1)

        # Dept Tree ID (e.g. WTS2-T0009)
        m = re.search(r'(WTS\d+-T\d+|T\d{4,})', text)
        if m:
            result['tree_id'] = m.group(1)

        # File Ref
        m = re.search(r'File Ref\. 檔案編號\s+([A-Z0-9\-]+)', text)
        if m:
            result['file_ref'] = m.group(1)

        # Tree Height / Crown Spread / Aggregated DBH
        # Prefer "value then label" (pdf.js / some extractors): 18 Tree Height ... 6 Crown Spread
        m = re.search(r'(\d+(?:\.\d+)?)\s*Tree Height', text, re.I)
        if m:
            result['height'] = float(m.group(1))
        if result['height'] is None:
            m = re.search(
                r'Tree Height\s*\(m\)\s*Crown Spread\s*\(m\)\s*No\.\s*of Trunk\s*\(s\)\s+(\d+(?:\.\d+)?)',
                text,
                re.I,
            )
            if m:
                result['height'] = float(m.group(1))
        m = re.search(r'(\d+(?:\.\d+)?)\s*Crown Spread', text, re.I)
        if m:
            result['spread'] = float(m.group(1))
        m = re.search(r'Aggregated DBH\s*\(mm\)\s*(\d{2,4})\b', text, re.I)
        if m:
            result['dbh'] = int(m.group(1))
        if result['dbh'] is None:
            m = re.search(r'\b(\d{2,4})\s+Aggregated DBH', text, re.I)
            if m:
                result['dbh'] = int(m.group(1))

        # Triage Colour: Black / Red / Orange / Yellow / NIL only
        m = re.search(
            r'Triage Colou?r(?:\s*分流顏色)?[\s\S]{0,220}?\b(Black|Red|Orange|Yellow|NIL)\b',
            text,
            re.I,
        ) or re.search(
            r'分流顏色[\s\S]{0,220}?\b(Black|Red|Orange|Yellow|NIL)\b',
            text,
            re.I,
        )
        if m:
            val = m.group(1).strip()
            canon = {'black': 'Black', 'red': 'Red', 'orange': 'Orange', 'yellow': 'Yellow', 'nil': 'NIL'}
            result['triage'] = canon.get(val.lower(), '')

        if result['officer'] == 'Unknown' or result['date'] == 'Unknown':
            result['error'] = 'Could not extract officer or date/time'

    except Exception as e:
        result['error'] = str(e)

    return result


def analyze_intervals(records):
    """
    Group by officer + date, sort by time, compute interval to previous.
    Flag if < 20 minutes.
    Also check that Last Inspection Date is not later than current Inspection Date.
    """
    # Parse datetime
    for r in records:
        r['dt'] = None
        r['prev_interval'] = None
        r['next_interval'] = None
        r['prev_tree_id'] = '-'
        r['next_tree_id'] = '-'
        r['conflicting_trees'] = '-'
        r['status'] = 'OK'
        r['notes'] = ''
        if r['date'] != 'Unknown' and r['time'] != 'Unknown':
            try:
                r['dt'] = datetime.strptime(f"{r['date']} {r['time']}", "%d/%m/%Y %H:%M")
            except Exception:
                r['notes'] = 'Invalid date/time format'

        # Check Last Inspection Date vs current Inspection Date
        if r.get('last_insp_date') not in (None, 'Unknown') and r['date'] != 'Unknown':
            try:
                last_dt = datetime.strptime(r['last_insp_date'], "%d/%m/%Y")
                curr_dt = datetime.strptime(r['date'], "%d/%m/%Y")
                if last_dt > curr_dt:
                    r['status'] = 'CONFLICT'
                    note = f"Last Inspection Date ({r['last_insp_date']}) is later than current Inspection Date ({r['date']})"
                    r['notes'] = (r['notes'] + '; ' if r['notes'] else '') + note
            except Exception:
                pass

    # Group by officer + date for time-interval check
    groups = defaultdict(list)
    for r in records:
        if r['dt']:
            key = (r['officer'], r['date'])
            groups[key].append(r)

    # Analyze each group
    for key, items in groups.items():
        items.sort(key=lambda x: x['dt'])
        n = len(items)
        for i, item in enumerate(items):
            # Previous
            if i > 0:
                prev = items[i - 1]
                delta_prev = (item['dt'] - prev['dt']).total_seconds() / 60.0
                item['prev_interval'] = round(delta_prev, 1)
                item['prev_time'] = prev['time']
                item['prev_tree_id'] = prev.get('tree_id', 'Unknown')
            else:
                item['prev_time'] = '-'

            # Next
            if i < n - 1:
                nxt = items[i + 1]
                delta_next = (nxt['dt'] - item['dt']).total_seconds() / 60.0
                item['next_interval'] = round(delta_next, 1)
                item['next_tree_id'] = nxt.get('tree_id', 'Unknown')

            # Determine conflicts
            conflict_with = []
            notes_parts = []

            if item.get('prev_interval') is not None and item['prev_interval'] < 20:
                conflict_with.append(item['prev_tree_id'])
                notes_parts.append(
                    f"Only {item['prev_interval']:.0f} min after previous "
                    f"(Tree {item['prev_tree_id']})"
                )

            if item.get('next_interval') is not None and item['next_interval'] < 20:
                conflict_with.append(item['next_tree_id'])
                notes_parts.append(
                    f"Only {item['next_interval']:.0f} min before next "
                    f"(Tree {item['next_tree_id']})"
                )

            if conflict_with:
                item['status'] = 'CONFLICT'
                item['conflicting_trees'] = ', '.join(conflict_with)
                time_note = '; '.join(notes_parts)
                item['notes'] = (item['notes'] + '; ' if item['notes'] else '') + time_note

    return records


def export_excel(records, output_path):
    """Export to Excel with highlighting."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Inspection Records"

    headers = [
        "Filename", "Tree ID", "File Ref",
        "Tree Height (m)", "Crown Spread (m)", "Aggregated DBH (mm)", "Triage Colour",
        "Inspection Officer",
        "Date", "Time", "Last Inspection Date",
        "Previous Interval (min)", "Next Interval (min)",
        "Conflicting Tree(s)", "Status", "Notes"
    ]
    ws.append(headers)

    # Styles
    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="2F5496")
    conflict_fill = PatternFill("solid", fgColor="FFC7CE")  # light red
    conflict_font = Font(color="9C0006")
    ok_fill = PatternFill("solid", fgColor="C6EFCE")  # light green
    thin_border = Border(
        left=Side(style='thin'), right=Side(style='thin'),
        top=Side(style='thin'), bottom=Side(style='thin')
    )

    for col in range(1, len(headers) + 1):
        cell = ws.cell(1, col)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = thin_border

    for row_idx, r in enumerate(records, start=2):
        values = [
            r['filename'],
            r.get('tree_id', ''),
            r.get('file_ref', ''),
            r.get('height', '') if r.get('height') not in (None, 0) else '',
            r.get('spread', '') if r.get('spread') not in (None, 0) else '',
            r.get('dbh', '') if r.get('dbh') not in (None, 0) else '',
            r.get('triage', '') or '',
            r['officer'],
            r['date'],
            r['time'],
            r.get('last_insp_date', ''),
            r.get('prev_interval', ''),
            r.get('next_interval', ''),
            r.get('conflicting_trees', '-'),
            r['status'],
            r.get('notes', '') or (r.get('error') or '')
        ]
        for col_idx, val in enumerate(values, start=1):
            cell = ws.cell(row_idx, col_idx, val)
            cell.border = thin_border
            cell.alignment = Alignment(vertical="center", wrap_text=True)
            if r['status'] == 'CONFLICT':
                cell.fill = conflict_fill
                if col_idx in (12, 13, 14, 15):  # intervals, conflicting trees, status
                    cell.font = conflict_font
            elif r['status'] == 'OK' and (r.get('prev_interval') is not None or r.get('next_interval') is not None):
                cell.fill = ok_fill

    # Column widths
    widths = [35, 18, 28, 14, 16, 20, 14, 22, 14, 10, 18, 22, 20, 22, 12, 60]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    ws.row_dimensions[1].height = 30
    ws.auto_filter.ref = f"A1:{get_column_letter(len(headers))}{len(records)+1}"
    ws.freeze_panes = "A2"

    # Summary sheet
    ws2 = wb.create_sheet("Conflicts Summary")
    conflicts = [r for r in records if r['status'] == 'CONFLICT']
    ws2.append(["Summary"])
    ws2.append([f"Total reports processed: {len(records)}"])
    ws2.append([f"Conflicts found: {len(conflicts)}"])
    ws2.append([])
    ws2.append(["Filename", "Tree ID", "Tree Height (m)", "Crown Spread (m)", "Aggregated DBH (mm)", "Triage Colour",
                "Officer", "Date", "Time", "Last Inspection Date",
                "Prev Interval", "Next Interval", "Conflicting Tree(s)", "Notes"])
    for c in conflicts:
        ws2.append([
            c['filename'], c.get('tree_id', ''),
            c.get('height', '') if c.get('height') not in (None, 0) else '',
            c.get('spread', '') if c.get('spread') not in (None, 0) else '',
            c.get('dbh', '') if c.get('dbh') not in (None, 0) else '',
            c.get('triage', '') or '',
            c['officer'], c['date'], c['time'],
            c.get('last_insp_date', ''), c.get('prev_interval', ''), c.get('next_interval', ''),
            c.get('conflicting_trees', ''), c.get('notes', '')
        ])
    for col in range(1, 15):
        ws2.column_dimensions[get_column_letter(col)].width = 20

    wb.save(output_path)
    return len(conflicts)


def process_folder(folder_path):
    """Process all PDFs in folder."""
    pdf_files = list(Path(folder_path).glob("*.pdf")) + list(Path(folder_path).glob("*.PDF"))
    if not pdf_files:
        return [], "No PDF files found in the selected folder."

    records = []
    for pdf in sorted(pdf_files):
        rec = extract_from_pdf(str(pdf))
        records.append(rec)

    records = analyze_intervals(records)
    return records, None


# ==================== GUI ====================
class App:
    def __init__(self, root):
        self.root = root
        self.root.title("Tree Inspection Interval Checker")
        self.root.geometry("700x450")
        self.root.resizable(False, False)

        self.folder_path = tk.StringVar()
        self.selected_files = []          # list of full paths to selected PDFs
        self.status = tk.StringVar(value="Select Form 2 PDF reports (you can select multiple)")

        frame = ttk.Frame(root, padding=20)
        frame.pack(fill="both", expand=True)

        ttk.Label(frame, text="Tree Inspection Interval Checker", font=("Arial", 16, "bold")).pack(pady=(0, 10))
        ttk.Label(frame, text="Checks that same officer does not inspect two trees less than 20 minutes apart on the same day.", wraplength=650).pack(pady=(0, 15))

        ttk.Label(frame, text="PDF reports:").pack(anchor="w")
        path_frame = ttk.Frame(frame)
        path_frame.pack(fill="x", pady=5)
        ttk.Entry(path_frame, textvariable=self.folder_path, width=60, state="readonly").pack(side="left", fill="x", expand=True)
        ttk.Button(path_frame, text="Browse PDFs...", command=self.browse).pack(side="right", padx=5)

        ttk.Button(frame, text="Process PDFs & Export Excel", command=self.process, style="Accent.TButton").pack(pady=15)

        ttk.Label(frame, textvariable=self.status, foreground="blue", wraplength=650).pack(pady=10)

        self.progress = ttk.Progressbar(frame, mode="indeterminate")
        self.progress.pack(fill="x", pady=5)

    def browse(self):
        files = filedialog.askopenfilenames(
            title="Select Form 2 PDF reports (you can select multiple)",
            filetypes=[("PDF files", "*.pdf"), ("All files", "*.*")]
        )
        if files:
            self.selected_files = list(files)
            # Show a short summary in the entry
            if len(files) == 1:
                self.folder_path.set(os.path.basename(files[0]))
            else:
                self.folder_path.set(f"{len(files)} PDFs selected")
            self.status.set(f"Selected {len(files)} PDF(s). Click Process to continue.")

    def process(self):
        if not self.selected_files:
            messagebox.showerror("Error", "Please select one or more PDF files first.")
            return

        self.status.set("Processing PDFs... please wait")
        self.progress.start(10)
        self.root.update()

        try:
            records = []
            for pdf in sorted(self.selected_files):
                rec = extract_from_pdf(pdf)
                records.append(rec)

            records = analyze_intervals(records)

            # Save Excel next to the first selected PDF
            out_dir = os.path.dirname(self.selected_files[0])
            out_name = os.path.join(out_dir, "Inspection_Interval_Check.xlsx")
            conflicts = export_excel(records, out_name)

            msg = f"Processed {len(records)} reports.\nConflicts (<20 min): {conflicts}\n\nExcel saved to:\n{out_name}"
            messagebox.showinfo("Done", msg)
            self.status.set(f"Done. {len(records)} reports, {conflicts} conflicts. Excel saved.")
        except Exception as e:
            messagebox.showerror("Error", str(e))
            self.status.set(f"Error: {e}")
        finally:
            self.progress.stop()


def main():
    if len(sys.argv) > 1:
        # CLI mode: python script.py /path/to/folder
        folder = sys.argv[1]
        records, err = process_folder(folder)
        if err:
            print(err)
            return
        out = os.path.join(folder, "Inspection_Interval_Check.xlsx")
        conflicts = export_excel(records, out)
        print(f"Processed {len(records)} PDFs. Conflicts: {conflicts}")
        print(f"Excel: {out}")
        return

    if tk is None:
        print("Usage: python tree_inspection_checker.py /path/to/pdf_folder")
        return

    root = tk.Tk()
    style = ttk.Style()
    style.configure("Accent.TButton", font=("Arial", 11, "bold"))
    App(root)
    root.mainloop()


if __name__ == "__main__":
    main()
