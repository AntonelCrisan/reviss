"use client";

import { useCallback, useEffect, useState } from "react";
import { AccountStaticShell } from "@/components/account/account-static-shell";
import {
  getAdminPlanTranslations,
  updateAdminPlanTranslations,
  type PlanTranslationEntry,
} from "@/lib/plans-api";
import { toast } from "@/lib/toast-store";

/** Romanian is the source text, edited in the plan editor itself. */
const TRANSLATABLE_LOCALES = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
] as const;

type LocaleCode = (typeof TRANSLATABLE_LOCALES)[number]["code"];

type PlanField = {
  key: keyof PlanTranslationEntry;
  sourceKey: keyof PlanTranslationEntry;
  label: string;
  multiline: boolean;
};

const PLAN_FIELDS: PlanField[] = [
  { key: "name", sourceKey: "source_name", label: "Nume", multiline: false },
  {
    key: "description",
    sourceKey: "source_description",
    label: "Descriere",
    multiline: true,
  },
  {
    key: "material_limit",
    sourceKey: "source_material_limit",
    label: "Limită materiale",
    multiline: true,
  },
  {
    key: "ai_level",
    sourceKey: "source_ai_level",
    label: "Nivel AI",
    multiline: true,
  },
  {
    key: "storage",
    sourceKey: "source_storage",
    label: "Stocare",
    multiline: true,
  },
  {
    key: "conditions",
    sourceKey: "source_conditions",
    label: "Condiții",
    multiline: true,
  },
  { key: "badge", sourceKey: "source_badge", label: "Etichetă", multiline: false },
  {
    key: "discount_label",
    sourceKey: "source_discount_label",
    label: "Text reducere",
    multiline: false,
  },
];

function FieldRow({
  field,
  entry,
  onChange,
}: {
  field: PlanField;
  entry: PlanTranslationEntry;
  onChange: (key: keyof PlanTranslationEntry, value: string) => void;
}) {
  const source = entry[field.sourceKey];
  const sourceText = typeof source === "string" ? source : "";
  const value = entry[field.key];
  const text = typeof value === "string" ? value : "";

  return (
    <div className="grid gap-3 border-t border-subtle py-4 lg:grid-cols-2 lg:gap-6">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted">
          {field.label} — română
        </p>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted">
          {sourceText || "—"}
        </p>
      </div>
      <label className="block">
        <span className="text-[10px] font-black uppercase tracking-[0.16em] text-muted">
          Traducere
        </span>
        {field.multiline ? (
          <textarea
            value={text}
            rows={3}
            onChange={(event) => onChange(field.key, event.target.value)}
            placeholder="Lasă gol pentru a folosi textul în română"
            className="mt-2 w-full rounded-md border border-subtle bg-app px-4 py-3 text-sm leading-6 text-content"
          />
        ) : (
          <input
            type="text"
            value={text}
            onChange={(event) => onChange(field.key, event.target.value)}
            placeholder="Lasă gol pentru a folosi textul în română"
            className="mt-2 w-full rounded-md border border-subtle bg-app px-4 py-3 text-sm font-semibold text-content"
          />
        )}
      </label>
    </div>
  );
}

export function AdminPlanTranslationsPage() {
  const [locale, setLocale] = useState<LocaleCode>("en");
  const [plans, setPlans] = useState<PlanTranslationEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    getAdminPlanTranslations(locale)
      .then((result) => {
        if (!isMounted) return;
        setPlans(result.plans);
      })
      .catch((cause: unknown) => {
        if (!isMounted) return;
        toast.error(
          cause instanceof Error
            ? cause.message
            : "Traducerile nu au putut fi încărcate.",
        );
      })
      .finally(() => {
        if (!isMounted) return;
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [locale]);

  const updateField = useCallback(
    (planId: string, key: keyof PlanTranslationEntry, value: string) => {
      setPlans((current) =>
        current.map((plan) =>
          plan.plan_id === planId ? { ...plan, [key]: value } : plan,
        ),
      );
    },
    [],
  );

  const updateFeature = useCallback(
    (planId: string, featureId: string, value: string) => {
      setPlans((current) =>
        current.map((plan) =>
          plan.plan_id === planId
            ? {
                ...plan,
                features: plan.features.map((feature) =>
                  feature.feature_id === featureId
                    ? { ...feature, label: value }
                    : feature,
                ),
              }
            : plan,
        ),
      );
    },
    [],
  );

  async function save() {
    if (isSaving) return;

    setIsSaving(true);
    try {
      const result = await updateAdminPlanTranslations(locale, plans);
      setPlans(result.plans);
      toast.success("Traducerile au fost salvate.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Traducerile nu au putut fi salvate.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AccountStaticShell activePage="admin-settings">
      <section className="space-y-7">
        <div className="flex flex-col gap-5 border-b border-subtle pb-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="inline-flex rounded-md border border-subtle bg-action-soft px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted">
              Traduceri planuri
            </p>
            <h1 className="mt-4 font-serif text-4xl font-semibold leading-tight text-content">
              Textele planurilor pe limbi
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              Româna e versiunea sursă și se editează în pagina de planuri. Un
              câmp lăsat gol aici afișează automat textul în română, deci poți
              traduce pe bucăți fără să strici pagina de prețuri.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {TRANSLATABLE_LOCALES.map((item) => (
              <button
                key={item.code}
                type="button"
                onClick={() => setLocale(item.code)}
                disabled={isSaving}
                className={`rounded-md border px-4 py-2 text-sm font-bold transition disabled:opacity-60 ${
                  locale === item.code
                    ? "border-transparent bg-action text-on-action"
                    : "border-subtle hover:bg-surface-hover"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted">Se încarcă traducerile...</p>
        ) : (
          <>
            {plans.map((plan) => (
              <section
                key={plan.plan_id}
                className="rounded-xl border border-subtle bg-surface p-5"
              >
                <h2 className="text-xs font-black uppercase tracking-[0.18em] text-muted">
                  {plan.source_name} · {plan.plan_slug}
                </h2>

                {PLAN_FIELDS.map((field) => (
                  <FieldRow
                    key={String(field.key)}
                    field={field}
                    entry={plan}
                    onChange={(key, value) =>
                      updateField(plan.plan_id, key, value)
                    }
                  />
                ))}

                {plan.features.length > 0 ? (
                  <>
                    <p className="mt-6 text-[10px] font-black uppercase tracking-[0.16em] text-muted">
                      Beneficii
                    </p>
                    {plan.features.map((feature) => (
                      <div
                        key={feature.feature_id}
                        className="grid gap-3 border-t border-subtle py-4 lg:grid-cols-2 lg:gap-6"
                      >
                        <p className="text-sm leading-6 text-muted">
                          {feature.source_label}
                        </p>
                        <input
                          type="text"
                          value={feature.label}
                          onChange={(event) =>
                            updateFeature(
                              plan.plan_id,
                              feature.feature_id,
                              event.target.value,
                            )
                          }
                          placeholder="Lasă gol pentru textul în română"
                          className="w-full rounded-md border border-subtle bg-app px-4 py-3 text-sm text-content"
                        />
                      </div>
                    ))}
                  </>
                ) : null}
              </section>
            ))}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void save()}
                disabled={isSaving}
                className="rounded-md bg-action px-6 py-3 text-sm font-bold text-on-action transition hover:bg-action-hover disabled:cursor-wait disabled:opacity-60"
              >
                {isSaving ? "Se salvează..." : "Salvează traducerile"}
              </button>
            </div>
          </>
        )}
      </section>
    </AccountStaticShell>
  );
}
