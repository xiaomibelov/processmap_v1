/**
 * Lightweight XML pretty-printer.
 *
 * Does NOT parse/re-serialize the document, so it never introduces entity,
 * namespace, or attribute-order changes. It tokenizes the input into tags,
 * text, CDATA, comments and processing instructions and re-indents them with
 * 2-space indentation.
 *
 * @param {string} rawXml
 * @returns {string}
 */
export function prettyPrintXml(rawXml) {
  const raw = String(rawXml || "").trim();
  if (!raw) return "";

  const tokens = tokenizeXml(raw);
  let formatted = "";
  let indent = 0;
  const pad = "  ";

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];

    if (token.type === "text") {
      const text = token.value.replace(/\s+/g, " ").trim();
      if (text) {
        formatted += pad.repeat(indent) + text + "\n";
      }
      continue;
    }

    if (token.type === "comment" || token.type === "cdata" || token.type === "doctype") {
      formatted += pad.repeat(indent) + token.value + "\n";
      continue;
    }

    if (token.type === "processing") {
      // Keep the XML declaration flush at the top without indentation.
      formatted += token.value + "\n";
      continue;
    }

    if (token.type === "tag") {
      const tag = token.value;
      const isClose = tag.startsWith("</");
      const isSelfClose = tag.endsWith("/>");

      if (isClose) {
        indent = Math.max(0, indent - 1);
        formatted += pad.repeat(indent) + tag + "\n";
      } else if (isSelfClose) {
        formatted += pad.repeat(indent) + tag + "\n";
      } else {
        formatted += pad.repeat(indent) + tag + "\n";
        indent += 1;
      }
    }
  }

  return formatted.trim();
}

function tokenizeXml(xml) {
  const tokens = [];
  let i = 0;

  while (i < xml.length) {
    const ch = xml[i];

    if (ch === "<") {
      if (xml.startsWith("<!--", i)) {
        const end = xml.indexOf("-->", i);
        if (end === -1) {
          tokens.push({ type: "comment", value: xml.slice(i) });
          break;
        }
        tokens.push({ type: "comment", value: xml.slice(i, end + 3) });
        i = end + 3;
        continue;
      }

      if (xml.startsWith("<![CDATA[", i)) {
        const end = xml.indexOf("]]>", i);
        if (end === -1) {
          tokens.push({ type: "cdata", value: xml.slice(i) });
          break;
        }
        tokens.push({ type: "cdata", value: xml.slice(i, end + 3) });
        i = end + 3;
        continue;
      }

      if (xml.startsWith("<?", i)) {
        const end = xml.indexOf("?>", i);
        if (end === -1) {
          tokens.push({ type: "processing", value: xml.slice(i) });
          break;
        }
        tokens.push({ type: "processing", value: xml.slice(i, end + 2) });
        i = end + 2;
        continue;
      }

      if (xml.startsWith("<!", i)) {
        const end = xml.indexOf(">", i);
        if (end === -1) {
          tokens.push({ type: "doctype", value: xml.slice(i) });
          break;
        }
        tokens.push({ type: "doctype", value: xml.slice(i, end + 1) });
        i = end + 1;
        continue;
      }

      // Standard tag: find matching '>' outside of quoted attribute values.
      let j = i + 1;
      let quote = null;
      while (j < xml.length) {
        const c = xml[j];
        if (quote) {
          if (c === quote) quote = null;
        } else if (c === '"' || c === "'") {
          quote = c;
        } else if (c === ">") {
          break;
        }
        j += 1;
      }
      tokens.push({ type: "tag", value: xml.slice(i, j + 1) });
      i = j + 1;
      continue;
    }

    // Text node: everything up to the next '<'.
    const start = i;
    while (i < xml.length && xml[i] !== "<") {
      i += 1;
    }
    tokens.push({ type: "text", value: xml.slice(start, i) });
  }

  return tokens;
}
