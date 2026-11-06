import { PageContainer } from '../components/PageContainer';
import { usePageTitle } from '../app/usePageTitle';
import { CONTACT_EMAIL, LEGAL_UPDATED } from '../config/legal';
import { formatDate, useLocale } from '../i18n';

/** The privacy policy and the terms: one document each, written in the dictionaries. */
export function LegalPage({ document }: { document: 'privacy' | 'terms' }) {
  const { locale, strings, t } = useLocale();
  const { title, intro, sections } = strings.legal[document];
  usePageTitle(t(title));

  return (
    <PageContainer>
      <article className="flex max-w-prose flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight text-balance">{t(title)}</h1>
          <p className="text-content-muted text-sm">
            {t(strings.legal.updated, { date: formatDate(LEGAL_UPDATED, locale) })}
          </p>
          <p className="text-pretty">{t(intro)}</p>
        </header>

        {sections.map((section) => (
          <section key={section.heading} className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold text-balance">{t(section.heading)}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="text-pretty">
                {t(paragraph)}
              </p>
            ))}
          </section>
        ))}

        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">{t(strings.legal.contactHeading)}</h2>
          <p className="text-pretty">{t(strings.legal.contactBody)}</p>
          <p>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              dir="ltr"
              className="rounded-control text-brand-500 focus-visible:outline-brand-500 underline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {CONTACT_EMAIL}
            </a>
          </p>
        </section>
      </article>
    </PageContainer>
  );
}

export function PrivacyPage() {
  return <LegalPage document="privacy" />;
}

export function TermsPage() {
  return <LegalPage document="terms" />;
}
