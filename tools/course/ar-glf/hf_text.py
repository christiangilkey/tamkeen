"""Download only the text column of a Hugging Face dataset kept as parquet files (no audio), one line per row.

    python -I tools/course/ar-glf/hf_text.py <dataset> <out.tsv> <column[,column...]> [file-filter]

Used for the Gulf course's extra Saudi texts (README.md here):
    python -I hf_text.py AhmedEladl/sada2022-Najdi-Clean  build/dialect/sada/najdi-clean.tsv  text,speaker_dialect,show_name,category
    python -I hf_text.py Abdalrahmankamel/sada22-najdi    build/dialect/sada/sada22-najdi.tsv  text,cleaned_text,speaker_dialect
    python -I hf_text.py Omartificial-Intelligence-Space/FineWeb2-Najdi-Arabic  build/dialect/fineweb2/najdi-00000.txt  text  train-00000

Needs pyarrow and fsspec (a scratch venv; the app's own .venv doesn't have them). Reads each parquet file over
HTTP in pieces, so the audio columns are never downloaded.
"""
import sys

import fsspec
import pyarrow.parquet as pq
import requests

dataset, out, columns = sys.argv[1], sys.argv[2], sys.argv[3].split(",")
only = sys.argv[4] if len(sys.argv) > 4 else ""
info = requests.get(f"https://huggingface.co/api/datasets/{dataset}", headers={"User-Agent": "Tamkeen"}, timeout=60).json()
files = [s["rfilename"] for s in info["siblings"] if s["rfilename"].endswith(".parquet") and only in s["rfilename"]]
fs = fsspec.filesystem("http", headers={"User-Agent": "Tamkeen"})
rows = 0
with open(out, "w", encoding="utf-8") as f:
    for name in files:
        url = f"https://huggingface.co/datasets/{dataset}/resolve/main/{name}"
        with fs.open(url, "rb", block_size=2**22) as fh:
            pf = pq.ParquetFile(fh)
            have = [c for c in columns if c in pf.schema_arrow.names]
            for i in range(pf.num_row_groups):
                for row in pf.read_row_group(i, columns=have).to_pylist():
                    f.write("\t".join(str(row.get(c) or "").replace("\t", " ").replace("\n", " ").strip() for c in have) + "\n")
                    rows += 1
        print(name, rows, flush=True)
print("rows", rows)
