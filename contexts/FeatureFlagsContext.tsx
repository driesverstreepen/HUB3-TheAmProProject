"use client";

import React from "react";

export type FeatureFlag = {
  key: string;
  enabled: boolean;
  hidden?: boolean;
  coming_soon_label: string | null;
  updated_at?: string;
};

type FeatureFlagsState = {
  loading: boolean;
  flags: Record<string, FeatureFlag>;
  refresh: () => Promise<void>;
  isEnabled: (key: string, defaultEnabled?: boolean) => boolean;
  isHidden: (key: string, defaultHidden?: boolean) => boolean;
  getComingSoonLabel: (key: string, fallback?: string) => string;
  getOverride: (key: string) => boolean | undefined;
  setOverride: (key: string, value: boolean | undefined) => void;
};

const FeatureFlagsContext = React.createContext<FeatureFlagsState | null>(null);

async function fetchFlags(): Promise<FeatureFlag[]> {
  const res = await fetch("/api/feature-flags", { method: "GET" });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || "Failed to load feature flags");
  return Array.isArray(json?.flags) ? json.flags : [];
}

export function FeatureFlagsProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = React.useState(true);
  const [flags, setFlags] = React.useState<Record<string, FeatureFlag>>({});
  const [overrides, setOverrides] = React.useState<Record<string, boolean>>({});

  const overridesStorageKey = "hub3.featureFlagOverrides";

  React.useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(overridesStorageKey) : null;
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;

      const next: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof k === "string" && (typeof v === "boolean")) next[k] = v;
      }
      setOverrides(next);
    } catch {
      // Ignore malformed localStorage overrides.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(overridesStorageKey, JSON.stringify(overrides));
    } catch {
      // Ignore storage write failures.
    }
  }, [overrides]);

  const load = React.useCallback(async () => {
    try {
      const list = await fetchFlags();
      const map: Record<string, FeatureFlag> = {};
      for (const row of list) {
        if (row?.key) map[row.key] = row;
      }
      setFlags(map);
    } catch {
      // If flags can't be loaded (e.g., migration not deployed yet), keep defaults.
      setFlags({});
    }
  }, []);

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const isEnabled = React.useCallback(
    (key: string, defaultEnabled = true) => {
      if (Object.prototype.hasOwnProperty.call(overrides, key)) return overrides[key];
      const row = flags[key];
      if (!row) return defaultEnabled;
      return !!row.enabled;
    },
    [flags, overrides],
  );

  const isHidden = React.useCallback(
    (key: string, defaultHidden = false) => {
      const row = flags[key];
      if (!row) return defaultHidden;
      return !!row.hidden;
    },
    [flags],
  );

  const getComingSoonLabel = React.useCallback(
    (key: string, fallback = "Coming soon") => {
      const row = flags[key];
      const label = row?.coming_soon_label;
      return (typeof label === "string" && label.trim().length > 0) ? label.trim() : fallback;
    },
    [flags],
  );

  const getOverride = React.useCallback(
    (key: string) => overrides[key],
    [overrides],
  );

  const setOverride = React.useCallback((key: string, value: boolean | undefined) => {
    setOverrides(prev => {
      const next = { ...prev };
      if (typeof value === "boolean") next[key] = value;
      else delete next[key];
      return next;
    });
  }, []);

  const value: FeatureFlagsState = React.useMemo(
    () => ({
      loading,
      flags,
      refresh: load,
      isEnabled,
      isHidden,
      getComingSoonLabel,
      getOverride,
      setOverride,
    }),
    [flags, isEnabled, isHidden, load, loading, getComingSoonLabel, getOverride, setOverride],
  );

  return (
    <FeatureFlagsContext.Provider value={value}>
      {children}
    </FeatureFlagsContext.Provider>
  );
}

export function useFeatureFlags() {
  const ctx = React.useContext(FeatureFlagsContext);
  if (!ctx) {
    throw new Error("useFeatureFlags must be used within FeatureFlagsProvider");
  }
  return ctx;
}
