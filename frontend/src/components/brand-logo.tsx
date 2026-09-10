import { useTranslations } from "next-intl";
import Link from "next/link";

type BrandLogoVariant = "full" | "mark";

type BrandLogoProps = {
  href?: string;
  variant?: BrandLogoVariant;
  className?: string;
  logoClassName?: string;
  label?: string;
};

function logoSizeClass(variant: BrandLogoVariant) {
  return variant === "full" ? "h-9 w-36" : "h-10 w-10";
}

export function BrandLogo({
  href,
  variant = "full",
  className = "",
  logoClassName = "",
  label = "Reviss",
}: BrandLogoProps) {
  const t = useTranslations("common");
  const wrapperClassName = `inline-flex items-center ${className || "text-content"}`;
  const logo = (
    <>
      <span
        aria-hidden="true"
        className={[
          "brand-logo-mask",
          variant === "full" ? "brand-logo-mask-full" : "brand-logo-mask-mark",
          logoSizeClass(variant),
          logoClassName,
        ].join(" ")}
      />
      <span className="sr-only">{label}</span>
    </>
  );

  if (!href) {
    return <span className={wrapperClassName}>{logo}</span>;
  }

  return (
    <Link
      href={href}
      aria-label={`${label} - ${t("home")}`}
      className={wrapperClassName}
    >
      {logo}
    </Link>
  );
}
