# ARGUS Source Reliability

ARGUS separates source availability from source reliability. A source can be
visible in the UI while still disabled, manual-only or not configured.

## Source Classes

- official: public agencies, emergency authorities or institutional feeds.
- technical: scientific, humanitarian or sensor-oriented feeds.
- osint: open-source signals requiring verification.
- major_media: recognized media used as secondary evidence.
- manual_reference: human reference only; no automated extraction.

## Conflict And Crisis Sources

- GDELT: active, free, open-source signal. Use as context, not final truth.
- ReliefWeb: active humanitarian/disaster context. Good for impact narratives.
- Liveuamap: manual reference only. ARGUS does not scrape it.
- ACLED: disabled until an API key and terms review exist.
- Major media: secondary evidence, not an operational command source.

## Reliability Rules

- Do not infer intent or assign blame from one source.
- Do not claim control territory with certainty from open-source signals.
- Do not invent coordinates when a provider lacks location precision.
- Do not show a marker as official unless the source category supports it.
- Always keep user-facing wording neutral and defensive.

## Future Work

- Source health history.
- Analyst approval state.
- Evidence hashes and audit records.
- Persistent snapshots for provider responses.
- Cross-source confidence scoring with explicit uncertainty.
