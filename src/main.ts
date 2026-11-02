import curriculumJson from "../docs/curriculum.json";
import { APP_VERSION, type AppContext } from "./app/context";
import { clear, h } from "./app/dom";
import { parseRoute, routeQuery, type Route } from "./app/routes";
import { renderCalibrate } from "./app/screens/calibrate";
import { renderData } from "./app/screens/data";
import { renderHistory } from "./app/screens/history";
import { renderStart } from "./app/screens/start";
import { renderTrain } from "./app/screens/train";
import { validateCurriculum, type Curriculum } from "./core/protocol";
import { openDb } from "./data/db";
import { requestPersistence } from "./data/persist";

const root = document.getElementById("app") as HTMLElement;

function banner(text: string, ...extra: Node[]): HTMLElement {
  const b = h("div", { class: "banner", role: "alert" }, text, ...extra);
  document.body.prepend(b);
  return b;
}

async function boot(): Promise<void> {
  const curriculum = curriculumJson as unknown as Curriculum;
  const errs = validateCurriculum(curriculum);
  if (errs.length) {
    root.append(h("h1", {}, "nearpoint"), h("p", {}, "The curriculum is invalid:"), h("ul", {}, ...errs.map((e) => h("li", {}, e))));
    return;
  }
  const blocked: { el?: HTMLElement } = {};
  const db = await openDb({
    onBlocked: () => { blocked.el ??= banner("Close other nearpoint tabs to finish the update."); },
  });
  blocked.el?.remove();
  // DEVIATION: NearpointDb does not expose the IDBDatabase, so the "updated in another tab — reload"
  // banner cannot be wired to versionchange here (db.ts already closes the connection itself).

  const persistence = await requestPersistence();
  const ctx: AppContext = {
    db,
    curriculum,
    appVersion: APP_VERSION,
    persistence,
    navigate(r: Route, query?: string) {
      location.hash = query ? `#${r}?${query}` : `#${r}`;
    },
  };

  const render = async () => {
    const route = parseRoute(location.hash);
    document.body.classList.toggle("training", route === "train");
    clear(root);
    try {
      switch (route) {
        case "start": await renderStart(ctx, root); break;
        case "calibrate": await renderCalibrate(ctx, root); break;
        case "history": await renderHistory(ctx, root); break;
        case "data": await renderData(ctx, root); break;
        case "train": await renderTrain(ctx, root, routeQuery(location.hash)); break;
      }
    } catch (e) {
      clear(root);
      root.append(h("h1", {}, "nearpoint"), h("p", {}, `Something went wrong: ${e instanceof Error ? e.message : String(e)}`));
    }
  };
  window.addEventListener("hashchange", () => void render());
  await render();
}

void boot();
