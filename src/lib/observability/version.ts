import packageJson from "../../../package.json";

/** Versión declarada en package.json — nunca hardcodeada en dos lugares. */
export const ARGUS_VERSION: string = packageJson.version;
