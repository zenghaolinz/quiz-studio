from pathlib import Path

from docx import Document
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfgen import canvas


root = Path(__file__).resolve().parents[1] / "src-tauri" / "tests" / "fixtures"
root.mkdir(parents=True, exist_ok=True)

lines = [
    "1. 水的化学式是？",
    "A. CO2",
    "B. H2O",
    "答案：B",
    "解析：水由氢和氧组成。",
]

doc = Document()
for line in lines:
    doc.add_paragraph(line)
doc.save(root / "question-bank.docx")

pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
pdf = canvas.Canvas(str(root / "question-bank.pdf"))
pdf.setFont("STSong-Light", 12)
y = 800
for line in lines:
    pdf.drawString(72, y, line)
    y -= 24
pdf.showPage()
pdf.save()

scanned = canvas.Canvas(str(root / "scanned-empty.pdf"))
scanned.rect(72, 500, 450, 220)
scanned.showPage()
scanned.save()
