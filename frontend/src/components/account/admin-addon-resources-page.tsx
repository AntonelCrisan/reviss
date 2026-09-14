"use client";
import { Select } from "@/components/ui/select";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AccountStaticShell } from "@/components/account/account-static-shell";
import {
  getAdminAddonResources,
  updateAdminAddonResources,
  type AddonResourceKey,
  type AdminAddonResource,
} from "@/lib/addons-api";
import { toast } from "@/lib/toast-store";

type Draft = AdminAddonResource;

/** Must match the keys the backend knows how to top up. */
const RESOURCE_OPTIONS: Array<{ key: AddonResourceKey; label: string }> = [
  { key: "ai_credits", label: "Credite AI" },
  { key: "ocr_pages", label: "Pagini OCR" },
  { key: "projects", label: "Proiecte" },
  { key: "materials", label: "Materiale" },
  { key: "pages", label: "Pagini procesate" },
];

function emptyDraft(sortOrder: number): Draft {
  return {
    id: "",
    resource_key: "ai_credits",
    name: "Credite AI",
    unit_label: "credite",
    description: "",
    unit_price_ron: 1,
    stripe_product_id: null,
    stripe_price_id: null,
    min_quantity: 10,
    max_quantity: 500,
    step: 10,
    is_visible: true,
    sort_order: sortOrder,
    is_purchasable: false,
  };
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-[0.16em] text-muted">
        {label}
      </span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-11 w-full rounded-md border border-subtle bg-app px-4 text-sm text-content"
      />
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

/**
 * A number field you can actually type into.
 *
 * The text is held here rather than derived from the number on every
 * keystroke: parsing as you go turns "2." into 2 and "" into 0, so a decimal
 * price could never be typed and a cleared box refilled itself with a zero.
 * The parsed value is reported upward; the text is left alone until the field
 * is.
 */
function NumberField({
  label,
  value,
  onChange,
  decimals = false,
  hint,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  decimals?: boolean;
  hint?: string;
}) {
  const [text, setText] = useState(String(value));
  const [lastValue, setLastValue] = useState(value);

  // Follow the prop when it changes from outside - after a save, say - but
  // never while the text already means the same number, which would fight the
  // person typing. Reconciling during render rather than in an effect avoids
  // the extra pass, and is what React recommends for state derived from props.
  if (value !== lastValue) {
    setLastValue(value);
    if (Number(text.replace(",", ".")) !== value) {
      setText(String(value));
    }
  }

  const pattern = decimals ? /^\d*[.,]?\d*$/ : /^\d*$/;

  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-[0.16em] text-muted">
        {label}
      </span>
      <input
        type="text"
        inputMode={decimals ? "decimal" : "numeric"}
        value={text}
        onChange={(event) => {
          const next = event.target.value;
          if (!pattern.test(next)) {
            return;
          }
          setText(next);
          const parsed = Number(next.replace(",", "."));
          if (Number.isFinite(parsed)) {
            onChange(parsed);
          }
        }}
        onBlur={() => {
          const parsed = Number(text.replace(",", "."));
          const safe = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
          setText(String(safe));
          onChange(safe);
        }}
        className="no-spinner mt-2 h-11 w-full rounded-md border border-subtle bg-app px-4 text-sm font-semibold text-content"
      />
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function AdminAddonResourcesPage() {
  const [resources, setResources] = useState<Draft[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    getAdminAddonResources()
      .then((result) => {
        if (!isMounted) return;
        setResources(result.map((resource) => ({ ...resource })));
      })
      .catch((cause: unknown) => {
        if (!isMounted) return;
        toast.error(
          cause instanceof Error
            ? cause.message
            : "Resursele nu au putut fi încărcate.",
        );
      })
      .finally(() => {
        if (!isMounted) return;
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  function update(index: number, patch: Partial<Draft>) {
    setResources((current) =>
      current.map((resource, i) =>
        i === index ? { ...resource, ...patch } : resource,
      ),
    );
  }

  async function save() {
    if (isSaving) return;

    const brokenMinimum = resources.find(
      (resource) => resource.min_quantity % resource.step !== 0,
    );
    if (brokenMinimum) {
      toast.error(
        `Minimul pentru „${brokenMinimum.name}” trebuie să fie multiplu al pasului.`,
      );
      return;
    }

    const brokenRange = resources.find(
      (resource) => resource.max_quantity < resource.min_quantity,
    );
    if (brokenRange) {
      toast.error(`Maximul pentru „${brokenRange.name}” e sub minim.`);
      return;
    }

    setIsSaving(true);
    try {
      const result = await updateAdminAddonResources(
        resources.map((resource) => {
          // is_purchasable is derived from the Stripe price, so it is read-only.
          const { is_purchasable, ...rest } = resource;
          void is_purchasable;
          return {
            ...rest,
            // A blank id means a resource that does not exist yet.
            id: rest.id || (null as unknown as string),
          };
        }),
      );
      setResources(result.map((resource) => ({ ...resource })));
      toast.success("Resursele au fost salvate.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Resursele nu au putut fi salvate.",
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
            <Link
              href="/admin/settings"
              className="mb-5 flex w-fit items-center rounded-md border border-subtle bg-surface px-4 py-2 text-sm font-semibold text-muted transition hover:bg-surface-hover hover:text-content"
            >
              ← Setări admin
            </Link>
            <p className="inline-flex rounded-md border border-subtle bg-action-soft px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted">
              Capacitate la bucată
            </p>
            <h1 className="mt-4 font-serif text-4xl font-semibold leading-tight text-content">
              Ce se poate cumpăra separat
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">
              Utilizatorul alege cantitatea, iar Stripe înmulțește prețul unitar.
              Minimul există ca să nu cazi sub suma minimă acceptată de Stripe;
              maximul ține scara de prețuri intactă, ca un abonat să nu cumpere
              la nesfârșit în loc să treacă pe un plan superior.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setResources((current) => [...current, emptyDraft(current.length)])
            }
            disabled={isSaving}
            className="theme-shadow-action w-fit rounded-md bg-action px-5 py-3 text-sm font-bold text-on-action transition hover:bg-action-hover disabled:opacity-60"
          >
            + Resursă nouă
          </button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted">Se încarcă resursele...</p>
        ) : resources.length === 0 ? (
          <p className="rounded-xl border border-subtle bg-surface p-5 text-sm leading-6 text-muted">
            Nicio resursă definită. Adaugă una ca să apară în contul
            utilizatorilor plătitori.
          </p>
        ) : (
          resources.map((resource, index) => (
            <section
              key={resource.id || `nou-${index}`}
              className="rounded-xl border border-subtle bg-surface p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-subtle pb-4">
                <h2 className="text-xs font-black uppercase tracking-[0.18em] text-muted">
                  {resource.name || "Resursă nouă"}
                </h2>
                <div className="flex items-center gap-3">
                  {!resource.stripe_price_id ? (
                    <span className="rounded-md border border-warning-border bg-warning-soft px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-warning">
                      Fără preț Stripe
                    </span>
                  ) : null}
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-muted">
                    <input
                      type="checkbox"
                      checked={resource.is_visible}
                      onChange={(event) =>
                        update(index, { is_visible: event.target.checked })
                      }
                      className="h-4 w-4 accent-action"
                    />
                    Vizibil
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setResources((current) =>
                        current.filter((_, i) => i !== index),
                      )
                    }
                    className="rounded-md border border-danger-border px-4 py-2 text-xs font-bold text-danger transition hover:bg-danger-soft"
                  >
                    Scoate
                  </button>
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-[0.16em] text-muted">
                    Resursă
                  </span>
                  <Select
                    value={resource.resource_key}
                    onChange={(next) =>
                      update(index, {
                        resource_key: next as AddonResourceKey,
                      })
                    }
                    options={RESOURCE_OPTIONS.map((option) => ({
                      value: option.key,
                      label: option.label,
                    }))}
                    className="mt-2"
                    triggerClassName="h-11 px-4 text-sm font-semibold"
                    aria-label="Tipul resursei"
                  />
                </label>
                <TextField
                  label="Nume afișat"
                  value={resource.name}
                  placeholder="Credite AI"
                  onChange={(value) => update(index, { name: value })}
                />
                <TextField
                  label="Unitate"
                  value={resource.unit_label}
                  placeholder="credite"
                  hint="Apare în „minim 10 credite”."
                  onChange={(value) => update(index, { unit_label: value })}
                />
                <NumberField
                  label="Preț unitar (RON)"
                  value={Number(resource.unit_price_ron)}
                  decimals
                  hint="Trebuie să fie identic cu prețul din Stripe."
                  onChange={(value) => update(index, { unit_price_ron: value })}
                />
                <TextField
                  label="Stripe product ID"
                  value={resource.stripe_product_id ?? ""}
                  placeholder="prod_..."
                  onChange={(value) =>
                    update(index, { stripe_product_id: value || null })
                  }
                />
                <TextField
                  label="Stripe price ID"
                  value={resource.stripe_price_id ?? ""}
                  placeholder="price_..."
                  hint="Prețul per unitate în Stripe. Cantitatea o trimite aplicația."
                  onChange={(value) =>
                    update(index, { stripe_price_id: value || null })
                  }
                />
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <NumberField
                  label="Minim"
                  value={resource.min_quantity}
                  hint="Sub suma minimă Stripe, plata eșuează."
                  onChange={(value) => update(index, { min_quantity: value })}
                />
                <NumberField
                  label="Maxim"
                  value={resource.max_quantity}
                  onChange={(value) => update(index, { max_quantity: value })}
                />
                <NumberField
                  label="Pas"
                  value={resource.step}
                  onChange={(value) => update(index, { step: value })}
                />
              </div>

              {resource.min_quantity > 0 && resource.step > 0 ? (
                <p className="mt-3 text-xs text-muted">
                  Comanda minimă:{" "}
                  <strong className="text-content">
                    {(
                      resource.min_quantity * Number(resource.unit_price_ron)
                    ).toFixed(2)}{" "}
                    RON
                  </strong>{" "}
                  ({resource.min_quantity} {resource.unit_label})
                  {resource.min_quantity % resource.step !== 0
                    ? " — minimul nu e multiplu al pasului"
                    : ""}
                </p>
              ) : null}
            </section>
          ))
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void save()}
            disabled={isSaving || isLoading}
            className="rounded-md bg-action px-6 py-3 text-sm font-bold text-on-action transition hover:bg-action-hover disabled:cursor-wait disabled:opacity-60"
          >
            {isSaving ? "Se salvează..." : "Salvează resursele"}
          </button>
        </div>
      </section>
    </AccountStaticShell>
  );
}
