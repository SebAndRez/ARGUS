import { demoQuakeSenseSignals } from "@/data/quakesenseDemo";
import { clusterSignalsByTimeAndArea } from "@/lib/quakesense/quakesenseClusterEngine";
import type { QuakeSenseCitizenSignal } from "@/types/quakesense";

const globalStore = globalThis as typeof globalThis & {
  __argusQuakeSenseSignals?: QuakeSenseCitizenSignal[];
};

export function getQuakeSenseSignals(includeDemo = true) {
  const live = globalStore.__argusQuakeSenseSignals ?? [];
  return includeDemo ? [...demoQuakeSenseSignals, ...live] : live;
}

export function addQuakeSenseSignal(signal: QuakeSenseCitizenSignal) {
  const current = globalStore.__argusQuakeSenseSignals ?? [];
  globalStore.__argusQuakeSenseSignals = [signal, ...current].slice(0, 250);
  return signal;
}

export function getQuakeSenseClusters(includeDemo = true) {
  return clusterSignalsByTimeAndArea(getQuakeSenseSignals(includeDemo));
}
