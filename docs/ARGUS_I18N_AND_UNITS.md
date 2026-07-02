# ARGUS I18N And Units

## Locale Strategy

ARGUS now has a scalable i18n foundation:

- `src/lib/i18n/locale.ts`
- `src/lib/i18n/detectLocale.ts`
- `src/lib/i18n/dictionaries.ts`
- `src/lib/i18n/format.ts`
- `src/hooks/useI18n.ts`
- `src/locales/es.json`
- `src/locales/en.json`
- `src/locales/pt.json`

Fallback order:

1. User override when available.
2. Browser/device language.
3. Spanish.
4. English as technical fallback.

## UTF-8

Display UI must preserve Ñ, accents, punctuation and native characters. Normalization/removal of diacritics is allowed only for search, slugs or IDs.

`scripts/auditEncodingText.ts` scans for mojibake and risky normalization patterns.

## Units

ARGUS defaults to metric units except for countries/locales that normally use US customary/imperial units.

- Chile and most countries: metric.
- United States and related territories: US customary.
- Liberia/Myanmar: imperial fallback.
- United Kingdom remains metric by default until a product decision changes it.

Utilities live in `src/lib/units/unitSystem.ts`.

