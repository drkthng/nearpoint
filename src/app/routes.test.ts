import { describe, expect, it } from "vitest";
import { backupFileName, daysBetween, parseRoute, routeQuery } from "./routes";

describe("routes", () => {
  it("parses routes", () => {
    expect(parseRoute("")).toBe("start");
    expect(parseRoute("#")).toBe("start");
    expect(parseRoute("#nonsense")).toBe("start");
    expect(parseRoute("#calibrate")).toBe("calibrate");
    expect(parseRoute("#/history")).toBe("history");
    expect(parseRoute("#train?quick=1")).toBe("train");
    expect(parseRoute("#/data?x=1&y=2")).toBe("data");
    expect(parseRoute("#tests")).toBe("tests");
    expect(parseRoute("#acuity?crowding=uncrowded&timing=timed")).toBe("acuity");
    expect(parseRoute("#reading")).toBe("reading");
    expect(parseRoute("#contrast?quick=1")).toBe("contrast");
  });
  it("parses the query", () => {
    expect(routeQuery("#train?quick=1").get("quick")).toBe("1");
    expect(routeQuery("#/train?a=1&b=2").get("b")).toBe("2");
    expect(routeQuery("#train").toString()).toBe("");
    expect(routeQuery("").toString()).toBe("");
  });
  it("names backup files", () => {
    expect(backupFileName("2026-11-02T10:11:12.000Z")).toBe("nearpoint-backup-2026-11-02.json");
  });
  it("counts whole days", () => {
    expect(daysBetween("2026-11-01T00:00:00Z", "2026-11-08T00:00:00Z")).toBe(7);
    expect(daysBetween("2026-11-01T12:00:00Z", "2026-11-08T11:59:59Z")).toBe(6);
    expect(daysBetween("2026-11-01T00:00:00Z", "2026-11-01T23:59:59Z")).toBe(0);
  });
});
