import { MAX_LOG_ENTRIES, MAX_NETWORK_ENTRIES } from "../constants";
import { truncateText } from "../utils/html";
import { redactUrl } from "../utils/url";

export interface ConsoleLogEntry {
  level: "log" | "info" | "warn" | "error";
  message: string;
  timestamp: string;
}

export interface NetworkLogEntry {
  method: string;
  url: string;
  status: number | null;
  durationMs: number;
  timestamp: string;
}

export function createConsoleBuffer(): {
  read: () => ConsoleLogEntry[];
  restore: () => void;
} {
  const entries: ConsoleLogEntry[] = [];
  const originals = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };

  function capture(level: ConsoleLogEntry["level"], args: unknown[]): void {
    entries.push({
      level,
      message: truncateText(args.map((arg) => String(arg)).join(" "), 500),
      timestamp: new Date().toISOString(),
    });
    if (entries.length > MAX_LOG_ENTRIES) {
      entries.shift();
    }
  }

  console.log = (...args: unknown[]) => {
    capture("log", args);
    originals.log(...args);
  };
  console.info = (...args: unknown[]) => {
    capture("info", args);
    originals.info(...args);
  };
  console.warn = (...args: unknown[]) => {
    capture("warn", args);
    originals.warn(...args);
  };
  console.error = (...args: unknown[]) => {
    capture("error", args);
    originals.error(...args);
  };

  return {
    read: () => [...entries],
    restore: () => {
      console.log = originals.log;
      console.info = originals.info;
      console.warn = originals.warn;
      console.error = originals.error;
    },
  };
}

export function createNetworkBuffer(): {
  read: () => NetworkLogEntry[];
  restore: () => void;
} {
  const entries: NetworkLogEntry[] = [];
  if (typeof window === "undefined" || typeof window.fetch !== "function") {
    return { read: () => [], restore: () => {} };
  }
  const originalFetch = window.fetch.bind(window);

  const wrappedFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const startedAt = Date.now();
    const method =
      init?.method ?? (input instanceof Request ? input.method : "GET");
    const url = input instanceof Request ? input.url : String(input);
    try {
      const response = await originalFetch(input, init);
      entries.push({
        method,
        url: redactUrl(url),
        status: response.status,
        durationMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      });
      if (entries.length > MAX_NETWORK_ENTRIES) {
        entries.shift();
      }
      return response;
    } catch (err) {
      entries.push({
        method,
        url: redactUrl(url),
        status: null,
        durationMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      });
      if (entries.length > MAX_NETWORK_ENTRIES) {
        entries.shift();
      }
      throw err;
    }
  };

  window.fetch = Object.assign(wrappedFetch, originalFetch);

  return {
    read: () => [...entries],
    restore: () => {
      window.fetch = originalFetch;
    },
  };
}
