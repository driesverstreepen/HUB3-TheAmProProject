"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SuperAdminSidebar from "@/components/admin/SuperAdminSidebar";
import { supabase } from "@/lib/supabase";
import { useNotification } from "@/contexts/NotificationContext";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type FeatureFlagRow = {
  key: string;
  enabled: boolean;
  hidden?: boolean;
  coming_soon_label: string | null;
  updated_at?: string;
  updated_by?: string | null;
};

type FeatureFlagDraft = {
  key: string;
  enabled: boolean;
  hidden: boolean;
  coming_soon_label: string;
};

const DEFAULT_COMING_SOON_LABEL = "Coming soon";

function normalizeLabel(value: string | null | undefined) {
  const v = typeof value === "string" ? value.trim() : "";
  return v.length > 0 ? v : DEFAULT_COMING_SOON_LABEL;
}

const SUGGESTED_FLAGS: Array<{ key: string; label: string }> = [
  { key: "ui.bottom-nav", label: "UI: Bottom nav (mobile)" },
  { key: "ui.floating-feedback", label: "UI: Floating feedback button" },
  { key: "welcome.home", label: "Welcome: Home (/)" },
  { key: "welcome.pricing", label: "Welcome: Pricing" },
  { key: "welcome.for-studios", label: "Welcome: For studios" },
  { key: "welcome.studios", label: "Welcome: Studios" },
  { key: "welcome.programmas", label: "Welcome: Programma's" },
  { key: "studio.programs", label: "Studio: Programma's" },
  { key: "studio.dashboard", label: "Studio: Dashboard" },
  { key: "studio.lessons", label: "Studio: Lessen" },
  { key: "studio.attendance", label: "Studio: Aanwezigheden" },
  { key: "studio.replacements", label: "Studio: Vervangingen" },
  { key: "studio.class-passes", label: "Studio: Class Passes" },
  { key: "studio.members", label: "Studio: Leden" },
  { key: "studio.notes", label: "Studio: Notes" },
  { key: "studio.emails", label: "Studio: E-mails" },
  { key: "studio.finance", label: "Studio: Finance (timesheets + payrolls)" },
  { key: "studio.evaluations", label: "Studio: Evaluaties" },
  { key: "studio.settings", label: "Studio: Instellingen" },
  { key: "studio.profile", label: "Studio: Profiel" },
  { key: "studio.public-profile", label: "Studio: Publiek profiel (editor)" },
  { key: "studio.public", label: "Studio: Publieke pagina (admin view)" },
  { key: "studio.legal-documents", label: "Studio: Legal documents" },
  { key: "studio.stripe", label: "Studio: Stripe" },
  { key: "user.dashboard", label: "User: Dashboard" },
  { key: "user.profile", label: "User: Profiel" },
  { key: "teacher.dashboard", label: "Teacher: Dashboard" },
];

export default function SuperAdminFeatureFlagsPage() {
  const router = useRouter();
  const { showSuccess, showError } = useNotification();

  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [persistedByKey, setPersistedByKey] = useState<Record<string, FeatureFlagRow>>({});
  const [draftByKey, setDraftByKey] = useState<Record<string, FeatureFlagDraft>>({});
  const [savingAll, setSavingAll] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push("/auth/login");
          return;
        }

        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "super_admin")
          .single();

        if (!roleData) {
          router.push("/");
          return;
        }

        setIsSuperAdmin(true);
        await loadFlags();
      } catch (e) {
        console.error("Error checking super admin access", e);
        router.push("/");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadFlags = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;

    const resp = await fetch("/api/super-admin/feature-flags", {
      method: "GET",
      credentials: "include",
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    });

    const json = await resp.json().catch(() => ({} as any));

    if (resp.status === 401) {
      showError("Je sessie is verlopen. Log opnieuw in.");
      router.push("/auth/login");
      return;
    }

    if (resp.status === 403) {
      showError("Geen toegang (super admin vereist).");
      router.push("/");
      return;
    }

    if (!resp.ok) {
      throw new Error(json?.error || "Failed to load flags");
    }

    const list: FeatureFlagRow[] = Array.isArray(json?.flags) ? json.flags : [];

    const persistedMap: Record<string, FeatureFlagRow> = {};
    for (const row of list) {
      if (row?.key) persistedMap[row.key] = row;
    }
    setPersistedByKey(persistedMap);

    const suggestedKeys = new Set(SUGGESTED_FLAGS.map((s) => s.key));
    const unionKeys = new Set<string>([...Object.keys(persistedMap), ...Array.from(suggestedKeys)]);
    const draftMap: Record<string, FeatureFlagDraft> = {};
    for (const key of unionKeys) {
      const persisted = persistedMap[key];
      draftMap[key] = {
        key,
        enabled: persisted ? !!persisted.enabled : true,
        hidden: persisted ? !!persisted.hidden : false,
        coming_soon_label: normalizeLabel(persisted?.coming_soon_label),
      };
    }
    setDraftByKey(draftMap);
  };

  const merged = useMemo(() => {
    return Object.values(draftByKey).sort((a, b) => a.key.localeCompare(b.key));
  }, [draftByKey]);

  const grouped = useMemo(() => {
    const byKey = new Map(merged.map((r) => [r.key, r] as const));

    const pagesWelcome: FeatureFlagDraft[] = [];
    const pagesUser: FeatureFlagDraft[] = [];
    const pagesStudio: FeatureFlagDraft[] = [];
    const pagesTeacher: FeatureFlagDraft[] = [];
    const pagesOther: FeatureFlagDraft[] = [];

    const componentsUI: FeatureFlagDraft[] = [];
    const componentsOther: FeatureFlagDraft[] = [];

    for (const row of byKey.values()) {
      const key = row.key;
      if (key.startsWith('ui.')) {
        componentsUI.push(row);
        continue;
      }

      if (key.startsWith('welcome.')) {
        pagesWelcome.push(row);
        continue;
      }
      if (key.startsWith('user.')) {
        pagesUser.push(row);
        continue;
      }
      if (key.startsWith('studio.')) {
        pagesStudio.push(row);
        continue;
      }
      if (key.startsWith('teacher.')) {
        pagesTeacher.push(row);
        continue;
      }

      // Remaining flags: treat as pages by default (hub.*, admin.*, etc.)
      if (key.includes('.')) {
        pagesOther.push(row);
      } else {
        componentsOther.push(row);
      }
    }

    const sort = (list: FeatureFlagDraft[]) => list.sort((a, b) => a.key.localeCompare(b.key));
    return {
      pages: {
        welcome: sort(pagesWelcome),
        user: sort(pagesUser),
        studio: sort(pagesStudio),
        teacher: sort(pagesTeacher),
        other: sort(pagesOther),
      },
      components: {
        ui: sort(componentsUI),
        other: sort(componentsOther),
      },
    };
  }, [merged]);

  const renderRows = (list: FeatureFlagDraft[]) => {
    return list.map((row) => {
      const isPersisted = !!persistedByKey[row.key];
      const dirty = isDirty(row.key);

      return (
        <div key={row.key} className="p-4">
          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className="font-mono text-sm text-slate-900 truncate">{row.key}</div>
                {!isPersisted ? (
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">default</span>
                ) : null}
                {dirty ? (
                  <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200">gewijzigd</span>
                ) : null}
              </div>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Coming soon label</label>
                  <input
                    value={row.coming_soon_label}
                    onChange={(e) => updateDraft(row.key, { coming_soon_label: e.target.value })}
                    disabled={row.hidden}
                    className={
                      row.hidden
                        ? "w-full h-10 px-4 border border-slate-200 rounded-lg bg-slate-100 text-slate-500 cursor-not-allowed"
                        : "w-full h-10 px-4 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    }
                    placeholder={DEFAULT_COMING_SOON_LABEL}
                  />
                </div>
                <div className="flex items-end">
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="inline-flex items-center gap-2 text-sm text-slate-700 select-none">
                      <input
                        type="checkbox"
                        checked={row.enabled}
                        disabled={row.hidden}
                        onChange={(e) => updateDraft(row.key, { enabled: e.target.checked })}
                        className="h-4 w-4"
                      />
                      Enabled
                    </label>
                    <label className="inline-flex items-center gap-2 text-sm text-slate-700 select-none">
                      <input
                        type="checkbox"
                        checked={row.hidden}
                        onChange={(e) =>
                          updateDraft(row.key, {
                            hidden: e.target.checked,
                            enabled: e.target.checked ? false : row.enabled,
                          })
                        }
                        className="h-4 w-4"
                      />
                      Hidden
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    });
  };

  const isDirty = (key: string) => {
    const draft = draftByKey[key];
    if (!draft) return false;

    const persisted = persistedByKey[key];
    const baselineEnabled = persisted ? !!persisted.enabled : true;
    const baselineHidden = persisted ? !!persisted.hidden : false;
    const baselineLabel = normalizeLabel(persisted?.coming_soon_label);

    return (
      draft.enabled !== baselineEnabled ||
      draft.hidden !== baselineHidden ||
      normalizeLabel(draft.coming_soon_label) !== baselineLabel
    );
  };

  const dirtyKeys = useMemo(() => {
    return Object.keys(draftByKey).filter((k) => isDirty(k));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftByKey, persistedByKey]);

  const updateDraft = (key: string, patch: Partial<FeatureFlagDraft>) => {
    setDraftByKey((prev) => {
      const existing = prev[key];
      if (!existing) return prev;
      return { ...prev, [key]: { ...existing, ...patch } };
    });
  };

  const saveAll = async () => {
    try {
      if (dirtyKeys.length === 0) {
        showSuccess("Geen wijzigingen");
        return;
      }

      setSavingAll(true);

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      for (const key of dirtyKeys) {
        const draft = draftByKey[key];
        if (!draft) continue;

        const resp = await fetch("/api/super-admin/feature-flags", {
          method: "PUT",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({
            key: draft.key,
            enabled: !!draft.enabled,
            hidden: !!draft.hidden,
            coming_soon_label: normalizeLabel(draft.coming_soon_label),
          }),
        });

        const json = await resp.json().catch(() => ({} as any));

        if (resp.status === 401) {
          showError("Je sessie is verlopen. Log opnieuw in.");
          router.push("/auth/login");
          return;
        }

        if (resp.status === 403) {
          showError("Geen toegang (super admin vereist).");
          router.push("/");
          return;
        }

        if (!resp.ok) throw new Error(json?.error || "Failed to save flag");

        const saved: FeatureFlagRow | undefined = json?.flag;
        if (saved?.key) {
          setPersistedByKey((prev) => ({ ...prev, [saved.key]: saved }));
        }
      }

      showSuccess("Opgeslagen");
    } catch (e: any) {
      console.error("Error saving flags", e);
      showError(e?.message || "Opslaan mislukt");
    } finally {
      setSavingAll(false);
      // Re-sync drafts with persisted after save to clear dirty state.
      await loadFlags().catch(() => {});
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <LoadingSpinner size={48} label="Laden" indicatorClassName="border-b-purple-600" />
      </div>
    );
  }

  if (!isSuperAdmin) return null;

  return (
    <div className="min-h-screen bg-slate-50 overflow-x-auto">
      <SuperAdminSidebar />

      <div className="w-full min-w-0 sm:ml-64">
        <header className="bg-white border-b border-slate-200">
          <div className="px-4 sm:px-8 py-4 sm:py-6">
            <h1 className="text-2xl font-bold text-slate-900">Feature flags</h1>
            <p className="text-sm text-slate-600">Beheer pagina’s en component toggles (enabled/hidden + label).</p>
          </div>
        </header>

        <main className="px-4 sm:px-8 py-6 sm:py-8">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200">
            <div className="p-4 sm:p-6 border-b border-slate-200">
              <div className="text-sm text-slate-700">
                {dirtyKeys.length > 0 ? (
                  <span>
                    <span className="font-semibold">{dirtyKeys.length}</span> wijziging(en) niet opgeslagen
                  </span>
                ) : (
                  <span>Geen wijzigingen</span>
                )}
              </div>
            </div>

            <div className="divide-y divide-slate-200 pb-28">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                <div className="text-sm font-semibold text-slate-900">Pagina’s</div>
                <div className="text-xs text-slate-600 mt-0.5">
                  Welkom, User, Studio en Teacher pagina’s (plus overige pagina flags).
                </div>
              </div>

              {grouped.pages.welcome.length > 0 ? (
                <div>
                  <div className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white">Welcome</div>
                  <div className="divide-y divide-slate-200">{renderRows(grouped.pages.welcome)}</div>
                </div>
              ) : null}
              {grouped.pages.user.length > 0 ? (
                <div>
                  <div className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white">User</div>
                  <div className="divide-y divide-slate-200">{renderRows(grouped.pages.user)}</div>
                </div>
              ) : null}
              {grouped.pages.studio.length > 0 ? (
                <div>
                  <div className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white">Studio</div>
                  <div className="divide-y divide-slate-200">{renderRows(grouped.pages.studio)}</div>
                </div>
              ) : null}
              {grouped.pages.teacher.length > 0 ? (
                <div>
                  <div className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white">Teacher</div>
                  <div className="divide-y divide-slate-200">{renderRows(grouped.pages.teacher)}</div>
                </div>
              ) : null}
              {grouped.pages.other.length > 0 ? (
                <div>
                  <div className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white">Overige pagina’s</div>
                  <div className="divide-y divide-slate-200">{renderRows(grouped.pages.other)}</div>
                </div>
              ) : null}

              <div className="px-4 py-3 bg-slate-50 border-y border-slate-200">
                <div className="text-sm font-semibold text-slate-900">Componenten</div>
                <div className="text-xs text-slate-600 mt-0.5">
                  UI/component toggles die losstaan van een specifieke pagina.
                </div>
              </div>

              {grouped.components.ui.length > 0 ? (
                <div>
                  <div className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white">UI</div>
                  <div className="divide-y divide-slate-200">{renderRows(grouped.components.ui)}</div>
                </div>
              ) : null}
              {grouped.components.other.length > 0 ? (
                <div>
                  <div className="px-4 py-2 text-xs font-semibold text-slate-600 bg-white">Overige componenten</div>
                  <div className="divide-y divide-slate-200">{renderRows(grouped.components.other)}</div>
                </div>
              ) : null}
            </div>

            <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-slate-200 px-4 sm:px-6 py-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="text-sm text-slate-700">
                  {dirtyKeys.length > 0 ? (
                    <span>
                      <span className="font-semibold">{dirtyKeys.length}</span> wijziging(en) klaar om op te slaan
                    </span>
                  ) : (
                    <span>Alles is opgeslagen</span>
                  )}
                </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                  <button
                    onClick={() => loadFlags()}
                    disabled={savingAll}
                    className={
                      savingAll
                          ? "w-full sm:w-auto px-4 py-2 rounded-lg bg-slate-100 text-slate-400 text-sm font-medium cursor-not-allowed"
                          : "w-full sm:w-auto px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium"
                    }
                  >
                    Vernieuwen
                  </button>
                  <button
                    onClick={saveAll}
                    disabled={savingAll || dirtyKeys.length === 0}
                    className={
                      savingAll || dirtyKeys.length === 0
                          ? "w-full sm:w-auto px-4 py-2 rounded-lg bg-slate-200 text-slate-400 text-sm font-medium cursor-not-allowed"
                          : "w-full sm:w-auto px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium"
                    }
                  >
                    {savingAll ? "Opslaan…" : "Opslaan"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
