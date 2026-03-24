/**
 * exportDiagramToPdf
 *
 * Captures the bpmn-js canvas (.djs-container) including all HTML overlays
 * using html-to-image (SVG foreignObject approach — handles modern CSS color()).
 * Then generates a PDF via jsPDF.
 *
 * @param {object} options
 * @param {object} options.bpmnRef   - React ref with .current.fit()
 * @param {string} options.sessionId - Used to build filename
 * @returns {Promise<void>}
 */
export async function exportDiagramToPdf({ bpmnRef, sessionId = "diagram" } = {}) {
  const [{ toPng }, { jsPDF }] = await Promise.all([
    import("html-to-image"),
    import("jspdf"),
  ]);

  // 1. Zoom-fit so the full diagram is visible
  if (typeof bpmnRef?.current?.fit === "function") {
    bpmnRef.current.fit();
  }

  // 2. Wait two rAF cycles for viewport transform to settle
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  // 3. Find the bpmn-js container (SVG + HTML overlay layer)
  const container = document.querySelector(".djs-container");
  if (!container) {
    throw new Error("exportDiagramToPdf: .djs-container not found in DOM");
  }

  // 4. Capture as PNG dataURL (pixelRatio:2 for sharper output)
  const dataUrl = await toPng(container, {
    pixelRatio: 2,
    backgroundColor: "#ffffff",
    skipFonts: false,
  });

  // 5. Build PDF — auto orientation based on container aspect ratio
  const { width, height } = container.getBoundingClientRect();
  const isLandscape = width > height;

  const pdf = new jsPDF({
    orientation: isLandscape ? "l" : "p",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // Scale image to fit the page preserving aspect ratio
  const ratio = Math.min(pageWidth / width, pageHeight / height);
  const pdfW = width * ratio;
  const pdfH = height * ratio;
  const offsetX = (pageWidth - pdfW) / 2;
  const offsetY = (pageHeight - pdfH) / 2;

  pdf.addImage(dataUrl, "PNG", offsetX, offsetY, pdfW, pdfH);

  // 6. Download
  const filename = `diagram_${String(sessionId || "export").replace(/[^a-z0-9_-]/gi, "_")}.pdf`;
  pdf.save(filename);
}
