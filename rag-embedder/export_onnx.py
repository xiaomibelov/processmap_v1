"""Экспорт intfloat/multilingual-e5-small в ONNX + int8 dynamic quantization.

Build-stage скрипт (в рантайм-образ не попадает): грузит модель из HF,
экспортирует last_hidden_state (dynamic axes по batch/seq) и квантует веса
MatMul/Gemm в int8. Пулинг и L2-нормализация — в рантайме (numpy), формула
идентична sentence-transformers (MeanPooling + Normalize).

Артефакты: /models/model_int8.onnx, /models/tokenizer.json
"""
import os
import sys

MODEL_NAME = os.environ.get("EMBEDDINGS_MODEL", "intfloat/multilingual-e5-small")
OUT_DIR = sys.argv[1] if len(sys.argv) > 1 else "/models"

import torch
from transformers import AutoModel, AutoTokenizer

os.makedirs(OUT_DIR, exist_ok=True)


class _E5(torch.nn.Module):
    def __init__(self, model):
        super().__init__()
        self.model = model

    def forward(self, input_ids, attention_mask):
        out = self.model(input_ids=input_ids, attention_mask=attention_mask)
        return out.last_hidden_state


def main() -> None:
    print(f"[export] loading {MODEL_NAME}", flush=True)
    model = AutoModel.from_pretrained(MODEL_NAME, torch_dtype=torch.float32)
    model.eval()
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)

    wrapper = _E5(model)
    dummy_ids = torch.ones((1, 8), dtype=torch.long)
    dummy_mask = torch.ones((1, 8), dtype=torch.long)
    fp32_path = os.path.join(OUT_DIR, "model_fp32.onnx")
    print("[export] torch.onnx.export ...", flush=True)
    torch.onnx.export(
        wrapper,
        (dummy_ids, dummy_mask),
        fp32_path,
        input_names=["input_ids", "attention_mask"],
        output_names=["last_hidden_state"],
        dynamic_axes={
            "input_ids": {0: "batch", 1: "seq"},
            "attention_mask": {0: "batch", 1: "seq"},
            "last_hidden_state": {0: "batch", 1: "seq"},
        },
        opset_version=17,
    )
    print(f"[export] fp32 saved: {fp32_path}", flush=True)

    from onnxruntime.quantization import QuantType, quantize_dynamic

    int8_path = os.path.join(OUT_DIR, "model_int8.onnx")
    print("[export] int8 dynamic quantization ...", flush=True)
    quantize_dynamic(
        fp32_path,
        int8_path,
        weight_type=QuantType.QInt8,
    )
    print(f"[export] int8 saved: {int8_path}", flush=True)
    os.remove(fp32_path)

    # tokenizer.json для рантайм-токенизатора (tokenizers, без transformers)
    tok_json = os.path.join(OUT_DIR, "tokenizer.json")
    with open(tok_json, "w", encoding="utf-8") as fh:
        fh.write(tokenizer.backend_tokenizer.to_str())
    print(f"[export] tokenizer saved: {tok_json}", flush=True)

    # Проверочный прогон: ONNX fp32-эквивалентность не нужна (fp32 удалён),
    # но проверим, что int8-сессия открывается и даёт 384-мерный выход.
    import onnxruntime as ort

    sess = ort.InferenceSession(int8_path, providers=["CPUExecutionProvider"])
    enc = tokenizer(["query: проверка"], return_tensors="np", truncation=True, max_length=512)
    outs = sess.run(
        ["last_hidden_state"],
        {
            "input_ids": enc["input_ids"].astype("int64"),
            "attention_mask": enc["attention_mask"].astype("int64"),
        },
    )
    print(f"[export] sanity ok: shape={outs[0].shape}", flush=True)


if __name__ == "__main__":
    main()
