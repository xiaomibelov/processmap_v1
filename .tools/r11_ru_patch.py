from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def patch_file(p: Path, pairs):
  if not p.exists():
    return
  s = p.read_text(encoding="utf-8")
  before = s
  for a,b in pairs:
    s = s.replace(a,b)
  if s != before:
    p.write_text(s, encoding="utf-8")

graph = ROOT / "frontend/src/components/process/GraphEditorOverlay.jsx"
pairs = [
  ("Graph editor", "Редактор графа"),
  ("Add node", "Добавить шаг"),
  ("Add edge", "Добавить связь"),
  ("+ Add node", "+ Добавить шаг"),
  ("+ Add edge", "+ Добавить связь"),
  ("Clear graph", "Очистить граф"),
  ("Reload BPMN", "Обновить BPMN"),
  ("status:", "статус:"),
  (">Graph<", ">Граф<"),
  ("from…", "от…"),
  ("to…", "в…"),
  ("label (например: Подготовка ингредиентов)", "название (например: Подготовка ингредиентов)"),
  # minimal type labels if present
  (">step<", ">Шаг<"),
  (">decision<", ">Решение<"),
  (">fork<", ">Развилка<"),
  (">join<", ">Слияние<"),
  (">end<", ">Финиш<"),
]
patch_file(graph, pairs)

proc = ROOT / "frontend/src/components/ProcessStage.jsx"
patch_file(proc, [
  ("BPMN import error", "Ошибка BPMN"),
  ("no diagram to display", "нет диаграммы для отображения"),
  ("Fit", "Вписать"),
])

print("R11 RU patch applied")
