export type TypographyVariant =
    | "display"
    | "h1"
    | "h2"
    | "h3"
    | "h4"
    | "subtitle"
    | "body"
    | "bodySm"
    | "caption"
    | "label"
    | "button";

export type TypographyDevice = "mobile" | "desktop";

export type TypographyStyle = {
    size: string;
    color: string;
};

export type TypographyConfig = {
    mobile: Record<TypographyVariant, TypographyStyle>;
    desktop: Record<TypographyVariant, TypographyStyle>;
};

export const TYPOGRAPHY_VARIANTS: Array<
    { key: TypographyVariant; label: string }
> = [
    { key: "display", label: "Display" },
    { key: "h1", label: "Titel 1 (H1)" },
    { key: "h2", label: "Titel 2 (H2)" },
    { key: "h3", label: "Titel 3 (H3)" },
    { key: "h4", label: "Titel 4 (H4)" },
    { key: "subtitle", label: "Ondertitel" },
    { key: "body", label: "Paragraaf" },
    { key: "bodySm", label: "Paragraaf klein" },
    { key: "caption", label: "Caption" },
    { key: "label", label: "Label" },
    { key: "button", label: "Button" },
];

// Defaults chosen to match the most common Tailwind sizes/colors currently used.
// (Mobile + desktop start identical; you can diverge later in Super Admin.)
export const defaultTypographyConfig: TypographyConfig = {
    mobile: {
        display: { size: "2.25rem", color: "var(--typo-fg)" }, // ~text-4xl
        h1: { size: "1.875rem", color: "var(--typo-fg)" }, // ~text-3xl
        h2: { size: "1.5rem", color: "var(--typo-fg)" }, // ~text-2xl
        h3: { size: "1.25rem", color: "var(--typo-fg)" }, // ~text-xl
        h4: { size: "1.125rem", color: "var(--typo-fg)" }, // ~text-lg
        subtitle: { size: "0.875rem", color: "var(--typo-subtle)" }, // ~text-sm
        body: { size: "1rem", color: "var(--typo-fg)" }, // base
        bodySm: { size: "0.875rem", color: "var(--typo-subtle)" },
        caption: { size: "0.75rem", color: "var(--typo-subtle)" }, // ~text-xs
        label: { size: "0.875rem", color: "var(--typo-subtle)" },
        button: { size: "0.875rem", color: "var(--typo-fg)" },
    },
    desktop: {
        display: { size: "2.25rem", color: "var(--typo-fg)" },
        h1: { size: "1.875rem", color: "var(--typo-fg)" },
        h2: { size: "1.5rem", color: "var(--typo-fg)" },
        h3: { size: "1.25rem", color: "var(--typo-fg)" },
        h4: { size: "1.125rem", color: "var(--typo-fg)" },
        subtitle: { size: "0.875rem", color: "var(--typo-subtle)" },
        body: { size: "1rem", color: "var(--typo-fg)" },
        bodySm: { size: "0.875rem", color: "var(--typo-subtle)" },
        caption: { size: "0.75rem", color: "var(--typo-subtle)" },
        label: { size: "0.875rem", color: "var(--typo-subtle)" },
        button: { size: "0.875rem", color: "var(--typo-fg)" },
    },
};

export function isTypographyVariant(value: string): value is TypographyVariant {
    return (TYPOGRAPHY_VARIANTS as any[]).some((v) => v.key === value);
}

export function normalizeTypographyConfig(input: any): TypographyConfig {
    const out: TypographyConfig = JSON.parse(
        JSON.stringify(defaultTypographyConfig),
    );

    for (const device of ["mobile", "desktop"] as const) {
        const src = input?.[device];
        if (!src || typeof src !== "object") continue;

        for (const { key } of TYPOGRAPHY_VARIANTS) {
            const v = src?.[key];
            const size = typeof v?.size === "string" ? v.size.trim() : "";
            const color = typeof v?.color === "string" ? v.color.trim() : "";
            if (size) out[device][key].size = size;
            if (color) out[device][key].color = color;
        }
    }

    return out;
}

function cssEscapeIdent(value: string) {
    return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function typographyConfigToCss(config: TypographyConfig) {
    const mobile = config.mobile;
    const desktop = config.desktop;

    const buildBlock = (
        device: TypographyDevice,
        data: Record<TypographyVariant, TypographyStyle>,
    ) => {
        const entries: string[] = [];
        for (const { key } of TYPOGRAPHY_VARIANTS) {
            const varBase = `--typo-${cssEscapeIdent(key)}`;
            entries.push(`${varBase}-size: ${data[key].size};`);
            entries.push(`${varBase}-color: ${data[key].color};`);
        }
        return entries.join("");
    };

    const mobileVars = buildBlock("mobile", mobile);
    const desktopVars = buildBlock("desktop", desktop);

    // Desktop breakpoint aligned with Tailwind `lg`.
    return `:root{${mobileVars}}@media (min-width: 1024px){:root{${desktopVars}}}`;
}
