"use client";

import React from "react";
import { useFeatureFlags } from "@/contexts/FeatureFlagsContext";

export function FeatureGate({
  flagKey,
  defaultEnabled = true,
  mode = "inline",
  title,
  children,
}: {
  flagKey: string;
  defaultEnabled?: boolean;
  mode?: "inline" | "page";
  title?: string;
  children: React.ReactNode;
}) {
  const { isEnabled, isHidden, getComingSoonLabel } = useFeatureFlags();
  const hidden = isHidden(flagKey, false);
  const enabled = isEnabled(flagKey, defaultEnabled);

  if (enabled) return <>{children}</>;

  if (hidden) {
    if (mode === "page") {
      return (
        <div className="min-h-[60vh] flex items-center justify-center px-6">
          <div className="w-full max-w-xl bg-white border border-slate-200 rounded-xl p-6">
            <div className="mt-2 text-lg font-semibold text-slate-900">
              {title || "Pagina niet gevonden"}
            </div>
            <p className="mt-2 text-slate-600">
              Deze pagina is niet beschikbaar.
            </p>
          </div>
        </div>
      );
    }

    return null;
  }

  const label = getComingSoonLabel(flagKey);

  if (mode === "page") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6">
        <div className="w-full max-w-xl bg-white border border-slate-200 rounded-xl p-6">
          <div className="text-sm font-medium text-slate-500">{label}</div>
          <div className="mt-2 text-lg font-semibold text-slate-900">
            {title || "Deze pagina is nog niet beschikbaar"}
          </div>
          <p className="mt-2 text-slate-600">
            Deze feature staat wel zichtbaar, maar is nog in ontwikkeling.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="opacity-60 pointer-events-none">
      {children}
    </div>
  );
}
