import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { SiteFooter } from "@/components/legal/site-footer";
import { FlashcardStory } from "@/components/marketing/flashcard-story";
import { MarketingHeader } from "@/components/marketing/marketing-header";
import { ScrollReveal } from "@/components/marketing/scroll-reveal";
import { TranslatedText } from "@/components/translated-text";
import type { SubscriptionPlanPublic } from "@/lib/plans-api";
import {
  absoluteUrl,
  defaultLocale,
  openGraphImagePath,
  planDetailPath,
  seoKeywords,
  serializeJsonLd,
  siteName,
  siteUrl,
} from "@/lib/seo";
import {
  fallbackSubscriptionPlans,
  getServerPublicPlans,
} from "@/lib/server-plans";

const homepageSeoTitle =
  "Reviss | Rezumate AI, flashcard-uri și quiz-uri pentru studenți";
const homepageSeoDescription =
  "Încarcă PDF-uri, cursuri sau prezentări, iar Reviss le transformă în rezumate AI, flashcard-uri, quiz-uri și planuri clare pentru examen.";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  title: homepageSeoTitle,
  description: homepageSeoDescription,
  keywords: [
    ...seoKeywords,
    "rezumate cursuri AI",
    "flashcard-uri din cursuri",
    "quiz-uri personalizate pentru examen",
    "rezumate pentru facultate",
    "AI pentru învățare activă",
    "recapitulare inteligentă",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: homepageSeoTitle,
    description:
      "Transformă cursurile în pachete de studiu: rezumate clare, flashcard-uri, quiz-uri și progres măsurabil.",
    url: "/",
    siteName,
    locale: defaultLocale,
    type: "website",
    images: [
      {
        url: openGraphImagePath,
        width: 1200,
        height: 630,
        alt: "Reviss - rezumate AI, flashcard-uri și quiz-uri pentru studenți",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: homepageSeoTitle,
    description: homepageSeoDescription,
    images: [openGraphImagePath],
  },
};

function ArrowIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14m-6-6 6 6-6 6" />
    </svg>
  );
}

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

function UploadIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0L7 9m5-5 5 5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

function LayersIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m12 3 9 5-9 5-9-5 9-5Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m3 12 9 5 9-5M3 16l9 5 9-5" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 19V9m6 10V5m6 14v-7m4 7H2" />
    </svg>
  );
}

const workflow = [
  {
    step: "01",
    title: "Încarci materialul",
    description:
      "Adaugi PDF-ul, notițele sau suportul de curs. Fără să rescrii manual capitole întregi.",
    icon: <UploadIcon />,
    tone: "border-info-border bg-info-soft text-info",
  },
  {
    step: "02",
    title: "AI-ul îl structurează",
    description:
      "Reviss identifică ideile importante și pregătește rezumatul, flashcard-urile și testele.",
    icon: <SparkIcon />,
    tone: "border-warning-border bg-warning-soft text-warning",
  },
  {
    step: "03",
    title: "Înveți activ",
    description:
      "Exersezi, primești explicații și vezi exact ce concepte trebuie recapitulate.",
    icon: <ChartIcon />,
    tone: "border-success-border bg-success-soft text-success",
  },
];

const studyUseCases = [
  {
    title: "Rezumate AI din PDF-uri și cursuri",
    description:
      "Încarci suporturi de curs, documente Word, prezentări sau notițe, iar Reviss le transformă într-un rezumat structurat pentru recapitulare rapidă.",
  },
  {
    title: "Flashcard-uri pentru învățare activă",
    description:
      "Conceptele importante devin carduri de repetat, astfel încât să verifici ce știi deja și ce trebuie reluat înainte de examen.",
  },
  {
    title: "Quiz-uri personalizate pentru facultate",
    description:
      "Generezi întrebări din materialele tale, cu explicații și feedback, ca să exersezi aplicarea ideilor, nu doar recitirea lor.",
  },
  {
    title: "Plan de recapitulare pentru sesiune",
    description:
      "Reviss adună rezumate, cuvinte-cheie, flashcard-uri și progres într-un flux clar pentru colocvii, examene și licență.",
  },
] as const;

const fallbackMarketingPricingPlans = [
  {
    slug: "start",
    name: "Beginner",
    description: "Pentru primul curs și primele sesiuni de studiu activ.",
    price: "0",
    suffix: "gratuit",
    features: [
      "3 materiale procesate lunar",
      "Rezumat, flashcard-uri și quiz",
      "Maximum 25 de pagini per material",
      "Istoric pentru ultimele 7 zile",
    ],
    featured: false,
    discount: "",
    oldPrice: "",
  },
  {
    slug: "focus",
    name: "Focus",
    description: "Tot ce ai nevoie pentru facultate, de la seminar la examen.",
    price: "29",
    suffix: "/ lună",
    features: [
      "30 de materiale procesate lunar",
      "Maximum 200 de pagini per material",
      "Flashcard-uri și quiz-uri nelimitate",
      "Repetiție inteligentă și explicații AI",
      "Progres complet pentru fiecare curs",
    ],
    featured: true,
    discount: "25% reducere lansare",
    oldPrice: "39",
  },
  {
    slug: "pro",
    name: "Exam Pro",
    description: "Pentru sesiuni intense, licență și volume mari de cursuri.",
    price: "59",
    suffix: "/ lună",
    features: [
      "100 de materiale procesate lunar",
      "Maximum 500 de pagini per material",
      "Generare prioritară în perioade aglomerate",
      "Simulări de examen și analiză avansată",
      "Export pentru rezumate și flashcard-uri",
    ],
    featured: false,
    discount: "20 RON economie",
    oldPrice: "79",
  },
] as const;

const homepageFaq = [
  [
    "Ce materiale pot încărca în Reviss?",
    "Poți încărca PDF-uri, documente Word, prezentări și notițe text. Pentru documente scanate sau poze cu text, accesul este rezervat planului Pro, unde activăm procesare OCR.",
  ],
  [
    "Ce generează Reviss dintr-un curs?",
    "Mai întâi primești rezumatul, cuvintele-cheie, strategiile de învățare și flashcard-urile. Quiz-urile se generează separat, când ești pregătit să intri în testare activă.",
  ],
  [
    "Quiz-urile sunt utile pentru examen?",
    "Da, întrebările sunt gândite pe niveluri: recapitulare, înțelegere și aplicare, apoi simulare de examen. Nu înlocuiesc subiectele oficiale, dar te ajută să vezi unde trebuie să revii.",
  ],
  [
    "Pot cere explicații AI pe fragmente din rezumat sau flashcarduri?",
    "Da, în planul Pro poți selecta un text care nu este clar și poți cere o explicație contextuală, legată de materia, proiectul și conținutul încărcat.",
  ],
  [
    "Materialele mele sunt publice?",
    "Nu. Materialele sunt asociate contului tău și proiectelor tale. Tu trebuie să ai dreptul să folosești fișierele încărcate, iar conținutul generat trebuie verificat înainte de utilizare.",
  ],
  [
    "Există un plan gratuit?",
    "Da. Planul Beginner este pentru testarea fluxului cu limite mai mici. Planurile plătite adaugă mai multe materiale, documente mai mari, explicații AI și opțiuni avansate pentru studiu.",
  ],
] as const;

const homepageStructuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: siteName,
      url: siteUrl,
      logo: absoluteUrl("/assets/logos/Reviss_logo_dark.svg"),
    },
    {
      "@type": "WebSite",
      name: siteName,
      url: siteUrl,
      inLanguage: "ro-RO",
    },
    {
      "@type": "WebPage",
      name: homepageSeoTitle,
      url: siteUrl,
      description: homepageSeoDescription,
      inLanguage: "ro-RO",
      isPartOf: {
        "@type": "WebSite",
        name: siteName,
        url: siteUrl,
      },
    },
    {
      "@type": "SoftwareApplication",
      name: siteName,
      applicationCategory: "EducationalApplication",
      operatingSystem: "Web",
      url: siteUrl,
      description:
        "Platformă AI pentru studenți care transformă cursuri, PDF-uri, documente și prezentări în rezumate, flashcard-uri, quiz-uri și strategii de învățare.",
      audience: {
        "@type": "EducationalAudience",
        educationalRole: "student",
      },
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "RON",
      },
    },
    {
      "@type": "FAQPage",
      mainEntity: homepageFaq.map(([question, answer]) => ({
        "@type": "Question",
        name: question,
        acceptedAnswer: {
          "@type": "Answer",
          text: answer,
        },
      })),
    },
  ],
};

function formatPlanPrice(value: SubscriptionPlanPublic["price_ron"]) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return String(value);
  return Number.isInteger(numericValue)
    ? String(numericValue)
    : numericValue.toFixed(2).replace(".", ",");
}

function billingSuffix(interval: string) {
  const normalized = interval.trim().toLowerCase();
  if (normalized.includes("lun")) return "/ lună";
  if (normalized.includes("an")) return "/ an";
  return `/ ${interval}`;
}

function uniqueFeatures(features: string[]) {
  const seen = new Set<string>();
  return features.filter((feature) => {
    const normalized = feature.trim();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function toPricingPlans(plans: SubscriptionPlanPublic[]) {
  return [...plans]
    .filter((plan) => plan.is_visible)
    .sort((first, second) => first.sort_order - second.sort_order)
    .map((plan) => {
      const price = formatPlanPrice(plan.price_ron);
      const isFree = Number(plan.price_ron) === 0;
      const oldPrice = plan.old_price_ron
        ? formatPlanPrice(plan.old_price_ron)
        : "";
      const sortedFeatures = [...plan.features].sort(
        (first, second) => first.sort_order - second.sort_order,
      );

      return {
        slug: plan.slug,
        name: plan.name,
        description: plan.description,
        price,
        suffix: isFree ? "gratuit" : billingSuffix(plan.billing_interval),
        features: uniqueFeatures([
          plan.material_limit,
          ...sortedFeatures.map((feature) => feature.label),
        ]),
        featured: plan.is_featured,
        discount: plan.discount_label ?? "",
        oldPrice,
      };
    });
}

export default async function Home() {
  const subscriptionPlans =
    (await getServerPublicPlans()) ?? fallbackSubscriptionPlans;
  const databasePricingPlans = toPricingPlans(subscriptionPlans);
  const pricingPlans = databasePricingPlans.length
    ? databasePricingPlans
    : fallbackMarketingPricingPlans;

  return (
    <main className="min-h-screen overflow-x-clip bg-app text-content">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(homepageStructuredData),
        }}
      />
      <MarketingHeader />

      <section className="relative isolate">
        <div className="pointer-events-none absolute -left-36 top-20 h-[26rem] w-[26rem] rounded-full bg-warning-border/25 blur-3xl" />
        <div className="pointer-events-none absolute -right-36 bottom-0 h-[30rem] w-[30rem] rounded-full bg-success-border/25 blur-3xl" />

        <div className="relative mx-auto grid min-h-[calc(100svh-4.5rem)] max-w-7xl items-center gap-14 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1.02fr_0.98fr] lg:py-28">
          <div>
            <div className="inline-flex items-center gap-2 rounded-md border border-subtle bg-surface px-4 py-2 text-[11px] font-bold uppercase tracking-[0.17em] text-muted shadow-sm">
              <SparkIcon />
              <TranslatedText id="marketing.hero.badge" />
            </div>

            <h1 className="mt-7 max-w-3xl font-serif text-5xl font-semibold leading-[1.03] tracking-[-0.04em] sm:text-6xl lg:text-7xl">
              <TranslatedText id="marketing.hero.title.main" />
              <span className="block italic text-muted">
                <TranslatedText id="marketing.hero.title.accent" />
              </span>
            </h1>

            <p className="mt-7 max-w-xl text-base leading-8 text-muted sm:text-lg">
              <TranslatedText id="marketing.hero.description" />
            </p>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/register"
                className="theme-shadow-action inline-flex items-center justify-center gap-3 rounded-md bg-action px-6 py-3.5 text-sm font-bold text-on-action transition hover:-translate-y-0.5 hover:bg-action-hover"
              >
                <TranslatedText id="marketing.hero.cta.primary" />
                <ArrowIcon />
              </Link>
              <a
                href="#cum-functioneaza"
                className="inline-flex items-center justify-center rounded-md border border-subtle bg-surface px-6 py-3.5 text-sm font-bold transition hover:bg-surface-hover"
              >
                <TranslatedText id="marketing.hero.cta.secondary" />
              </a>
            </div>

            <div className="mt-10 flex flex-wrap gap-x-7 gap-y-3 text-sm font-medium text-muted">
              {([
                "marketing.hero.feature.files",
                "marketing.hero.feature.quiz",
                "marketing.hero.feature.progress",
              ] as const).map((item) => (
                  <span key={item} className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-success-soft text-success">
                      <CheckIcon />
                    </span>
                    <TranslatedText id={item} />
                  </span>
                ))}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-xl">
            <div className="absolute -inset-4 rotate-2 rounded-[2.25rem] border border-subtle/70 bg-action-soft/55" />
            <div className="theme-shadow relative overflow-hidden rounded-[2rem] border border-subtle bg-surface p-4 sm:p-6">
              <div className="flex items-center justify-between border-b border-subtle pb-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-action text-on-action">
                    <BrandLogo
                      variant="mark"
                      className="text-on-action"
                      logoClassName="h-5 w-5"
                    />
                  </span>
                  <div>
                    <p className="text-xs font-bold">Biologie celulară</p>
                    <p className="mt-0.5 text-[10px] text-muted">
                      Curs procesat de Reviss
                    </p>
                  </div>
                </div>
                <span className="rounded-md border border-success-border bg-success-soft px-3 py-1 text-[10px] font-bold text-success">
                  Gata de studiu
                </span>
              </div>

              <div className="grid gap-4 py-5 sm:grid-cols-[0.85fr_1.15fr]">
                <div className="rounded-2xl border border-subtle bg-app/70 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-muted">
                    Curs încărcat
                  </p>
                  <div className="mt-4 flex items-center gap-3 rounded-xl border border-subtle bg-surface p-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-danger-soft text-danger">
                      PDF
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold">
                        Celula_capitolul_3.pdf
                      </p>
                      <p className="mt-1 text-[10px] text-muted">28 pagini</p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    {[92, 78, 64].map((width) => (
                      <div
                        key={width}
                        className="h-2 rounded-full bg-surface-hover"
                        style={{ width: `${width}%` }}
                      />
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-subtle bg-app/70 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-muted">
                      Pachet generat
                    </p>
                    <SparkIcon />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {[
                      ["Rezumat", "6 min"],
                      ["Flashcard-uri", "24"],
                      ["Quiz-uri", "3"],
                      ["Concepte", "18"],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-xl border border-subtle bg-surface p-3"
                      >
                        <p className="text-lg font-bold">{value}</p>
                        <p className="mt-1 text-[10px] text-muted">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-info-border bg-info-soft p-4 text-info">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold">Următoarea sesiune</p>
                    <p className="mt-1 text-[10px] opacity-80">
                      12 flashcard-uri + quiz de 8 întrebări
                    </p>
                  </div>
                  <span className="rounded-md bg-info px-3 py-2 text-[10px] font-bold text-info-soft">
                    25 min
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-subtle bg-surface/55">
        <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-y divide-subtle px-5 sm:grid-cols-4 sm:divide-y-0 sm:px-8">
          {[
            ["Un singur curs", "rezumat, carduri și test"],
            ["Învățare activă", "nu citire pasivă"],
            ["Repetiție ghidată", "exact când ai nevoie"],
            ["Temă adaptivă", "confort zi și noapte"],
          ].map(([title, text]) => (
            <div key={title} className="px-4 py-7 text-center sm:px-6">
              <p className="font-serif text-lg font-semibold">{title}</p>
              <p className="mt-1 text-[11px] text-muted">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="study-use-cases-title"
        className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28"
      >
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div className="lg:sticky lg:top-28">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted">
              Pentru facultate, sesiune și examene
            </p>
            <h2
              id="study-use-cases-title"
              className="mt-4 max-w-xl font-serif text-4xl font-semibold leading-tight sm:text-5xl"
            >
              Când cursurile se adună, Reviss le transformă în pași clari.
            </h2>
            <p className="mt-5 max-w-lg text-sm leading-7 text-muted sm:text-base">
              Folosește Reviss când ai nevoie de rezumate AI din PDF-uri,
              flashcard-uri pentru repetare, quiz-uri personalizate și un mod
              mai simplu de a pregăti examenele la facultate.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {studyUseCases.map((item, index) => (
              <ScrollReveal
                key={item.title}
                direction={index % 2 === 0 ? "left" : "right"}
                delay={index * 60}
              >
                <article className="h-full rounded-[2rem] border border-subtle bg-surface p-5 transition hover:-translate-y-1 hover:border-action/25 sm:p-6">
                  <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-action/20 bg-action-soft text-action">
                    {index % 2 === 0 ? <SparkIcon /> : <CheckIcon />}
                  </span>
                  <h3 className="mt-6 font-serif text-2xl font-semibold">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-sm leading-7 text-muted">
                    {item.description}
                  </p>
                </article>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <section
        id="cum-functioneaza"
        className="mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-32"
      >
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted">
            Din material brut în progres clar
          </p>
          <h2 className="mt-4 font-serif text-4xl font-semibold leading-tight sm:text-5xl">
            Trei pași între curs și înțelegere.
          </h2>
          <p className="mt-5 text-sm leading-7 text-muted sm:text-base">
            Fără zeci de tab-uri și fără ore pierdute pregătind materiale.
            Reviss construiește spațiul de studiu, iar tu te concentrezi pe
            învățare.
          </p>
        </div>

        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          {workflow.map((item, index) => (
            <ScrollReveal
              key={item.step}
              direction={index % 2 === 0 ? "left" : "right"}
              delay={index * 70}
            >
              <article className="group h-full rounded-3xl border border-subtle bg-surface p-6 transition hover:-translate-y-1 hover:border-action/25 sm:p-8">
                <div className="flex items-center justify-between">
                  <span
                    className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${item.tone}`}
                  >
                    {item.icon}
                  </span>
                  <span className="font-serif text-2xl font-semibold text-muted/50">
                    {item.step}
                  </span>
                </div>
                <h3 className="mt-10 font-serif text-2xl font-semibold">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm leading-7 text-muted">
                  {item.description}
                </p>
              </article>
            </ScrollReveal>
          ))}
        </div>
      </section>

      <section className="overflow-hidden border-y border-subtle bg-action text-on-action">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:py-24">
          <ScrollReveal direction="left">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-on-action/60">
              O sesiune care știe ce urmează
            </p>
            <h2 className="mt-4 max-w-xl font-serif text-4xl font-semibold leading-tight sm:text-5xl">
              De la „am citit” la „pot explica”.
            </h2>
            <p className="mt-5 max-w-lg text-sm leading-7 text-on-action/70 sm:text-base">
              Platforma combină rezumatul cu testarea activă și progresul
              vizibil. Fiecare sesiune are un scop clar, nu doar încă o pagină
              de parcurs.
            </p>
            <Link
              href="/register"
              className="mt-8 inline-flex items-center gap-3 rounded-md bg-on-action px-5 py-3 text-sm font-bold text-action transition hover:opacity-90"
            >
              Creează primul pachet
              <ArrowIcon />
            </Link>
          </ScrollReveal>

          <ScrollReveal direction="right">
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                "Rezumat esențial",
                "Întrebări explicate",
                "Repetiție inteligentă",
                "Progres vizibil",
              ].map((title, index) => (
                <div
                  key={title}
                  className={`flex min-h-[12.5rem] flex-col items-center justify-center rounded-3xl border border-on-action/10 bg-on-action/5 p-6 text-center ${
                    index % 2 ? "sm:translate-y-6" : ""
                  }`}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-on-action/10">
                    {index % 2 ? <LayersIcon /> : <CheckIcon />}
                  </span>
                  <h3 className="mt-7 font-serif text-xl font-semibold">
                    {title}
                  </h3>
                </div>
              ))}
            </div>
          </ScrollReveal>
        </div>
      </section>

      <FlashcardStory />

      <section
        id="beneficii"
        className="mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-32"
      >
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted">
              Tot ce ai nevoie într-un singur loc
            </p>
            <h2 className="mt-4 max-w-2xl font-serif text-4xl font-semibold leading-tight sm:text-5xl">
              Construit pentru sesiune, colocviu și examen.
            </h2>
          </div>
          <p className="max-w-md text-sm leading-7 text-muted">
            Fiecare instrument este legat de același curs, astfel încât să nu
            pierzi contextul când treci de la înțelegere la exersare.
          </p>
        </div>

        <div className="mt-14 grid gap-5 lg:grid-cols-12">
          <ScrollReveal direction="left" className="lg:col-span-7">
            <article className="theme-shadow-card relative h-full min-h-[25rem] overflow-hidden rounded-[2rem] border border-subtle bg-surface p-6 sm:p-8">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">
                Quiz-uri cu feedback
              </p>
              <h3 className="mt-3 max-w-lg font-serif text-3xl font-semibold">
                Înțelegi răspunsul, nu doar scorul.
              </h3>
              <div className="mt-8 rounded-3xl border border-subtle bg-app/70 p-5">
                <p className="text-xs font-bold text-muted">
                  Care organit produce cea mai mare parte din ATP?
                </p>
                <div className="mt-4 space-y-2">
                  {["Ribozomul", "Mitocondria", "Aparatul Golgi"].map(
                    (answer, index) => (
                      <div
                        key={answer}
                        className={`flex items-center justify-between rounded-xl border px-4 py-3 text-xs font-semibold ${
                          index === 1
                            ? "border-success-border bg-success-soft text-success"
                            : "border-subtle bg-surface text-muted"
                        }`}
                      >
                        {answer}
                        {index === 1 ? <CheckIcon /> : null}
                      </div>
                    ),
                  )}
                </div>
                <div className="mt-4 rounded-xl border border-info-border bg-info-soft p-4 text-xs leading-6 text-info">
                  Mitocondria transformă energia nutrienților în ATP, forma de
                  energie folosită de celulă.
                </div>
              </div>
            </article>
          </ScrollReveal>

          <div className="grid gap-5 lg:col-span-5">
            <ScrollReveal direction="right">
              <article className="rounded-[2rem] border border-subtle bg-surface p-6 sm:p-8">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-success-border bg-success-soft text-success">
                  <ChartIcon />
                </span>
                <h3 className="mt-7 font-serif text-2xl font-semibold">
                  Progres fără presupuneri
                </h3>
                <p className="mt-3 text-sm leading-7 text-muted">
                  Vezi conceptele stăpânite, răspunsurile dificile și ce trebuie
                  repetat în următoarea sesiune.
                </p>
                <div className="mt-6 h-2 overflow-hidden rounded-full bg-surface-hover">
                  <div className="h-full w-[78%] rounded-full bg-action" />
                </div>
              </article>
            </ScrollReveal>

            <ScrollReveal direction="right" delay={80}>
              <article className="rounded-[2rem] border border-warning-border bg-warning-soft p-6 text-warning sm:p-8">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-warning/10">
                  <SparkIcon />
                </span>
                <h3 className="mt-7 font-serif text-2xl font-semibold">
                  Materialele tale rămân sursa
                </h3>
                <p className="mt-3 text-sm leading-7 opacity-80">
                  Întrebările și explicațiile pornesc din cursul încărcat, ca
                  studiul să rămână relevant pentru materia ta.
                </p>
              </article>
            </ScrollReveal>
          </div>
        </div>
      </section>

      <section
        id="abonamente"
        className="overflow-hidden border-y border-subtle bg-surface/55"
      >
        <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted">
              Abonamente simple, fără surprize
            </p>
            <h2 className="mt-4 text-balance font-serif text-4xl font-semibold leading-tight sm:text-5xl">
              Alege cât de intens vrei să înveți.
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-muted sm:text-base">
              Începi gratuit, iar când cursurile se adună poți trece la un plan
              cu mai mult spațiu, repetiție inteligentă și analiză de progres.
            </p>
            <div className="mt-7 inline-flex items-center gap-2 rounded-md border border-success-border bg-success-soft px-4 py-2 text-xs font-bold text-success">
              <CheckIcon />
              Poți anula sau schimba planul oricând
            </div>
          </div>

          <div className="mt-16 grid items-stretch gap-5 min-[900px]:grid-cols-3 min-[900px]:gap-0">
            {pricingPlans.map((plan, index) => (
              <ScrollReveal
                key={plan.name}
                direction={index === 2 ? "right" : "left"}
                delay={index * 70}
                className={
                  plan.featured ? "relative z-10 min-[900px]:-mx-px" : ""
                }
              >
                <article
                  className={`relative flex h-full flex-col overflow-hidden border p-6 sm:p-8 ${
                    plan.featured
                      ? "theme-shadow-action rounded-[2rem] border-action bg-action text-on-action min-[900px]:min-h-[36rem] min-[900px]:-translate-y-5"
                      : `min-h-[34rem] border-subtle bg-surface ${
                          index === 0
                            ? "rounded-[2rem] min-[900px]:rounded-r-none"
                            : "rounded-[2rem] min-[900px]:rounded-l-none"
                        }`
                  }`}
                >
                  {plan.featured ? (
                    <div className="absolute right-5 top-5 rounded-md bg-on-action px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-action">
                      Cea mai bună alegere
                    </div>
                  ) : null}

                  <div>
                    <p
                      className={`text-xs font-bold uppercase tracking-[0.18em] ${
                        plan.featured ? "text-on-action/60" : "text-muted"
                      }`}
                    >
                      {plan.name}
                    </p>
                    <p
                      className={`mt-4 min-h-14 text-sm leading-6 ${
                        plan.featured ? "text-on-action/70" : "text-muted"
                      }`}
                    >
                      {plan.description}
                    </p>
                  </div>

                  <div className="mt-8 flex flex-wrap items-end gap-x-2 gap-y-1">
                    {plan.oldPrice ? (
                      <span
                        className={`pb-1 text-lg font-black line-through ${
                          plan.featured ? "text-on-action/45" : "text-muted"
                        }`}
                      >
                        {plan.oldPrice}
                      </span>
                    ) : null}
                    <span className="font-serif text-6xl font-semibold leading-none">
                      {plan.price}
                    </span>
                    <span
                      className={`pb-1 text-sm font-bold ${
                        plan.featured ? "text-on-action/65" : "text-muted"
                      }`}
                    >
                      RON {plan.suffix}
                    </span>
                  </div>

                  {plan.discount ? (
                    <p
                      className={`mt-3 w-fit rounded-md px-3 py-1 text-xs font-black ${
                        plan.featured
                          ? "bg-on-action/12 text-on-action"
                          : "border border-success-border bg-success-soft text-success"
                      }`}
                    >
                      {plan.discount}
                    </p>
                  ) : null}

                  <div
                    className={`my-8 h-px ${
                      plan.featured ? "bg-on-action/15" : "bg-subtle"
                    }`}
                  />

                  <ul className="space-y-4">
                    {plan.features.map((feature) => (
                      <li
                        key={feature}
                        className={`flex items-start gap-3 text-sm leading-6 ${
                          plan.featured ? "text-on-action/80" : "text-muted"
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                            plan.featured
                              ? "bg-on-action/12 text-on-action"
                              : "bg-success-soft text-success"
                          }`}
                        >
                          <CheckIcon />
                        </span>
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={planDetailPath(plan.slug)}
                    className={`mt-auto inline-flex items-center justify-center gap-3 rounded-md px-5 py-3.5 text-sm font-bold transition ${
                      plan.featured
                        ? "bg-on-action text-action hover:opacity-90"
                        : "border border-subtle bg-app hover:bg-surface-hover"
                    }`}
                  >
                    Vezi detaliile planului
                    <ArrowIcon />
                  </Link>
                </article>
              </ScrollReveal>
            ))}
          </div>

          <p className="mt-8 text-center text-xs leading-6 text-muted">
            Plata se face lunar, fără perioadă contractuală.
          </p>
        </div>
      </section>

      <section className="border-y border-subtle bg-surface/55">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24">
          <ScrollReveal direction="left">
            <div className="relative overflow-hidden rounded-[2.25rem] border border-subtle bg-action px-6 py-14 text-center text-on-action sm:px-12 sm:py-20">
              <div className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full border border-on-action/10" />
              <div className="pointer-events-none absolute -bottom-32 -right-24 h-80 w-80 rounded-full bg-on-action/5 blur-2xl" />
              <div className="relative mx-auto max-w-3xl">
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-on-action/60">
                  Începe cu următorul tău curs
                </p>
                <h2 className="mt-4 text-balance font-serif text-4xl font-semibold leading-tight sm:text-6xl">
                  Începe simplu. Învață sigur.
                </h2>
                <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-on-action/70 sm:text-base">
                  Creează-ți contul și transformă primul material într-o sesiune
                  de studiu clară și activă.
                </p>
                <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                  <Link
                    href="/register"
                    className="inline-flex items-center justify-center gap-3 rounded-md bg-on-action px-6 py-3.5 text-sm font-bold text-action transition hover:opacity-90"
                  >
                    Creează cont gratuit
                    <ArrowIcon />
                  </Link>
                  <Link
                    href="/login"
                    className="inline-flex items-center justify-center rounded-md border border-on-action/20 px-6 py-3.5 text-sm font-bold transition hover:bg-on-action/10"
                  >
                    Am deja un cont
                  </Link>
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      <section
        id="intrebari"
        className="mx-auto max-w-4xl px-5 py-24 sm:px-8 sm:py-32"
      >
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted">
            Întrebări frecvente
          </p>
          <h2 className="mt-4 font-serif text-4xl font-semibold sm:text-5xl">
            Înainte să începi.
          </h2>
        </div>

        <div className="mt-12 space-y-3">
          {homepageFaq.map(([question, answer]) => (
            <details
              key={question}
              className="group rounded-2xl border border-subtle bg-surface px-5 py-4 open:bg-surface-hover/45 sm:px-6"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-bold">
                {question}
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-action-soft text-lg font-normal transition group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="max-w-2xl pb-2 pt-4 text-sm leading-7 text-muted">
                {answer}
              </p>
            </details>
          ))}
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
