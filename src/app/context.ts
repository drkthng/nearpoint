import type { Curriculum } from "../core/protocol";
import type { NearpointDb } from "../data/db";
import type { Route } from "./routes";
import pkg from "../../package.json";

export const APP_VERSION: string = pkg.version;

export interface AppContext {
  db: NearpointDb;
  curriculum: Curriculum;
  appVersion: string;
  navigate(r: Route, query?: string): void;
  persistence: string;
}
