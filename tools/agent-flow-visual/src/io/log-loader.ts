import { parseEventLog, type RawEvent } from "agent-flow-core";

export interface LogLoader {
  load(): Promise<RawEvent[]>;
}

export function createFileLogLoader(path: string): LogLoader {
  return {
    async load(): Promise<RawEvent[]> {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`Failed to load log: ${response.status} ${response.statusText}`);
      }
      const text = await response.text();
      return parseEventLog(text);
    },
  };
}

export function createStaticLogLoader(text: string): LogLoader {
  return {
    async load(): Promise<RawEvent[]> {
      return parseEventLog(text);
    },
  };
}
