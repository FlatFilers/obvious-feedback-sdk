import { describe, expect, it } from "bun:test";
import packageJson from "../../package.json";

describe("package contract", () => {
  it("keeps the SDK dependency-free at runtime", () => {
    expect("dependencies" in packageJson).toBe(false);
  });

  it("publishes only built artifacts through the documented entry points", () => {
    expect(packageJson.files).toEqual(["dist"]);
    expect(packageJson.main).toBe("dist/index.js");
    expect(packageJson.module).toBe("dist/index.js");
    expect(packageJson.types).toBe("dist/index.d.ts");
    expect(packageJson.unpkg).toBe("dist/index.global.js");
    expect(packageJson.jsdelivr).toBe("dist/index.global.js");
    expect(packageJson.exports["."]).toEqual({
      types: "./dist/index.d.ts",
      import: "./dist/index.js",
    });
    expect(packageJson.exports["./browser"]).toBe("./dist/index.global.js");
  });
});
