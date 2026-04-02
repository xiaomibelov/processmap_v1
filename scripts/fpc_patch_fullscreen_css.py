from pathlib import Path
import re

p = Path("frontend/src/styles/app.css")
s = p.read_text(encoding="utf-8")

marker_begin = "/* fpc: fullscreen stage (managed) BEGIN */"
marker_end   = "/* fpc: fullscreen stage (managed) END */"

block = "\n".join([
  "",
  marker_begin,
  "/*",
  "  Goal: process (center) area must occupy full viewport height under TopBar.",
  "  Key: flex parents must have min-height:0 so children can stretch/scroll.",
  "*/",
  "",
  "html, body, #root { height: 100%; }",
  "",
  "/* If AppShell uses a wrapper, enforce full height + column layout */",
  ".appShell, .AppShell, .shell { height: 100vh; display: flex; flex-direction: column; }",
  "",
  "/* Main content under TopBar must be flexible */",
  ".appMain, .main, .content { flex: 1 1 auto; min-height: 0; display: flex; }",
  "",
  "/* Common layout: left panel + stage */",
  ".layout, .appLayout { flex: 1 1 auto; min-height: 0; display: flex; }",
  "",
  "/* Center stage must grow and allow internal scroll */",
  ".stage, .processStage, .stageWrap { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }",
  "",
  "/* The actual canvas/container area (BPMN/Mermaid) */",
  ".stageBody, .stageContent, .bpmnWrap, .bpmnStage { flex: 1 1 auto; min-height: 0; }",
  "",
  "/* If there is a card-like container inside stage, make it stretch */",
  ".stageCard, .processCard, .panelCard { flex: 1 1 auto; min-height: 0; }",
  "",
  "/* Defensive: allow embedded viewers to use available space */",
  ".bpmnViewport, .mermaidViewport, .diagramViewport, .viewer { height: 100%; min-height: 0; }",
  "",
  marker_end,
  ""
])

if marker_begin in s and marker_end in s:
  s = re.sub(
    re.escape(marker_begin) + r".*?" + re.escape(marker_end),
    block.strip("\n"),
    s,
    flags=re.S
  )
else:
  s = s.rstrip() + block

p.write_text(s, encoding="utf-8")
print("OK: patched fullscreen stage css block")
