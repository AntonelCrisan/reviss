import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { SubscriptionPlanPublic } from "@/lib/plans-api";
import { plansIndexPath } from "@/lib/seo";
import { PlanTryButton } from "@/components/marketing/plan-try-button";

type PlansTranslator = Awaited<ReturnType<typeof getTranslations<"marketing.plans">>>;

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4L19 6" />
    </svg>
  );
}

export function formatPlanPrice(value: SubscriptionPlanPublic["price_ron"]) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return String(value);
  return Number.isInteger(numericValue)
    ? String(numericValue)
    : numericValue.toFixed(2).replace(".", ",");
}

/** "RON / month" and friends; the interval itself comes from the plan record. */
export function billingSuffix(t: PlansTranslator, interval: string) {
  const normalized = interval.trim().toLowerCase();
  if (normalized.includes("lun") || normalized.includes("month")) {
    return t("perMonth");
  }
  if (normalized.includes("an") || normalized.includes("year")) {
    return t("perYear");
  }
  return t("perInterval", { interval });
}

export function planFeatureLabels(plan: SubscriptionPlanPublic) {
  const sorted = [...plan.features].sort(
    (first, second) => first.sort_order - second.sort_order,
  );
  const seen = new Set<string>();

  return [plan.material_limit, ...sorted.map((feature) => feature.label)].filter(
    (feature) => {
      const normalized = feature.trim();
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    },
  );
}

/**
 * Limits shown publicly. Deliberately a curated set: internal accounting units
 * (AI credits, OCR pages, per-cycle page budget, project MB ceiling) and our
 * cost per cycle never reach this page -- they are not even fetched, since the
 * public API no longer returns them.
 */
function planLimitRows(t: PlansTranslator, plan: SubscriptionPlanPublic) {
  return [
    { label: t("limitRows.activeSlots"), value: String(plan.active_project_slots) },
    { label: t("limitRows.newPerMonth"), value: String(plan.active_project_limit) },
    {
      label: t("limitRows.materialsPerMonth"),
      value: String(plan.monthly_material_limit),
    },
    {
      label: t("limitRows.filesPerProject"),
      value: String(plan.files_per_project_limit),
    },
    { label: t("limitRows.maxFileSize"), value: `${plan.file_size_limit_mb} MB` },
    {
      label: t("limitRows.pagesPerMaterial"),
      value: String(plan.estimated_page_limit),
    },
    {
      label: t("limitRows.initialFlashcards"),
      value: String(plan.initial_flashcard_limit),
    },
    {
      label: t("limitRows.questionsPerQuiz"),
      value: String(plan.quiz_questions_per_quiz),
    },
    {
      label: t("limitRows.quizzesPerProject"),
      value: String(plan.quizzes_per_project_limit),
    },
    {
      label: t("limitRows.ocr"),
      value: plan.allow_scanned_documents ? t("included") : t("notIncluded"),
    },
    {
      label: t("limitRows.aiChat"),
      value: plan.ai_chat_enabled ? t("includedOne") : t("notIncludedOne"),
    },
  ];
}

/** True when the plan's own badge already says what the featured chip says. */
function badgeDuplicatesFeatured(badge: string | null) {
  return (badge ?? "").trim().toLowerCase() === "recomandat";
}

export async function PlanDetails({ plan }: { plan: SubscriptionPlanPublic }) {
  const t = await getTranslations("marketing.plans");
  const isFree = Number(plan.price_ron) === 0;
  const price = formatPlanPrice(plan.price_ron);
  const oldPrice = plan.old_price_ron ? formatPlanPrice(plan.old_price_ron) : "";
  const features = planFeatureLabels(plan);
  const limitRows = planLimitRows(t, plan);
  const ctaLabel = isFree ? t("ctaFree") : t("ctaTry", { name: plan.name });
  const summaryCards = [
    { label: t("materials"), value: plan.material_limit },
    { label: t("aiLevel"), value: plan.ai_level },
    { label: t("history"), value: plan.storage },
  ];
  const billingRows = [
    [t("billing"), isFree ? t("noPayment") : t("autoRenew")],
    [t("currencyLabel"), "RON"],
    [t("cancellation"), t("cancelAnytime")],
  ];

  return (
    <div className="mx-auto max-w-7xl px-5 py-14 sm:px-8 sm:py-20">
      <nav aria-label={t("breadcrumbLabel")} className="text-sm font-bold text-muted">
        <Link href="/" className="transition hover:text-content">
          {t("breadcrumbHome")}
        </Link>
        <span aria-hidden="true" className="px-2">
          /
        </span>
        <Link href={plansIndexPath} className="transition hover:text-content">
          {t("breadcrumbPlans")}
        </Link>
        <span aria-hidden="true" className="px-2">
          /
        </span>
        <span className="text-content">{plan.name}</span>
      </nav>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {plan.badge && !(plan.is_featured && badgeDuplicatesFeatured(plan.badge)) ? (
              <span className="inline-flex rounded-md border border-subtle bg-action-soft px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted">
                {plan.badge}
              </span>
            ) : null}
            {plan.is_featured ? (
              <span className="inline-flex rounded-md bg-action px-3 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-on-action">
                {t("recommended")}
              </span>
            ) : null}
          </div>

          <h1 className="mt-4 max-w-3xl font-serif text-3xl font-semibold leading-[1.1] tracking-[-0.02em] sm:text-4xl lg:text-5xl">
            {t("planTitle", { name: plan.name })}
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-muted sm:text-base">
            {plan.description}
          </p>

          <dl className="mt-8 grid gap-4 sm:grid-cols-3">
            {summaryCards.map((item) => (
              <div
                key={item.label}
                className="rounded-md border border-subtle bg-surface p-4"
              >
                <dt className="text-[10px] font-black uppercase tracking-[0.18em] text-muted">
                  {item.label}
                </dt>
                <dd className="mt-2 text-sm font-bold leading-6 text-content">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>

          <section className="mt-10">
            <h2 className="font-serif text-2xl font-semibold">{t("includes")}</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {features.map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-3 rounded-md border border-subtle bg-surface px-4 py-3 text-sm leading-6"
                >
                  <span className="mt-1 shrink-0 text-success">
                    <CheckIcon />
                  </span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-10">
            <h2 className="font-serif text-2xl font-semibold">{t("limits")}</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[22rem] border-collapse text-sm">
                <tbody>
                  {limitRows.map((row) => (
                    <tr key={row.label} className="border-b border-subtle">
                      <th
                        scope="row"
                        className="py-3 pr-4 text-left font-medium text-muted"
                      >
                        {row.label}
                      </th>
                      <td className="py-3 text-right font-bold text-content">
                        {row.value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {plan.conditions ? (
            <section className="mt-10 rounded-md border border-subtle bg-surface p-5">
              <h2 className="text-sm font-black text-content">{t("conditions")}</h2>
              <p className="mt-2 text-sm leading-7 text-muted">{plan.conditions}</p>
            </section>
          ) : null}
        </div>

        <aside className="rounded-md border border-subtle bg-surface p-6 shadow-sm lg:sticky lg:top-6">
          <p className="flex flex-wrap items-end gap-x-2 gap-y-1">
            <span className="font-serif text-5xl font-semibold leading-none">
              {price}
            </span>
            <span className="pb-1 text-sm text-muted">
              {isFree ? t("permanent") : billingSuffix(t, plan.billing_interval)}
            </span>
          </p>

          {oldPrice ? (
            <p className="mt-2 text-xs font-bold text-muted line-through">
              {oldPrice} RON
            </p>
          ) : null}

          {plan.discount_label ? (
            <p className="mt-3 w-fit rounded-md border border-success-border bg-success-soft px-3 py-1 text-[10px] font-black text-success">
              {plan.discount_label}
            </p>
          ) : null}

          <div className="my-6 h-px bg-subtle" />

          <dl className="space-y-0 text-sm">
            {billingRows.map(([label, value]) => (
              <div
                key={label}
                className="flex items-center justify-between gap-4 border-b border-subtle py-3"
              >
                <dt className="text-muted">{label}</dt>
                <dd className="text-right text-xs font-black">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-6">
            <PlanTryButton slug={plan.slug} label={ctaLabel} isFree={isFree} />
          </div>

          <p className="mt-5 text-center text-[10px] leading-5 text-muted">
            {t.rich("stripeNote", {
              terms: (chunks) => (
                <Link href="/termeni-si-conditii" className="underline">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </aside>
      </div>
    </div>
  );
}
