import { afterEach, describe, expect, it } from "bun:test";
import {
  buildObviousTokenManifestCatalog,
  parseManifestCandidates,
} from "../../src/widget/obvious-token-manifest";

const SAMPLE_MARKDOWN = `
# Dashboard Design Tokens

## Color tokens

### Surfaces

| Use case | Preferred class | Notes |
|---|---|---|
| Default card | \`bg-surface-primary\` | Main panel. |
| Hover fill | \`hover:bg-surface-hover\` | Interaction state. |

### Text

| Use case | Preferred class | Notes |
|---|---|---|
| Primary labels | \`text-text-primary\` | Main text. |
| Secondary labels | \`text-text-secondary\` | Supporting text. |

## Spacing, sizing, and radius

### Spacing

The app commonly uses \`gap-2\`, \`gap-3\`, \`p-4\`, and \`p-5\`.

### Row height tokens

| Token | Value |
|---|---:|
| \`--spacing-row-md\` | \`32px\` |

### Radius

| Token | Value formula |
|---|---|
| \`rounded-md\` | \`calc(var(--radius) - 2px)\` |
| \`rounded-lg\` | \`var(--radius)\` |

## Typography

| Utility | Use |
|---|---|
| \`text-heading-lg\` | Standard section headings. |

## Avoid by default

| Avoid | Use instead |
|---|---|
| \`bg-white\` | \`bg-surface-primary\` |
`;

describe("obvious token manifest parser", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    document.head.innerHTML = "";
    const rootStyle = document.documentElement.style;
    for (let i = rootStyle.length - 1; i >= 0; i -= 1) {
      const prop = rootStyle.item(i);
      if (prop?.startsWith("--")) {
        rootStyle.removeProperty(prop);
      }
    }
  });

  it("extracts documented tokens and skips interaction/avoid tokens", () => {
    const candidates = parseManifestCandidates(SAMPLE_MARKDOWN);
    const names = candidates.map((candidate) => candidate.token);

    expect(names).toContain("bg-surface-primary");
    expect(names).toContain("text-text-primary");
    expect(names).toContain("gap-2");
    expect(names).toContain("p-4");
    expect(names).toContain("rounded-lg");
    expect(names).toContain("text-heading-lg");
    expect(names).not.toContain("hover:bg-surface-hover");
    expect(names).not.toContain("bg-white");
  });

  it("resolves Tailwind classes and CSS variables into catalog tokens", () => {
    document.documentElement.style.setProperty("--radius", "10px");
    document.documentElement.style.setProperty("--spacing-row-md", "32px");
    const style = document.createElement("style");
    style.textContent = `
      .bg-surface-primary { background-color: rgb(255, 255, 255); }
      .text-text-primary { color: rgb(10, 10, 10); }
      .text-text-secondary { color: rgb(80, 80, 80); }
      .gap-2 { gap: 8px; }
      .gap-3 { gap: 12px; }
      .p-4 { padding: 16px; }
      .p-5 { padding: 20px; }
      .rounded-md { border-radius: 8px; }
      .rounded-lg { border-radius: 10px; }
      .text-heading-lg { font-size: 20px; }
    `;
    document.head.appendChild(style);

    const catalog = buildObviousTokenManifestCatalog(SAMPLE_MARKDOWN);
    const tokenNames = catalog.tokens.map((token) => token.name);

    expect(tokenNames).toContain("bg-surface-primary");
    expect(tokenNames).toContain("text-text-primary");
    expect(tokenNames).toContain("p-4");
    expect(tokenNames).toContain("gap-3");
    expect(tokenNames).toContain("rounded-lg");
    expect(tokenNames).toContain("text-heading-lg");
    expect(tokenNames).toContain("--spacing-row-md");
    expect(
      catalog.tokens.find((token) => token.name === "p-4")?.applyValue,
    ).toBe("16px");
    expect(
      catalog.tokens.find((token) => token.name === "--spacing-row-md")
        ?.applyValue,
    ).toBe("var(--spacing-row-md)");
  });
});
