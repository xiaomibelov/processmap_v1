from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP_JS = ROOT / "backend" / "app" / "static" / "app.js"
INDEX_HTML = ROOT / "backend" / "app" / "static" / "index.html"
MOD_DIR = ROOT / "backend" / "app" / "static" / "modules"
MERMAID_MOD = MOD_DIR / "mermaid_view.js"


def _read(p: Path) -> str:
    return p.read_text("utf-8")


def _write(p: Path, s: str) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(s, "utf-8")


def patch_index_html() -> None:
    if not INDEX_HTML.exists():
        raise SystemExit(f"index.html not found: {INDEX_HTML}")

    s = _read(INDEX_HTML)
    if "/static/modules/mermaid_view.js" in s:
        print("index.html: mermaid_view already included")
        return

    tag = '<script src="/static/modules/mermaid_view.js?v=1"></script>'

    # Prefer insert right after zoom module (or notes module), before app.js
    patterns = [
        r'(<script\s+src="/static/modules/notes\.js\?v=[^"]*"\s*></script>)',
        r'(<script\s+src="/static/modules/notes\.js\?v=[^"]*"\s*/?>)',
        r'(<script\s+src="/static/modules/zoom\.js\?v=[^"]*"\s*></script>)',
        r'(<script\s+src="/static/modules/zoom\.js\?v=[^"]*"\s*/?>)',
    ]

    for pat in patterns:
        m = re.search(pat, s)
        if m:
            ins_at = m.end(1)
            s2 = s[:ins_at] + "\n    " + tag + s[ins_at:]
            _write(INDEX_HTML, s2)
            print("index.html: inserted mermaid_view after modules script")
            return

    # Fallback: insert before app.js
    m = re.search(r'(<script\s+src="/static/app\.js\?v=[^"]*"\s*></script>)', s)
    if m:
        ins_at = m.start(1)
        s2 = s[:ins_at] + "    " + tag + "\n" + s[ins_at:]
        _write(INDEX_HTML, s2)
        print("index.html: inserted mermaid_view before app.js")
        return

    raise SystemExit("index.html: cannot find insertion point for mermaid_view")


def ensure_mermaid_module() -> None:
    MOD_DIR.mkdir(parents=True, exist_ok=True)

    if MERMAID_MOD.exists():
        print("modules/mermaid_view.js: already exists")
        return

    content = """/* Food Process Copilot (MVP)
 * Mermaid view module: rendering + inline question badges + popover
 *
 * Exposes: window.FPCMermaidView = { renderMermaid, renderInlineQuestions, clearOverlay }
 */

(function () {
  'use strict';

  function el(id) { return document.getElementById(id); }

  function _graphEls() {
    return {
      wrap: el('graphWrap'),
      inner: el('graphInner'),
      overlay: el('graphOverlay'),
      popover: el('overlayPopover'),
      mermaid: el('mermaid'),
    };
  }

  function clearOverlay() {
    const { overlay, popover } = _graphEls();
    if (overlay) overlay.innerHTML = '';
    if (popover) popover.classList.add('hidden');
  }

  function _findAnchorForNode(nodeId) {
    // Mermaid renders nodes as <g class="node" id="<nodeId>">...
    const g = document.querySelector('g.node[id="' + CSS.escape(nodeId) + '"]');
    if (!g) return null;
    const rect = g.getBoundingClientRect();
    return { rect, el: g };
  }

  function _rectWithinInner(rect) {
    const { inner } = _graphEls();
    if (!inner) return null;
    const ib = inner.getBoundingClientRect();
    return {
      left: rect.left - ib.left,
      top: rect.top - ib.top,
      width: rect.width,
      height: rect.height,
    };
  }

  function _setPopoverHtml(html) {
    const { popover } = _graphEls();
    if (!popover) return;
    popover.innerHTML = html;
  }

  function _openPopoverAt(x, y, html) {
    const { popover } = _graphEls();
    if (!popover) return;

    _setPopoverHtml(html);
    popover.style.left = (x + 10) + 'px';
    popover.style.top = (y + 10) + 'px';
    popover.classList.remove('hidden');
  }

  function _closePopover() {
    const { popover } = _graphEls();
    if (!popover) return;
    popover.classList.add('hidden');
  }

  function _parseHash() {
    const h = (location.hash || '').replace(/^#/, '');
    const out = {};
    h.split('&').forEach((kv) => {
      if (!kv) return;
      const [k, v] = kv.split('=');
      out[decodeURIComponent(k || '')] = decodeURIComponent(v || '');
    });
    return out;
  }

  function _setHashKV(key, value) {
    const h = _parseHash();
    if (value === null || value === undefined || value === '') delete h[key];
    else h[key] = value;

    const parts = Object.keys(h)
      .filter((k) => k)
      .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(h[k]));

    location.hash = parts.length ? ('#' + parts.join('&')) : '';
  }

  function _selectedNodeIdFromHash() {
    const h = _parseHash();
    return h.node || null;
  }

  function _buildPopoverHtml(nodeId, openQuestions) {
    const title = nodeId || '';

    const items = (openQuestions || []).slice(0, 15).map((q) => {
      const t = (q.text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return '<li class="mz-q-item">' + t + '</li>';
    }).join('');

    const more = (openQuestions || []).length > 15
      ? '<div class="mz-q-more">+' + ((openQuestions || []).length - 15) + ' more</div>'
      : '';

    return (
      '<div class="mz-pop">'
      + '<div class="mz-pop-head">'
      +   '<div class="mz-pop-title">' + title.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div>'
      +   '<button type="button" class="mz-pop-close" data-act="close">×</button>'
      + '</div>'
      + '<div class="mz-pop-body">'
      +   '<div class="mz-pop-row">Открытые вопросы: <b>' + (openQuestions || []).length + '</b></div>'
      +   '<ul class="mz-q-list">' + (items || '') + '</ul>'
      +   more
      +   '<div class="mz-pop-actions">'
      +     '<button type="button" class="mz-btn" data-act="open-node" data-node="' + nodeId + '">Открыть узел</button>'
      +   '</div>'
      + '</div>'
      + '</div>'
    );
  }

  function renderInlineQuestions(session) {
    const { overlay, inner } = _graphEls();
    if (!overlay || !inner) return;

    const questions = (session && session.questions) ? session.questions : [];
    const open = questions.filter((q) => (q.status || 'open') === 'open');

    // Build counts per node
    const counts = {};
    for (const q of open) {
      if (!q.nodeId) continue;
      counts[q.nodeId] = (counts[q.nodeId] || 0) + 1;
    }

    // Clear overlay
    overlay.innerHTML = '';

    const nodeIds = Object.keys(counts);
    if (!nodeIds.length) return;

    const selected = _selectedNodeIdFromHash();

    for (const nodeId of nodeIds) {
      const anchor = _findAnchorForNode(nodeId);
      if (!anchor) continue;

      const r = _rectWithinInner(anchor.rect);
      if (!r) continue;

      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'badge' + (selected === nodeId ? ' badge--active' : '');
      b.textContent = String(counts[nodeId]);
      b.style.left = (r.left + r.width - 10) + 'px';
      b.style.top = (r.top - 10) + 'px';
      b.dataset.nodeid = nodeId;

      b.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const openQuestions = open.filter((q) => q.nodeId === nodeId);
        const html = _buildPopoverHtml(nodeId, openQuestions);
        _openPopoverAt(r.left + r.width, r.top, html);
      });

      overlay.appendChild(b);
    }

    // Close popover on overlay empty click
    overlay.addEventListener('click', (e) => {
      const t = e.target;
      if (t && t.classList && t.classList.contains('badge')) return;
      _closePopover();
    }, { passive: true });

    // Global popover actions
    const { popover } = _graphEls();
    if (popover) {
      popover.addEventListener('click', (e) => {
        const t = e.target;
        if (!t || !t.dataset) return;
        if (t.dataset.act === 'close') {
          e.preventDefault();
          _closePopover();
          return;
        }
        if (t.dataset.act === 'open-node') {
          e.preventDefault();
          const nodeId2 = t.dataset.node || '';
          _setHashKV('node', nodeId2);
          _closePopover();
        }
      });
    }
  }

  async function renderMermaid(code) {
    const { mermaid } = _graphEls();
    if (!mermaid) return;

    mermaid.textContent = code || '';

    try {
      // Global mermaid (already loaded by CDN)
      await window.mermaid.run({ nodes: [mermaid] });
    } catch (e) {
      // Keep page alive even if diagram invalid
      console.warn('mermaid.run failed', e);
    }

    const svg = mermaid.querySelector('svg');
    if (svg) {
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
    }

    // Notify zoom module (fit hooks)
    try { document.dispatchEvent(new Event('fpc:mermaid:rendered')); } catch (_) {}
  }

  window.FPCMermaidView = {
    renderMermaid,
    renderInlineQuestions,
    clearOverlay,
  };
})();
"""

    _write(MERMAID_MOD, content)
    print("modules/mermaid_view.js: created")


def patch_app_js() -> None:
    if not APP_JS.exists():
        raise SystemExit(f"app.js not found: {APP_JS}")

    s = _read(APP_JS)
    if "window.FPCMermaidView" in s and "_mv()" in s:
        print("app.js: already patched for modular mermaid")
        return

    # Find a replaceable block: from Graph overlay helpers to API+render section.
    start = s.find("// Graph overlay helpers")
    if start < 0:
        start = s.find("function _graphEls")
    if start < 0:
        raise SystemExit("app.js: cannot find graph overlay block start")

    end = s.find("// ---- API + render", start)
    if end < 0:
        end = s.find("// ---- API", start)
    if end < 0:
        raise SystemExit("app.js: cannot find graph overlay block end")

    replacement = """// ---- Mermaid view (module) ----
function _mv() {
  return window.FPCMermaidView || null;
}

function _renderInlineQuestions(session) {
  const mv = _mv();
  if (mv && mv.renderInlineQuestions) return mv.renderInlineQuestions(session);
}

async function renderMermaid(code) {
  const mv = _mv();
  if (mv && mv.renderMermaid) return mv.renderMermaid(code);

  // Fallback: minimal render (keeps app usable if module not loaded)
  const m = document.getElementById('mermaid');
  if (!m) return;
  m.textContent = code || '';
  try { await window.mermaid.run({ nodes: [m] }); } catch (_) {}
  const svg = m.querySelector('svg');
  if (svg) { svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%'); }
  try { document.dispatchEvent(new Event('fpc:mermaid:rendered')); } catch (_) {}
}

"""

    s2 = s[:start] + replacement + s[end:]
    _write(APP_JS, s2)
    print("app.js: replaced graph overlay block with module delegations")


def main() -> None:
    ensure_mermaid_module()
    patch_index_html()
    patch_app_js()


if __name__ == "__main__":
    main()
