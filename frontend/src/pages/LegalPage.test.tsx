import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { CONTACT_EMAIL } from '../config/legal';
import { ar } from '../i18n/ar';
import { en } from '../i18n/en';
import { LocaleProvider } from '../i18n';
import { LegalPage } from './LegalPage';

const show = (document: 'privacy' | 'terms') =>
  render(
    <MemoryRouter>
      <LocaleProvider>
        <LegalPage document={document} />
      </LocaleProvider>
    </MemoryRouter>,
  );

beforeEach(() => localStorage.clear());

describe.each(['privacy', 'terms'] as const)('the %s page', (document) => {
  it('has one h1, and a way to reach whoever runs the site', () => {
    show(document);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('link', { name: CONTACT_EMAIL }).getAttribute('href')).toBe(
      `mailto:${CONTACT_EMAIL}`,
    );
  });

  /* The dictionary type checks the keys, but not that a translation dropped a paragraph. */
  it('says the same amount in both languages', () => {
    const shape = (dictionary: typeof en) =>
      dictionary.legal[document].sections.map((section) => section.paragraphs.length);
    expect(shape(ar)).toEqual(shape(en));
  });
});

describe('what the pages promise', () => {
  it('names every outside service the site sends data to', () => {
    show('privacy');
    const text = document.body.textContent;
    for (const service of ['Photon', 'CARTO', 'MongoDB Atlas', 'Resend', 'Arcjet', 'Hetzner']) {
      expect(text).toContain(service);
    }
  });

  it('says the travel cards are a demonstration', () => {
    show('terms');
    expect(screen.getByRole('heading', { name: 'Demonstration travel cards' })).toBeTruthy();
  });
});
