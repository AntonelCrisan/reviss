"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/auth/auth-provider";

type PlanTryButtonProps = {
  slug: string;
  label: string;
  isFree: boolean;
};

/**
 * The only client-side piece of a plan detail page.
 *
 * Everything else on the page is server-rendered so crawlers get the full
 * content; this button just needs the session to pick a destination.
 *
 * Moving to the free plan is never a checkout: it means cancelling the paid
 * renewal, which the account keeps until the period ends. That lives on
 * /upgrade with its confirmation, so the free plan links there rather than
 * dropping the user in /myaccount where nothing would happen.
 */
export function PlanTryButton({ slug, label, isFree }: PlanTryButtonProps) {
  const t = useTranslations("marketing.plans.try");
  const { user, isLoading } = useAuth();

  const currentPlanSlug = user?.current_plan?.slug ?? null;
  const isOnThisPlan = currentPlanSlug === slug;
  const hasPaidPlan = Number(user?.current_plan?.price_ron ?? 0) > 0;

  function resolve(): { href: string; text: string; hint: string | null } {
    if (!user) {
      return isFree
        ? { href: "/register", text: label, hint: t("createHint") }
        : {
            href: `/login?next=${encodeURIComponent(`/checkout/${slug}`)}`,
            text: label,
            hint: t("loginHint"),
          };
    }

    if (isOnThisPlan) {
      return {
        href: "/myaccount",
        text: t("currentPlan"),
        hint: t("currentHint"),
      };
    }

    if (isFree) {
      return hasPaidPlan
        ? {
            href: "/upgrade",
            text: t("switchFree"),
            hint: t("switchFreeHint"),
          }
        : { href: "/myaccount", text: label, hint: null };
    }

    return { href: `/checkout/${slug}`, text: label, hint: null };
  }

  const { href, text, hint } = resolve();

  return (
    <>
      <Link
        href={href}
        aria-busy={isLoading}
        className="theme-shadow-action inline-flex w-full items-center justify-center gap-3 rounded-md bg-action px-6 py-3.5 text-sm font-bold text-on-action transition hover:-translate-y-0.5 hover:bg-action-hover"
      >
        {text}
        <span aria-hidden="true">→</span>
      </Link>
      {!isLoading && hint ? (
        <p className="mt-3 text-center text-xs leading-5 text-muted">{hint}</p>
      ) : null}
    </>
  );
}
