import { useTranslations } from "next-intl";
import Link from "next/link";

type CheckoutDisclosureProps = {
  planName: string;
  price: string;
  period?: string;
  paymentFrequency?: string;
  className?: string;
};

export function CheckoutDisclosure({
  planName,
  price,
  period: periodProp,
  paymentFrequency: paymentFrequencyProp,
  className = "",
}: CheckoutDisclosureProps) {
  const t = useTranslations("checkoutDisclosure");
  const period = periodProp ?? t("lunara");
  const paymentFrequency =
    paymentFrequencyProp ?? t("lunarCuReinnoireAutomata");
  return (
    <div
      className={`rounded-[1.5rem] border border-subtle bg-app p-4 text-xs leading-5 text-muted ${className}`}
    >
      <p className="font-black text-content">{t("informatiiInainteDePlata")}</p>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        <div>
          <dt className="font-bold text-content">{t("plan")}</dt>
          <dd>{planName}</dd>
        </div>
        <div>
          <dt className="font-bold text-content">{t("pretTotal")}</dt>
          <dd>{price} RON</dd>
        </div>
        <div>
          <dt className="font-bold text-content">{t("moneda")}</dt>
          <dd>RON</dd>
        </div>
        <div>
          <dt className="font-bold text-content">{t("tva")}</dt>
          <dd>{t("inclusDacaEsteAplicabil")}</dd>
        </div>
        <div>
          <dt className="font-bold text-content">{t("perioadaAbonament")}</dt>
          <dd>{period}</dd>
        </div>
        <div>
          <dt className="font-bold text-content">{t("frecventaPlatii")}</dt>
          <dd>{paymentFrequency}</dd>
        </div>
        <div>
          <dt className="font-bold text-content">{t("anulare")}</dt>
          <dd>
            {t("dinPagina")}{" "}
            <Link
              href="/anulare-abonament"
              className="font-bold text-content underline decoration-subtle underline-offset-4"
            >
              {t("anulareAbonament")}
            </Link>
          </dd>
        </div>
        <div>
          <dt className="font-bold text-content">{t("intrareInVigoare")}</dt>
          <dd>{t("anulareaOpresteUrmatoareaReinnoire")}</dd>
        </div>
      </dl>
      <p className="mt-3">
        {t("informatiiDespreDreptulDeRetragere")}{" "}
        <Link
          href="/retragere-din-contract"
          className="font-bold text-content underline decoration-subtle underline-offset-4"
        >
          {t("retragereDinContract")}
        </Link>
        {t("prinApasareaButonuluiDePlata")}{" "}
        <Link
          href="/termeni-si-conditii"
          className="font-bold text-content underline decoration-subtle underline-offset-4"
        >
          {t("termeniiSiConditiile")}
        </Link>
        .
      </p>
    </div>
  );
}
