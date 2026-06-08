import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (typeof globalThis.window === "undefined") {
  GlobalRegistrator.register({ url: "http://localhost:3000/" });
}

if (typeof globalThis.CSS === "undefined") {
  Object.defineProperty(globalThis, "CSS", {
    value: {
      escape(value: string): string {
        return value.replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
      },
    },
    configurable: true,
  });
}
