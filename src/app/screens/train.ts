import type { AppContext } from "../context";
import { clear, h } from "../dom";

/** Stub: replaced by the next work order. */
export async function renderTrain(ctx: AppContext, root: HTMLElement, _query: URLSearchParams): Promise<void> {
  clear(root);
  root.append(
    h("p", {}, "Training screen — coming in the next step"),
    h("button", { onclick: () => ctx.navigate("start") }, "Back"),
  );
}
