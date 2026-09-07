#!/usr/bin/env python3
"""Phase 0 бенч fix/rag-fullcorpus-window-v1: стоимость полнокорпусной загрузки rag_chunks.

Симулирует тестовую org со stage 2026-09-07: 5180 чанков (5146 bpmn_xml + 34 словарных),
chunk_text ~ до 1500 символов (MAX_CHARS из app/rag/chunker.py).
Замер: SQL SELECT ... ORDER BY created_at LIMIT 2000 (окно старых чанков) +
конвертация в dict + BM25 add_documents/search — ровно путь routers/rag.py::rag_search.
"""
import os, random, resource, sqlite3, string, sys, tempfile, time, tracemalloc

random.seed(42)
N_BPMN, N_DICT = 5146, 34
WORDS_RU = ["упаковка", "охлаждение", "шокер", "контейнер", "операция", "процесс",
            "партия", "продукт", "температура", "склад", "поток", "задача", "шлюз"]
WORDS_XML = ["bpmn:task", "bpmn:sequenceFlow", "id=", "name=", "sourceRef", "targetRef",
             "<bpmn:startEvent", "</bpmn:endEvent>", "process", "incoming", "outgoing"]

def make_text(xml: bool) -> str:
    n = random.randint(600, 1500)
    words = random.choices(WORDS_XML if xml else WORDS_RU, k=n // 8 + 1)
    return " ".join(words)[:n]

def rss_mb() -> float:
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024 / 1024

def main() -> None:
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    path = tmp.name; tmp.close()
    con = sqlite3.connect(path)
    con.execute("CREATE TABLE rag_chunks (chunk_id TEXT, doc_id TEXT, org_id TEXT, chunk_index INT, chunk_text TEXT, token_count INT, metadata_json TEXT, created_at INT)")
    org = "org-test"
    rows = []
    for i in range(N_BPMN):
        rows.append((f"c{i}", f"d{i}", org, i, make_text(True), 300, '{"source_type":"bpmn_xml"}', 1700000000 + i))
    for i in range(N_DICT):
        rows.append((f"dict{i}", "dd", org, i, make_text(False), 200, '{"source_type":"glossary"}', 1788198339 + i))
    con.executemany("INSERT INTO rag_chunks VALUES (?,?,?,?,?,?,?,?)", rows)
    con.commit()
    print(f"corpus: {N_BPMN + N_DICT} chunks, db size = {os.path.getsize(path)/1024/1024:.1f} MB")

    # === путь list_rag_chunks(org_id, limit=2000) ===
    tracemalloc.start()
    t0 = time.perf_counter()
    cur = con.execute("SELECT * FROM rag_chunks WHERE org_id=? ORDER BY created_at LIMIT 2000", [org])
    fetched = cur.fetchall()
    chunks = [{"chunk_id": r[0], "doc_id": r[1], "org_id": r[2], "chunk_index": r[3],
               "chunk_text": r[4], "token_count": r[5], "metadata_json": r[6], "created_at": r[7]} for r in fetched]
    t_load = time.perf_counter() - t0
    cur_peak, cur_total = tracemalloc.get_traced_memory()
    print(f"SQL load 2000 chunks: {t_load*1000:.1f} ms, tracemalloc peak = {cur_peak/1024/1024:.1f} MB")

    # === BM25 как в rag_search (реимплементируем _tokenize/add_documents, без импорта app) ===
    import re
    STOP = set("и в на с по для из от до при за к о не но а или что это как так все он она они".split())
    def tok(t): return [x for x in re.split(r"[^\w]+", t.lower()) if x and x not in STOP and len(x) > 1]
    t0 = time.perf_counter()
    tokenized = [tok(c["chunk_text"]) for c in chunks]
    t_tok = time.perf_counter() - t0
    cur_peak2, _ = tracemalloc.get_traced_memory()
    print(f"BM25 add_documents (tokenize 2000): {t_tok*1000:.1f} ms")
    t0 = time.perf_counter()
    q = tok("какие свойства у операции упаковки")
    _ = [set(q) & set(d) for d in tokenized]  # грубый скоринг по всем докам
    t_search = time.perf_counter() - t0
    print(f"BM25 score pass 2000 docs: {t_search*1000:.1f} ms")
    print(f"tracemalloc peak total: {max(cur_peak, cur_peak2)/1024/1024:.1f} MB, process RSS: {rss_mb():.1f} MB")

    # === сравнение: загрузка ВСЕГО корпуса (убрать cap) ===
    t0 = time.perf_counter()
    all_rows = con.execute("SELECT * FROM rag_chunks WHERE org_id=? ORDER BY created_at", [org]).fetchall()
    all_chunks = [r[4] for r in all_rows]
    t_all = time.perf_counter() - t0
    cur_peak3, _ = tracemalloc.get_traced_memory()
    print(f"SQL load ALL {len(all_rows)} chunks: {t_all*1000:.1f} ms, tracemalloc peak total = {cur_peak3/1024/1024:.1f} MB")

    # доказательство слепоты: словарные чанки вне окна
    in_window = sum(1 for c in chunks if "glossary" in c["metadata_json"] or c["doc_id"] == "dd")
    print(f"dict chunks inside 2000-oldest window: {in_window}/34")
    con.close(); os.unlink(path)

if __name__ == "__main__":
    main()
