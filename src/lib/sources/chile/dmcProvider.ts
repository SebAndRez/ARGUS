import type { ChileOfficialAlertRaw } from "@/lib/sources/chile/senapredProvider";

/**
 * DMC (Dirección Meteorológica de Chile / meteochile.gob.cl) has no
 * documented public JSON API — investigated this session: it's a legacy
 * JSF/PrimeFaces portal (connection resets under a plain client, menu
 * navigation is rendered client-side, no scrapable HTML content in the
 * initial response). Reliably scraping it would need Playwright (a new,
 * heavy dependency) with an uncertain outcome against a portal not designed
 * to be machine-read.
 *
 * Per product decision: ARGUS does not claim a direct DMC feed. Instead,
 * SENAPRED's own alert `contenido` already quotes DMC's technical bulletins
 * verbatim ("De acuerdo con la información proporcionada por la Dirección
 * Meteorológica de Chile (DMC)..."), so DMC surfaces as
 * `officialAuthorityMentioned: ["DMC"]` secondary evidence extracted from
 * SENAPRED's real text — never as `sourceType: "official"` DMC attribution,
 * since ARGUS never actually read DMC directly (Caso A/B discipline).
 */
export const DMC_PROVIDER_STATUS = "no_direct_feed" as const;

const DMC_MENTION_PATTERN = /direcci[oó]n meteorol[oó]gica de chile|\bdmc\b/i;

export type DmcMentionEvidence = {
  officialAuthorityMentioned: ["DMC"];
  excerpt: string;
};

/** Extracts a DMC-mention evidence snippet from a raw SENAPRED alert's body, if DMC is actually cited in it. Returns `null` if DMC isn't mentioned — never fabricates a mention. */
export function extractDmcMentionEvidence(alert: Pick<ChileOfficialAlertRaw, "contenido">): DmcMentionEvidence | null {
  const text = alert.contenido ?? "";
  const plainText = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!DMC_MENTION_PATTERN.test(plainText)) return null;

  const matchIndex = plainText.search(DMC_MENTION_PATTERN);
  const start = Math.max(0, matchIndex - 80);
  const excerpt = plainText.slice(start, start + 280).trim();
  return { officialAuthorityMentioned: ["DMC"], excerpt };
}
