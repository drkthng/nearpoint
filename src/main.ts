import curriculumJson from "../docs/curriculum.json";
import { APP_VERSION, type AppContext } from "./app/context";
import { clear, h } from "./app/dom";
import { parseRoute, routeQuery, type Route } from "./app/routes";
import { renderCalibrate } from "./app/screens/calibrate";
import { renderData } from "./app/screens/data";
import { renderHistory } from "./app/screens/history";
import { renderAcuity } from "./app/screens/outcome-acuity";
import { renderContrast } from "./app/screens/outcome-contrast";
import { renderOutcomeMenu } from "./app/screens/outcome-menu";
import { renderReading } from "./app/screens/outcome-reading";
import { renderStart } from "./app/screens/start";
import { leaveTraining, renderTrain } from "./app/screens/train";
import { validateCurriculum, type Curriculum } from "./core/protocol";
import { openDb } from "./data/db";
import type { SessionRow } from "./data/schema";
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
    onVersionChange: () => {
      banner("nearpoint was updated in another tab. ", h("button", { onclick: () => location.reload() }, "Reload"));
    },
  });
  blocked.el?.remove();

  // No session can be running at boot: anything still "in-progress" was interrupted.
  try {
    for (const s of await db.all<SessionRow>("sessions")) {
      if (s.status === "in-progress") {
        await db.put("sessions", {
          ...s,
          id: s.id as number,
          status: "aborted",
          endedAt: new Date().toISOString(),
          abortReason: "interrupted (app closed or reloaded)",
        });
      }
    }
  } catch {
    /* best effort */
  }

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
        case "tests": await renderOutcomeMenu(ctx, root); break;
        case "acuity": await renderAcuity(ctx, root, routeQuery(location.hash)); break;
        case "reading": await renderReading(ctx, root, routeQuery(location.hash)); break;
        case "contrast": await renderContrast(ctx, root, routeQuery(location.hash)); break;
      }
    } catch (e) {
      clear(root);
      root.append(h("h1", {}, "nearpoint"), h("p", {}, `Something went wrong: ${e instanceof Error ? e.message : String(e)}`));
    }
  };
  // Leaving #train mid-session: wait until the session is saved as aborted before rendering the next route.
  window.addEventListener("hashchange", () => void leaveTraining().then(render));
  await render();
}

void boot();
