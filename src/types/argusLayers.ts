/**
 * ARGUS layer policy types.
 *
 * Every map layer has two independent flags instead of one:
 * - `dataActive`: whether ARGUS fetches/processes that source at all.
 * - `visible`: whether the user currently sees it rendered on the map.
 *
 * Always-on realtime layers must always have `dataActive: true` — the user
 * can hide them visually, but can never stop ARGUS from listening to them.
 * This is what the previous (reverted) implementation got wrong: it only
 * had one boolean, so making a layer "always on" also meant permanently
 * forcing it visible/undisableable, which overloaded the mobile map UI.
 */

export type ArgusLayerDataMode = "realtime" | "sensor" | "context";

export interface ArgusLayerPolicyEntry {
  id: string;
  mode: ArgusLayerDataMode;
  /** Whether ARGUS keeps fetching/processing this source regardless of user preference. */
  dataActive: boolean;
  /** Default visual state on first load. */
  defaultVisible: boolean;
  /** Whether the user is allowed to turn data processing off entirely. */
  userDisableDataAllowed: boolean;
  /** Whether the user is allowed to hide it visually (map rendering only). */
  userHideVisualAllowed: boolean;
}

export type ArgusLayerFlags<TLayerId extends string = string> = Partial<
  Record<TLayerId, boolean>
>;
