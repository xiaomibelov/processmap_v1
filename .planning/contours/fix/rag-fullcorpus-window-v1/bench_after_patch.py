#!/usr/bin/env python3
"""Бенч ПОСЛЕ патча: реальный list_rag_chunks из app.rag.storage_rag.

Тот же корпус, что в bench_fullcorpus_load.py (5180 чанков: 5146 bpmn_xml + 34 glossary).
Замер: загрузка unfiltered (limit=2000) + токенизация BM25-пути + RSS.
Запуск: venv-интерпретатором проекта из backend/.
"""
import os, random, resource, sqlite3, sys, tempfile, time, tracemalloc
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[4] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

tmp = tempfile.mkdtemp()
os.environ["PROCESS_DB_PATH"] = str(Path(tmp) / "bench.sqlite3")
os.environ["PROCESS_STORAGE_DIR"] = tmp
os.environ["FPC_DB_BACKEND"] = "sqlite"
os.environ.pop("DATABASE_URL", None)

import app.storage as storage
storage._ensure_schema()

random.seed(42)
N_BPMN, N_DICT, ORG = 5146, 34, "org-bench"

def make_text(xml: bool) -> str:
    n = random.randint(600, 1500)
    words = ["bpmn:task", "sequenceFlow", "процесс"] if xml else ["упаковка", "охлаждение", "шокер"]
    return " ".join(random.choices(words, k=n // 8 + 1))[:n]

import uuid, json
with sqlite3.connect(os.environ["PROCESS_DB_PATH"]) as con:
    ddoc = str(uuid.uuid4())
    con.execute("INSERT INTO rag_documents (doc_id, org_id, source_type, source_id, content_hash, content_text, metadata_json, created_at, updated_at, is_active) VALUES (?,?,'glossary',?,'h','t','{}',1788198339,1788198339,1)", [ddoc, ORG, "glossary"])
    for i in range(N_DICT):
        con.execute("INSERT INTO rag_chunks VALUES (?,?,?,?,?,?,?,?)",
                    [str(uuid.uuid4()), ddoc, ORG, i, make_text(False), 200, '{"source_type":"glossary"}', 1788198339 + i])
    for doc in range(52):  # 52 документа по ~99 чанков = 5146
        did = str(uuid.uuid4())
        con.execute("INSERT INTO rag_documents (doc_id, org_id, source_type, source_id, content_hash, content_text, metadata_json, created_at, updated_at, is_active) VALUES (?,?,'bpmn_xml',?,'h','t','{}',1700000000,1700000000,1)", [did, ORG, f"sess_{doc}"])
        con.executemany("INSERT INTO rag_chunks VALUES (?,?,?,?,?,?,?,?)",
                        [(str(uuid.uuid4()), did, ORG, i, make_text(True), 300, '{"source_type":"bpmn_xml"}', 1700000000 + doc * 100 + i)
                         for i in range(99)])
    con.commit()
print(f"corpus: {N_BPMN + N_DICT} chunks, db = {os.path.getsize(os.environ['PROCESS_DB_PATH'])/1024/1024:.1f} MB")

from app.rag.storage_rag import list_rag_chunks

def rss_mb() -> float:
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024 / 1024

tracemalloc.start()
t0 = time.perf_counter()
chunks = list_rag_chunks(ORG, limit=2000)
t_load = time.perf_counter() - t0
peak, _ = tracemalloc.get_traced_memory()
n_bpmn = sum(1 for c in chunks if "bpmn_xml" in (c.get("metadata_json") or ""))
n_dict = sum(1 for c in chunks if "glossary" in (c.get("metadata_json") or ""))
print(f"list_rag_chunks(limit=2000): {t_load*1000:.1f} ms, loaded={len(chunks)} (bpmn={n_bpmn}, glossary={n_dict}), peak={peak/1024/1024:.1f} MB")

import re
STOP = set("и в на с по для из от до при за к о не но а или что это как так все он она они".split())
def tok(t): return [x for x in re.split(r"[^\w]+", (t or "").lower()) if x and x not in STOP and len(x) > 1]
t0 = time.perf_counter()
_ = [tok(c["chunk_text"]) for c in chunks]
print(f"BM25 tokenize loaded chunks: {(time.perf_counter()-t0)*1000:.1f} ms; RSS={rss_mb():.1f} MB")
assert n_dict == 34 and n_bpmn == 2000, (n_bpmn, n_dict)
print("OK: малый корпус загружен целиком (34/34), окно bpmn_xml = 2000")
