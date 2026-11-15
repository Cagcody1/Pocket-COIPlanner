import { describe, expect, it } from "vitest";
import type { ResearchNode } from "../src/data/schema";
import { isAvailable, researchPlan } from "../src/engine/unlocks";

const n = (id: string, parents: string[], sec: number, anyParent = false): ResearchNode => ({ id, name: id, durationSec: sec, parents, x: 0, y: 0, unlocks: [], anyParent });
const tree = [n("A", [], 10), n("B", ["A"], 20), n("C", ["A"], 30), n("D", ["B", "C"], 40), n("X", [], 500), n("E", ["B", "X"], 5, true)];

describe("research plan", () => {
  it("lists prerequisites first and skips what is done", () => {
    const p = researchPlan(tree, ["D"]);
    expect(p.order.map((x) => x.id)).toEqual(["A", "B", "C", "D"]);
    expect(p.seconds).toBe(100);
    expect(researchPlan(tree, ["D"], new Set(["A", "B"])).order.map((x) => x.id)).toEqual(["C", "D"]);
  });
  it("picks the cheapest parent for any-parent nodes", () => {
    expect(researchPlan(tree, ["E"]).order.map((x) => x.id)).toEqual(["A", "B", "E"]);
    expect(researchPlan(tree, ["E"], new Set(["X"])).order.map((x) => x.id)).toEqual(["E"]);
  });
  it("knows what is available now", () => {
    const done = new Set(["A"]);
    expect(tree.filter((x) => isAvailable(x, done)).map((x) => x.id)).toEqual(["B", "C", "X"]);
    expect(isAvailable(tree[0], done)).toBe(false);
  });
});
