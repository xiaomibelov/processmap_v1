import type { ContourModel, RawEvent } from "agent-flow-core";

export interface ScannerClient {
  loadContours(): Promise<ContourModel[]>;
  loadArtifact(path: string): Promise<string>;
  loadDemoEvents(): Promise<RawEvent[]>;
}

export function createScannerClient(baseUrl = ""): ScannerClient {
  async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(`${baseUrl}${url}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<T>;
  }

  return {
    async loadContours(): Promise<ContourModel[]> {
      return fetchJson<ContourModel[]>("/api/contours");
    },
    async loadArtifact(path: string): Promise<string> {
      const encoded = encodeURIComponent(path);
      const response = await fetch(`${baseUrl}/api/artifact?path=${encoded}`);
      if (!response.ok) {
        throw new Error(`Failed to load artifact ${path}: ${response.status}`);
      }
      return response.text();
    },
    async loadDemoEvents(): Promise<RawEvent[]> {
      const response = await fetch(`${baseUrl}/api/demo`);
      if (!response.ok) {
        throw new Error(`Failed to load demo events: ${response.status}`);
      }
      const text = await response.text();
      const events: RawEvent[] = [];
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          events.push(JSON.parse(trimmed));
        } catch {
          // Skip malformed demo lines.
        }
      }
      return events;
    },
  };
}
