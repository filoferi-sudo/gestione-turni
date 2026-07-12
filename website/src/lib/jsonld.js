// Builder di dati strutturati JSON-LD. Le pagine passano il risultato a <Base jsonLd={...} />
// (una o più schede). Organization è iniettata sitewide da Base.astro.
// Vincolo (§6): NIENTE prezzo nello schema SoftwareApplication finché la cifra non è definitiva.
import { site } from '../data/site.js';

const ORIGIN = site.url; // https://planivo.it
const abs = (path = '/') => new URL(path, ORIGIN).href;

export function organization() {
  const sameAs = Object.values(site.social || {}).filter(Boolean);
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: site.name,
    url: ORIGIN,
    logo: abs('/favicon.svg'),
    description:
      'Software italiano per la gestione di turni e sostituzioni del personale in ristoranti, bar, piscine e palestre.',
    areaServed: 'IT',
    ...(sameAs.length ? { sameAs } : {}),
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: site.phoneIntl,
      email: site.email,
      contactType: 'sales',
      areaServed: 'IT',
      availableLanguage: ['Italian'],
    },
  };
}

export function softwareApplication() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: site.name,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    url: ORIGIN,
    description:
      'Planivo organizza turni e sostituzioni del personale: calendario per sede e area, copertura del fabbisogno, sostituzioni tra personale idoneo. Web app, nessuna installazione.',
    inLanguage: 'it-IT',
    publisher: { '@type': 'Organization', name: site.name, url: ORIGIN },
    // Nessun `offers`/prezzo finché la cifra non è definitiva (vincolo §6).
  };
}

export function faqPage(items = []) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((i) => ({
      '@type': 'Question',
      name: i.q,
      acceptedAnswer: { '@type': 'Answer', text: i.a },
    })),
  };
}

// items: [{ name, path }]  (path relativo; l'ultimo è la pagina corrente)
export function breadcrumb(items = []) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: abs(it.path),
    })),
  };
}

export function blogPosting({ title, description, path, datePublished, dateModified }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title,
    description,
    inLanguage: 'it-IT',
    mainEntityOfPage: { '@type': 'WebPage', '@id': abs(path) },
    datePublished,
    ...(dateModified ? { dateModified } : {}),
    author: { '@type': 'Organization', name: site.name, url: ORIGIN },
    publisher: {
      '@type': 'Organization',
      name: site.name,
      logo: { '@type': 'ImageObject', url: abs('/favicon.svg') },
    },
  };
}
