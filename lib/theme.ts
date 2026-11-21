import "server-only";

export const THEMES = ["default", "apple", "win95", "win7", "wow"] as const;

export type AppTheme = (typeof THEMES)[number];

const supportedThemes = new Set<string>(THEMES);
const warnedValues = new Set<string>();

export function resolveTheme(value: string | undefined): AppTheme {
  const normalized = value?.trim().toLowerCase();
  return normalized && supportedThemes.has(normalized)
    ? (normalized as AppTheme)
    : "default";
}

export function getTheme(): AppTheme {
  const value = process.env.APP_THEME;
  const theme = resolveTheme(value);

  if (value?.trim() && theme === "default" && value.trim().toLowerCase() !== "default") {
    const invalidValue = value.trim();
    if (!warnedValues.has(invalidValue)) {
      warnedValues.add(invalidValue);
      console.warn(
        `Unsupported APP_THEME "${invalidValue}". Using "default". Expected one of: ${THEMES.join(", ")}.`,
      );
    }
  }

  return theme;
}

export function themeIcon(theme: AppTheme) {
  return `/themes/${theme}/icon.svg`;
}
