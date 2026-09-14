"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createAddonCheckoutSession,
  getAddonOffer,
  syncAddonCheckoutSession,
  type AddonOffer,
  type AddonResource,
  type AddonResourceKey,
} from "@/lib/addons-api";
import { toast } from "@/lib/toast-store";

type AccountAddonsButtonProps = {
  /** Lets the dashboard re-read usage once an order lands. */
  onPurchased?: () => void;
};

/** Every control in the configurator lines up on this height. */
const CONTROL_HEIGHT = "h-10";

/** A few one-click amounts, so nobody faces an empty stepper and has to think. */
function presetsFor(resource: AddonResource) {
  const { min_quantity: min, max_quantity: max, step } = resource;
  return [min, min * 2, min * 5]
    .map((value) => Math.round(value / step) * step)
    .filter((value, index, all) => value <= max && all.indexOf(value) === index);
}

/**
 * While typing, only the ceiling is enforced.
 *
 * Snapping to the step on every keystroke made the field impossible to use: at
 * a step of 10, typing "2" rounded straight back to 0 and cleared the box, so
 * 20 could never be reached one digit at a time.
 */
function clampWhileTyping(resource: AddonResource, value: number) {
  return Math.min(Math.max(Math.trunc(value), 0), resource.max_quantity);
}

/** Snap to a valid amount once the field is left alone. */
function snapToStep(resource: AddonResource, value: number) {
  if (value <= 0) {
    return 0;
  }
  const stepped = Math.round(value / resource.step) * resource.step;
  return Math.min(Math.max(stepped, resource.step), resource.max_quantity);
}

export function AccountAddonsButton({ onPurchased }: AccountAddonsButtonProps) {
  const t = useTranslations("dashboard");
  const [offer, setOffer] = useState<AddonOffer | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  // A Stripe return can be replayed by a refresh or the back button. Crediting
  // is idempotent server-side, but there is no point asking twice.
  const syncedSessionRef = useRef<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    getAddonOffer()
      .then((result) => {
        if (!isMounted) return;
        setOffer(result);
      })
      .catch(() => {
        // A missing offer is not worth interrupting the dashboard for: the
        // button simply does not render.
      });

    return () => {
      isMounted = false;
    };
  }, [reloadToken]);

  const refresh = useCallback(() => {
    setReloadToken((token) => token + 1);
    onPurchased?.();
  }, [onPurchased]);

  // Credit the order as soon as the browser comes back, rather than waiting
  // for the webhook and leaving the limits looking unchanged.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("addon") !== "success") {
      return;
    }

    const sessionId = params.get("session_id");
    if (!sessionId || syncedSessionRef.current === sessionId) {
      return;
    }
    syncedSessionRef.current = sessionId;

    syncAddonCheckoutSession(sessionId)
      .then((purchase) => {
        if (purchase) {
          toast.success(t("capacitateaAFostAdaugata"));
          refresh();
        }
      })
      .catch(() => {
        // The webhook is authoritative and will credit it regardless.
      })
      .finally(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete("addon");
        url.searchParams.delete("session_id");
        window.history.replaceState({}, "", url.toString());
      });
  }, [refresh, t]);

  const purchasable = offer?.resources.filter((item) => item.is_purchasable) ?? [];
  if (!offer?.can_purchase || purchasable.length === 0) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsModalOpen(true)}
        className="theme-shadow-action rounded-md bg-action px-5 py-3 text-sm font-bold text-on-action transition hover:bg-action-hover"
      >
        {t("adaugaExtra")}
      </button>

      {isModalOpen ? (
        <AddonConfigurator
          resources={purchasable}
          onCancel={() => setIsModalOpen(false)}
        />
      ) : null}
    </>
  );
}

function AddonConfigurator({
  resources,
  onCancel,
}: {
  resources: AddonResource[];
  onCancel: () => void;
}) {
  const t = useTranslations("dashboard");
  const [quantities, setQuantities] = useState<
    Partial<Record<AddonResourceKey, number>>
  >({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const total = useMemo(
    () =>
      resources.reduce((sum, resource) => {
        const quantity = quantities[resource.resource_key] ?? 0;
        return sum + quantity * Number(resource.unit_price_ron);
      }, 0),
    [quantities, resources],
  );

  const chosen = resources.filter(
    (resource) => (quantities[resource.resource_key] ?? 0) > 0,
  );

  // The server checks this too; doing it here just avoids a pointless round
  // trip and explains the rule where the user can act on it.
  const belowMinimum = chosen.filter(
    (resource) =>
      (quantities[resource.resource_key] ?? 0) < resource.min_quantity,
  );
  const offStep = chosen.filter(
    (resource) => (quantities[resource.resource_key] ?? 0) % resource.step !== 0,
  );
  const canSubmit =
    chosen.length > 0 &&
    belowMinimum.length === 0 &&
    offStep.length === 0 &&
    !isSubmitting;

  function setQuantity(resource: AddonResource, value: number) {
    setQuantities((current) => ({
      ...current,
      [resource.resource_key]: clampWhileTyping(resource, value),
    }));
  }

  /** The buttons and presets always land on a valid amount. */
  function setSteppedQuantity(resource: AddonResource, value: number) {
    setQuantities((current) => ({
      ...current,
      [resource.resource_key]: snapToStep(resource, value),
    }));
  }

  async function submit() {
    if (!canSubmit) return;

    setIsSubmitting(true);
    try {
      const items = Object.fromEntries(
        Object.entries(quantities).filter(([, value]) => (value ?? 0) > 0),
      ) as Partial<Record<AddonResourceKey, number>>;
      const { checkout_url } = await createAddonCheckoutSession(items);
      window.location.href = checkout_url;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("plataNuAPutut"),
      );
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-content/40 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="addon-configurator-title"
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-subtle bg-surface p-6 shadow-2xl shadow-black/20">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-muted">
          {t("capacitateSuplimentara")}
        </p>
        <h2
          id="addon-configurator-title"
          className="mt-3 font-serif text-3xl font-semibold leading-tight text-content"
        >
          {t("alegeCatItiTrebuie")}
        </h2>
        <p className="mt-3 text-sm leading-6 text-muted">
          {t("seAdaugaPestePlan")}
        </p>

        <div className="mt-5 divide-y divide-subtle border-y border-subtle">
          {resources.map((resource) => {
            const quantity = quantities[resource.resource_key] ?? 0;
            const lineTotal = quantity * Number(resource.unit_price_ron);
            const isBelowMinimum =
              quantity > 0 && quantity < resource.min_quantity;
            const isOffStep = quantity > 0 && quantity % resource.step !== 0;

            return (
              <div key={resource.id} className="py-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-content">
                      {resource.name}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {t("pePretUnitate", {
                        price: Number(resource.unit_price_ron).toFixed(2),
                        unit: resource.unit_label,
                        min: resource.min_quantity,
                      })}
                    </p>
                  </div>
                  <p className="font-serif text-xl font-semibold text-content">
                    {lineTotal > 0 ? `${lineTotal.toFixed(2)} RON` : "—"}
                  </p>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    aria-label={t("scade", { name: resource.name })}
                    onClick={() =>
                      setSteppedQuantity(resource, quantity - resource.step)
                    }
                    disabled={quantity <= 0 || isSubmitting}
                    className={`${CONTROL_HEIGHT} w-10 rounded-md border border-subtle text-lg font-bold leading-none transition hover:bg-surface-hover disabled:opacity-40`}
                  >
                    −
                  </button>
                  <input
                    type="number"
                    // Empty rather than 0, so typing 20 does not read 020.
                    value={quantity === 0 ? "" : quantity}
                    placeholder="0"
                    min={0}
                    step={resource.step}
                    max={resource.max_quantity}
                    onChange={(event) =>
                      setQuantity(resource, Number(event.target.value) || 0)
                    }
                    onBlur={() => setSteppedQuantity(resource, quantity)}
                    disabled={isSubmitting}
                    className={`no-spinner ${CONTROL_HEIGHT} w-24 rounded-md border border-subtle bg-app px-3 text-center text-sm font-bold text-content`}
                  />
                  <button
                    type="button"
                    aria-label={t("creste", { name: resource.name })}
                    onClick={() =>
                      setSteppedQuantity(resource, quantity + resource.step)
                    }
                    disabled={quantity >= resource.max_quantity || isSubmitting}
                    className={`${CONTROL_HEIGHT} w-10 rounded-md border border-subtle text-lg font-bold leading-none transition hover:bg-surface-hover disabled:opacity-40`}
                  >
                    +
                  </button>

                  <span className="ml-1 text-xs text-muted">{t("sau")}</span>
                  {presetsFor(resource).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setSteppedQuantity(resource, preset)}
                      disabled={isSubmitting}
                      className={`${CONTROL_HEIGHT} rounded-md border px-4 text-xs font-bold transition disabled:opacity-60 ${
                        quantity === preset
                          ? "border-transparent bg-action text-on-action"
                          : "border-subtle hover:bg-surface-hover"
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>

                {isBelowMinimum ? (
                  <p className="mt-2 text-xs font-semibold text-danger">
                    {t("minimulEste", {
                      min: resource.min_quantity,
                      unit: resource.unit_label,
                    })}
                  </p>
                ) : isOffStep ? (
                  <p className="mt-2 text-xs font-semibold text-warning">
                    {t("seCumparaDinPasInPas", {
                      step: resource.step,
                      unit: resource.unit_label,
                    })}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="mt-5 flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted">
            {t("total")}
          </p>
          <p className="font-serif text-3xl font-semibold text-content">
            {total.toFixed(2)}
            <span className="ml-2 text-sm font-semibold text-muted">RON</span>
          </p>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="rounded-md border border-subtle px-5 py-3 text-sm font-bold transition hover:bg-surface-hover disabled:opacity-60"
          >
            {t("renunta")}
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!canSubmit}
            className="rounded-md bg-action px-6 py-3 text-sm font-bold text-on-action transition hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? t("seDeschidePlata") : t("continuaSprePlata")}
          </button>
        </div>
      </div>
    </div>
  );
}
