from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def patch(p: Path, pairs):
  if not p.exists():
    return
  s = p.read_text(encoding="utf-8")
  before = s
  for a,b in pairs:
    s = s.replace(a,b)
  if s != before:
    p.write_text(s, encoding="utf-8")

patch(ROOT / "frontend/src/components/ProcessStage.jsx", [
  ("(Workflow)", ""),
  ("Workflow", "Схема"),
  ("Fit", "Вписать"),
])

patch(ROOT / "frontend/src/components/process/GraphEditorOverlay.jsx", [
  ("nodes:", "узлы:"),
  ("edges:", "связи:"),
  ("Add node", "Добавить шаг"),
  ("Add edge", "Добавить связь"),
  ("Clear graph", "Очистить граф"),
  ("Reload BPMN", "Обновить BPMN"),
  ("type", "тип"),
  ("actor_role", "роль"),
  ("from...", "от..."),
  ("to...", "в..."),
])

print("R12 RU patch applied")
