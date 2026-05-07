import { API_ROUTE_PREFIX, SECRET_QUERY_KEYS } from "../constants";
import { truncateText } from "./html";

export function redactUrl(rawUrl: string): string {
  try {
    const url = new URL(
      rawUrl,
      typeof window !== "undefined"
        ? window.location.origin
        : "https://example.invalid",
    );
    for (const key of Array.from(url.searchParams.keys())) {
      if (
        SECRET_QUERY_KEYS.has(key.toLowerCase()) ||
        /token|secret|password|key|code/i.test(key)
      ) {
        url.searchParams.set(key, "[REDACTED]");
      }
    }
    url.hash = "";
    return truncateText(url.toString(), 500);
  } catch {
    return truncateText(rawUrl.split("?")[0] ?? rawUrl, 500);
  }
}

export function createFeedbackApiUrl(apiBaseUrl: string, path: string): string {
  const normalizedBaseUrl = apiBaseUrl.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  // API_ROUTE_PREFIX includes the leading slash so this skips only a full `/prepare` path segment.
  const routePrefix = normalizedBaseUrl.endsWith(API_ROUTE_PREFIX)
    ? ""
    : API_ROUTE_PREFIX;
  return `${normalizedBaseUrl}${routePrefix}${normalizedPath}`;
}
