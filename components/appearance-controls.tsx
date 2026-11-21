"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { Eye, EyeOff, Moon, Sun } from "lucide-react";

const COLOR_MODE_KEY = "aws-control-center.color-mode";
const ACCOUNT_DETAILS_KEY = "aws-control-center.account-details";

type ColorMode = "light" | "dark";

function storedColorMode(): ColorMode | undefined {
  const value = localStorage.getItem(COLOR_MODE_KEY);
  return value === "light" || value === "dark" ? value : undefined;
}

export function AppearanceControls() {
  const privacyButton = useRef<HTMLButtonElement>(null);
  const colorModeButton = useRef<HTMLButtonElement>(null);

  function applyPrivacy(hidden: boolean) {
    const root = document.documentElement;
    if (hidden) root.dataset.accountDetails = "hidden";
    else delete root.dataset.accountDetails;
    privacyButton.current?.setAttribute("aria-pressed", String(hidden));
    privacyButton.current?.setAttribute("aria-label", hidden ? "Show account and identity details" : "Hide account and identity details");
    privacyButton.current?.setAttribute("title", hidden ? "Show account and identity details" : "Hide account and identity details");
  }

  function applyColorMode(mode: ColorMode) {
    document.documentElement.dataset.colorMode = mode;
    colorModeButton.current?.setAttribute("aria-checked", String(mode === "dark"));
    colorModeButton.current?.setAttribute("aria-label", `Use ${mode === "dark" ? "light" : "dark"} mode`);
    colorModeButton.current?.setAttribute("title", `Use ${mode === "dark" ? "light" : "dark"} mode`);
  }

  useLayoutEffect(() => {
    const mode = storedColorMode();
    if (mode) applyColorMode(mode);
    applyPrivacy(localStorage.getItem(ACCOUNT_DETAILS_KEY) === "hidden");
  }, []);

  // The split screen runs this app in an iframe. Storage events reach the other pane when one toggles.
  useEffect(() => {
    const sync = () => {
      const mode = storedColorMode();
      if (mode) applyColorMode(mode);
      applyPrivacy(localStorage.getItem(ACCOUNT_DETAILS_KEY) === "hidden");
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  function togglePrivacy() {
    const hidden = document.documentElement.dataset.accountDetails !== "hidden";
    localStorage.setItem(ACCOUNT_DETAILS_KEY, hidden ? "hidden" : "visible");
    applyPrivacy(hidden);
  }

  function toggleColorMode() {
    const current = storedColorMode() ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    localStorage.setItem(COLOR_MODE_KEY, next);
    applyColorMode(next);
  }

  return (
    <>
      <button
        ref={privacyButton}
        type="button"
        className="title-icon-button privacy-toggle btn-icon"
        aria-label="Hide account and identity details"
        aria-pressed="false"
        title="Hide account and identity details"
        onClick={togglePrivacy}
      >
        <Eye className="privacy-visible-icon" size={16} aria-hidden />
        <EyeOff className="privacy-hidden-icon" size={16} aria-hidden />
      </button>
      <button
        ref={colorModeButton}
        type="button"
        role="switch"
        className="theme-switch btn-icon"
        aria-label="Use dark mode"
        aria-checked="false"
        title="Use dark mode"
        onClick={toggleColorMode}
      >
        <Sun size={13} aria-hidden />
        <Moon size={13} aria-hidden />
        <span className="theme-switch-thumb" aria-hidden />
      </button>
    </>
  );
}
