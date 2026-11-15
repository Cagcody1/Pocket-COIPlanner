import type { GameData, ResearchNode } from "../data/schema";

/** Research node that unlocks this recipe, falling back to the one that unlocks its machine. */
export function recipeResearch(data: GameData, recipeId: string, machineId: string): string | undefined {
  return data.recipes.find((r) => r.id === recipeId)?.unlockedBy ?? data.machines.find((m) => m.id === machineId)?.unlockedBy;
}

/**
 * Everything that has to be researched to run the given recipes/machines: the unlocking nodes plus all their prerequisites,
 * in tree order (prerequisites first). Nodes in `done` are left out of `todo` but still listed in `all`.
 */
export function requiredResearch(data: GameData, items: { recipeId?: string; machineId: string }[], done: Set<string> = new Set()) {
  const byId = new Map((data.research ?? []).map((n) => [n.id, n]));
  const direct = new Set<string>();
  for (const it of items) {
    const id = (it.recipeId && recipeResearch(data, it.recipeId, it.machineId)) || data.machines.find((m) => m.id === it.machineId)?.unlockedBy;
    if (id) direct.add(id);
  }
  const all: ResearchNode[] = [], seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return; seen.add(id);
    const n = byId.get(id); if (!n) return;
    for (const p of n.parents) visit(p);
    all.push(n);
  };
  direct.forEach(visit);
  const todo = all.filter((n) => !done.has(n.id));
  return { direct, all, todo, seconds: todo.reduce((s, n) => s + n.durationSec, 0) };
}

/** A node can be researched now: nothing left to do before it (any one parent for "any parent" nodes). */
export function isAvailable(n: ResearchNode, done: Set<string>): boolean {
  if (done.has(n.id)) return false;
  if (!n.parents.length) return true;
  return n.anyParent ? n.parents.some((p) => done.has(p)) : n.parents.every((p) => done.has(p));
}

/**
 * What to research, in order, to reach the goal nodes. Nodes already `done` are skipped; for "any one parent" nodes the
 * cheapest way in is chosen. Returns prerequisites first, goals last.
 */
export function researchPlan(nodes: ResearchNode[], goals: string[], done: Set<string> = new Set()) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const cost = new Map<string, number>(), pick = new Map<string, string[]>();
  const need = (id: string, trail: Set<string>): number => {
    const n = byId.get(id);
    if (!n || done.has(id)) return 0;
    if (cost.has(id)) return cost.get(id)!;
    if (trail.has(id)) return 0;
    trail.add(id);
    let parents: string[] = n.parents.filter((p) => byId.has(p));
    if (n.anyParent && parents.length && !parents.some((p) => done.has(p))) {
      let best = parents[0], bc = Infinity;
      for (const p of parents) { const c = need(p, trail); if (c < bc) { bc = c; best = p; } }
      parents = [best];
    } else if (n.anyParent) parents = [];
    pick.set(id, parents);
    // upper bound that counts shared prerequisites more than once is fine for choosing between parents
    const c = n.durationSec + parents.reduce((s, p) => s + need(p, trail), 0);
    trail.delete(id); cost.set(id, c);
    return c;
  };
  const order: ResearchNode[] = [], seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id) || done.has(id) || !byId.has(id)) return; seen.add(id);
    need(id, new Set());
    for (const p of pick.get(id) ?? []) visit(p);
    order.push(byId.get(id)!);
  };
  goals.forEach(visit);
  return { order, seconds: order.reduce((s, n) => s + n.durationSec, 0) };
}
