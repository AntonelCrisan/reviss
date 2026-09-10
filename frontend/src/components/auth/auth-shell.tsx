import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BrandLogo } from "@/components/brand-logo";

type AuthShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
  alternateText: string;
  alternateLabel: string;
  alternateHref: "/login" | "/register";
  asideTitle: string;
  asideDescription: string;
  features: string[];
};

function SparkIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3.5 13.45 8a4 4 0 0 0 2.55 2.55L20.5 12 16 13.45A4 4 0 0 0 13.45 16L12 20.5 10.55 16A4 4 0 0 0 8 13.45L3.5 12 8 10.55A4 4 0 0 0 10.55 8L12 3.5Z"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4L19 6" />
    </svg>
  );
}

export async function AuthShell({
  title,
  description,
  children,
  alternateText,
  alternateLabel,
  alternateHref,
  asideTitle,
  asideDescription,
  features,
}: AuthShellProps) {
  const t = await getTranslations("auth.shell");

  return (
    <div className="theme-shadow mx-auto grid w-full overflow-hidden rounded-[1.75rem] border border-subtle bg-surface lg:grid-cols-[1.03fr_0.97fr]">
      <section className="p-5 sm:p-6 lg:p-7 xl:p-8">
        <BrandLogo
          href="/"
          className="mb-5 w-fit text-content transition hover:text-action"
          logoClassName="h-9 w-36"
        />

        <h1 className="max-w-xl font-serif text-2xl font-semibold leading-[1.12] tracking-[-0.02em] sm:text-3xl xl:text-[2rem]">
          {title}
        </h1>
        <p className="mt-3 max-w-lg text-[13px] leading-5 text-muted">
          {description}
        </p>

        <div className="mt-5">{children}</div>

        <p className="mt-4 text-center text-xs text-muted sm:text-sm">
          {alternateText}{" "}
          <Link
            href={alternateHref}
            className="font-bold text-content underline decoration-subtle underline-offset-4 transition hover:decoration-content"
          >
            {alternateLabel}
          </Link>
        </p>
      </section>

      <aside className="relative hidden overflow-hidden border-l border-subtle bg-action p-7 text-on-action lg:flex lg:flex-col lg:justify-between xl:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full border border-on-action/10" />
        <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full border border-on-action/10" />
        <div className="pointer-events-none absolute -bottom-36 -left-28 h-80 w-80 rounded-full bg-on-action/5 blur-2xl" />

        <div className="relative">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-on-action/10">
            <SparkIcon />
          </span>
          <p className="mt-7 text-[10px] font-bold uppercase tracking-[0.2em] text-on-action/65">
            {t("asideEyebrow")}
          </p>
          <h2 className="mt-3 max-w-md font-serif text-2xl font-semibold leading-tight xl:text-[1.75rem]">
            {asideTitle}
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-6 text-on-action/70">
            {asideDescription}
          </p>
        </div>

        <div className="relative mt-8 space-y-2.5">
          {features.map((feature) => (
            <div
              key={feature}
              className="flex items-center gap-3 rounded-xl border border-on-action/10 bg-on-action/5 px-3.5 py-2.5 text-xs font-semibold xl:text-sm"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-on-action/10">
                <CheckIcon />
              </span>
              {feature}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
