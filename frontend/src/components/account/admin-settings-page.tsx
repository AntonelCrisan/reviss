"use client";

import Link from "next/link";
import { type ReactNode } from "react";
import { AccountStaticShell } from "@/components/account/account-static-shell";

type SettingsCard = {
  title: string;
  description: string;
  href: string;
  icon:
    | "document"
    | "shield"
    | "building"
    | "card"
    | "users"
    | "logs"
    | "chart"
    | "mail"
    | "flag"
    | "trash"
    | "withdrawal";
};

const legalCards: SettingsCard[] = [
  {
    title: "Termeni și condiții",
    description: "Editează documentul legal afișat public.",
    href: "/admin/settings/termeni-si-conditii",
    icon: "document",
  },
  {
    title: "Politica de confidențialitate",
    description: "Actualizează documentul pentru date și confidențialitate.",
    href: "/admin/settings/politica-de-confidentialitate",
    icon: "shield",
  },
  {
    title: "Datele firmei",
    description: "Gestionează informațiile afișate în footer și documente.",
    href: "/admin/settings/datele-firmei",
    icon: "building",
  },
];

const planCards: SettingsCard[] = [
  {
    title: "Planuri și abonamente",
    description: "Prețuri, reduceri, beneficii și vizibilitate planuri.",
    href: "/admin/settings/planuri",
    icon: "card",
  },
  {
    title: "Traduceri planuri",
    description: "Textele planurilor în engleză și franceză.",
    href: "/admin/settings/traduceri-planuri",
    icon: "card",
  },
  {
    title: "AI Credits și cost",
    description: "Praguri de credite pe mărime și cost estimat per model AI.",
    href: "/admin/settings/ai-credite",
    icon: "chart",
  },
];

const userCards: SettingsCard[] = [
  {
    title: "Utilizatori",
    description: "Listă utilizatori, roluri și detalii de cont.",
    href: "/admin/settings/utilizatori",
    icon: "users",
  },
  {
    title: "Ștergeri conturi",
    description: "Solicitări de ștergere trimise de utilizatori.",
    href: "/admin/settings/stergeri-conturi",
    icon: "trash",
  },
];

const monitoringCards: SettingsCard[] = [
  {
    title: "Jurnal activitate",
    description: "Evenimente administrative și acțiuni importante.",
    href: "/admin/settings/loguri",
    icon: "logs",
  },
  {
    title: "Vizitatori fără cont",
    description: "Trafic anonim, vizite pe zi și pagini accesate.",
    href: "/admin/settings/vizitatori",
    icon: "chart",
  },
];

const communicationCards: SettingsCard[] = [
  {
    title: "Mesaje contact",
    description: "Solicitări trimise prin formularul public de contact.",
    href: "/admin/settings/mesaje-contact",
    icon: "mail",
  },
  {
    title: "Raportări conținut",
    description: "Sesizări pentru conținut, drepturi și date personale.",
    href: "/admin/settings/raportari-continut",
    icon: "flag",
  },
  {
    title: "Retrageri contract",
    description: "Cereri publice pentru exercitarea dreptului de retragere.",
    href: "/admin/settings/retrageri-contract",
    icon: "withdrawal",
  },
];

const adminGroups = [
  {
    title: "Aplicație și firmă",
    detail: "Conținut global și date juridice.",
    cards: legalCards,
  },
  {
    title: "Planuri",
    detail: "Configurare comercială.",
    cards: planCards,
  },
  {
    title: "Utilizatori și acces",
    detail: "Conturi și permisiuni.",
    cards: userCards,
  },
  {
    title: "Monitorizare",
    detail: "Audit și diagnostic.",
    cards: monitoringCards,
  },
  {
    title: "Comunicare",
    detail: "Mesaje primite.",
    cards: communicationCards,
  },
];

function SvgIcon({
  children,
  className = "h-5 w-5",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      {children}
    </svg>
  );
}

function SettingsIcon({ icon }: { icon: SettingsCard["icon"] }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-app text-content transition group-hover:bg-action group-hover:text-on-action">
      {icon === "document" ? (
        <SvgIcon>
          <path d="M7 3h7l4 4v14H7z" />
          <path d="M14 3v5h5M9 13h6M9 17h6" />
        </SvgIcon>
      ) : null}
      {icon === "shield" ? (
        <SvgIcon>
          <path d="M12 3 20 6v6c0 5-3.4 8.5-8 9-4.6-.5-8-4-8-9V6z" />
          <path d="M9.5 12.5 11 14l3.5-4" />
        </SvgIcon>
      ) : null}
      {icon === "building" ? (
        <SvgIcon>
          <path d="M4 21h16M6 21V5l8-2v18M14 8h4v13" />
          <path d="M8 8h2M8 12h2M8 16h2M16 12h1M16 16h1" />
        </SvgIcon>
      ) : null}
      {icon === "card" ? (
        <SvgIcon>
          <path d="M4 7h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" />
          <path d="M2 11h20M6 15h4" />
        </SvgIcon>
      ) : null}
      {icon === "users" ? (
        <SvgIcon>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </SvgIcon>
      ) : null}
      {icon === "logs" ? (
        <SvgIcon>
          <path d="M5 4h14v16H5z" />
          <path d="M8 8h8M8 12h8M8 16h5" />
        </SvgIcon>
      ) : null}
      {icon === "chart" ? (
        <SvgIcon>
          <path d="M4 20V10M11 20V4M18 20v-7" />
          <path d="M4 20h16" />
        </SvgIcon>
      ) : null}
      {icon === "mail" ? (
        <SvgIcon>
          <path d="M4 6h16v12H4z" />
          <path d="m4 7 8 6 8-6" />
        </SvgIcon>
      ) : null}
      {icon === "flag" ? (
        <SvgIcon>
          <path d="M5 21V4" />
          <path d="M5 5h11l-1 4 1 4H5" />
        </SvgIcon>
      ) : null}
      {icon === "trash" ? (
        <SvgIcon>
          <path d="M4 7h16" />
          <path d="M10 11v6M14 11v6M6 7l1 14h10l1-14" />
          <path d="M9 7V4h6v3" />
        </SvgIcon>
      ) : null}
      {icon === "withdrawal" ? (
        <SvgIcon>
          <path d="M7 7h10v14H7z" />
          <path d="M9 3h6v4H9zM10 12h4M10 16h4" />
          <path d="m4 11 3-3 3 3" />
        </SvgIcon>
      ) : null}
    </span>
  );
}

function ArrowIcon() {
  return (
    <SvgIcon className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
    </SvgIcon>
  );
}

function SettingsGroup({
  title,
  detail,
  cards,
}: {
  title: string;
  detail: string;
  cards: SettingsCard[];
}) {
  return (
    <section className="rounded-xl border border-subtle bg-surface p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="text-xs font-black uppercase tracking-[0.18em] text-muted">
          {title}
        </h2>
        <span className="text-xs font-bold text-muted">{detail}</span>
      </div>

      <div className="mt-4 divide-y divide-subtle border-y border-subtle">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group -mx-3 grid gap-3 rounded-xl px-3 py-4 transition hover:bg-surface-hover sm:grid-cols-[auto_1fr_auto] sm:items-center"
          >
            <SettingsIcon icon={card.icon} />
            <span className="min-w-0">
              <span className="block text-sm font-black text-content">
                {card.title}
              </span>
              <span className="mt-1 block text-xs leading-5 text-muted">
                {card.description}
              </span>
            </span>
            <span className="flex items-center gap-3 sm:justify-end">
              <span className="hidden rounded-md bg-action px-4 py-2 text-xs font-black text-on-action transition group-hover:bg-action-hover sm:inline-flex">
                Deschide
              </span>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-subtle text-muted transition group-hover:border-action group-hover:text-content">
                <ArrowIcon />
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function AdminSettingsPage() {
  return (
    <AccountStaticShell activePage="admin-settings">
      <section className="space-y-7">
        <div className="flex flex-col gap-5 border-b border-subtle pb-7 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="inline-flex rounded-md border border-subtle bg-action-soft px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-muted">
              Administrare
            </p>
            <h1 className="mt-3 max-w-3xl font-serif text-4xl font-semibold leading-[0.95] text-content sm:text-5xl">
              Setări admin.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted">
              Controlează conținutul global, planurile, utilizatorii și auditul.
            </p>
          </div>

          <span className="inline-flex w-fit rounded-md border border-success-border bg-success-soft px-4 py-2 text-xs font-black text-success">
            Acces admin
          </span>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          <AdminMetric label="Zone globale" value="3" detail="Legal și firmă" />
          <AdminMetric label="Planuri" value="1" detail="Catalog abonamente" />
          <AdminMetric
            label="Comunicare"
            value="3"
            detail="Mesaje și cereri publice"
          />
        </div>

        <div className="grid gap-5 xl:grid-cols-2">
          {adminGroups.map((group) => (
            <SettingsGroup
              key={group.title}
              title={group.title}
              detail={group.detail}
              cards={group.cards}
            />
          ))}
        </div>
      </section>
    </AccountStaticShell>
  );
}

function AdminMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="rounded-xl border border-subtle bg-surface p-5">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted">
        {label}
      </p>
      <p className="mt-4 font-serif text-2xl font-semibold leading-tight text-content">
        {value}
      </p>
      <p className="mt-2 text-sm leading-6 text-muted">{detail}</p>
    </article>
  );
}
