import { getContext, setContext } from "svelte";
import type { createClientApi } from "./client-api.svelte";
import type { ManualHoldingsStore } from "./manual-holdings.svelte";
import type { MergedPortfolio } from "./merged-portfolio.svelte";

export type AppContext = {
  client: ReturnType<typeof createClientApi>;
  manualStore: ManualHoldingsStore;
  merged: MergedPortfolio;
};

const KEY = Symbol("app-context");

export function setAppContext(ctx: AppContext) {
  setContext(KEY, ctx);
}

export function getAppContext(): AppContext {
  return getContext<AppContext>(KEY);
}
