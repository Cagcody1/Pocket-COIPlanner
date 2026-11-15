import type { GameData, ResearchNode } from "../data/schema";
import { isAvailable, researchPlan } from "../engine/unlocks";
import { esc, pref } from "./store";

const CW = 190, RH = 66, NW = 168, NH = 50, PAD = 20;
const dur = (s: number) => (s >= 3600 ? (s / 3600).toFixed(1) + " h" : s >= 60 ? Math.round(s / 60) + " min" : Math.round(s) + " s");

/** The research tree of the player's own game on the game's grid: zoom, search and jump, progress marks, and a plan for any goal. */
export function mountResearch(el: HTMLElement, getData: () => GameData) {
  let sel: string | null = null, q = "", focusQ = false, center: string | null = null, onlyAvail = false, showSave = false;
  let zoom = pref.get<number>("coi-research-zoom", 0.7);
  let done = new Set<string>(pref.get<string[]>("coi-research-done", []));
  const save = () => pref.set("coi-research-done", [...done]);

  function render() {
    const all = getData().research ?? [];
    if (!all.length) {
      el.innerHTML = `<div class="panel"><h2>Research tree</h2><p class="hint">The bundled data has no research tree. Import an export from your own game on the <b>Game data</b> tab (needs exporter 0.1.5 or newer) and the whole tree appears here.</p></div>`;
      return;
    }
    const byId = new Map(all.map((n) => [n.id, n]));
    const kids = new Map<string, string[]>();
    for (const n of all) for (const p of n.parents) (kids.get(p) ?? kids.set(p, []).get(p)!).push(n.id);
    // entries the game leaves out of its tree: stacked at 0,0 with no links and nothing to unlock
    const unplaced = all.filter((n) => n.x === 0 && n.y === 0 && !n.parents.length && !(kids.get(n.id) ?? []).length && !n.unlocks.length);
    const hidden = new Set(unplaced.map((n) => n.id));
    const nodes = all.filter((n) => !hidden.has(n.id));
    const minX = Math.min(...nodes.map((n) => n.x)), minY = Math.min(...nodes.map((n) => n.y));
    const pos = (n: ResearchNode) => ({ x: PAD + ((n.x - minX) / 4) * CW, y: PAD + (n.y - minY) * RH });
    const W = PAD * 2 + ((Math.max(...nodes.map((n) => n.x)) - minX) / 4) * CW + NW, H = PAD * 2 + (Math.max(...nodes.map((n) => n.y)) - minY) * RH + NH;
    // what the selected node needs (ancestors) and opens up (descendants)
    const rel = new Set<string>();
    if (sel) {
      const up = (id: string) => { for (const p of byId.get(id)?.parents ?? []) if (!rel.has(p)) { rel.add(p); up(p); } };
      const down = (id: string) => { for (const c of kids.get(id) ?? []) if (!rel.has(c)) { rel.add(c); down(c); } };
      up(sel); down(sel); rel.add(sel);
    }
    const matchText = (n: ResearchNode) => n.name.toLowerCase().includes(q) || n.unlocks.some((u) => (u.title ?? u.id).toLowerCase().includes(q));
    const matches = q.length > 1 ? all.filter(matchText) : [];
    const matchIds = new Set(matches.map((n) => n.id));
    const edges = nodes.flatMap((n) => n.parents.filter((p) => byId.has(p) && !hidden.has(p)).map((p) => {
      const a = pos(byId.get(p)!), b = pos(n), x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2, mx = (x1 + x2) / 2;
      const hot = sel && rel.has(p) && rel.has(n.id);
      return `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" fill="none" stroke="${hot ? "var(--accent, #d9822b)" : done.has(p) && done.has(n.id) ? "var(--good)" : "var(--muted)"}" stroke-width="${hot ? 2.6 : 1.2}" opacity="${sel && !hot ? 0.15 : hot ? 1 : 0.55}"/>`;
    })).join("");
    const boxes = nodes.map((n) => {
      const p = pos(n), avail = isAvailable(n, done), faded = (sel && !rel.has(n.id)) || (onlyAvail && !avail && !done.has(n.id));
      return `<button class="rnode${n.id === sel ? " sel" : ""}${done.has(n.id) ? " done" : avail ? " avail" : ""}${matchIds.has(n.id) ? " hit" : ""}" data-id="${esc(n.id)}" title="${esc(n.name)}" style="left:${p.x}px;top:${p.y}px;width:${NW}px;height:${NH}px;${faded ? "opacity:.28" : ""}"><b>${esc(n.name)}</b><span>${dur(n.durationSec)}${n.unlocks.length ? " · " + n.unlocks.length + " unlock" + (n.unlocks.length > 1 ? "s" : "") : ""}${done.has(n.id) ? " · ✓" : avail ? " · ready" : ""}</span></button>`;
    }).join("");
    const total = nodes.reduce((s, n) => s + n.durationSec, 0), left = nodes.filter((n) => !done.has(n.id)).reduce((s, n) => s + n.durationSec, 0);
    const ready = nodes.filter((n) => isAvailable(n, done)).length;
    const chips = matches.slice(0, 14).map((n) => {
      const u = n.name.toLowerCase().includes(q) ? "" : n.unlocks.find((x) => (x.title ?? x.id).toLowerCase().includes(q));
      return `<button class="btn rgo" data-go="${esc(n.id)}">${esc(n.name)}${u ? ` <small>unlocks ${esc(u.title ?? u.id.split(":").pop()!)}</small>` : ""}</button>`;
    }).join(" ");
    const d = sel ? byId.get(sel) : null;
    el.innerHTML = `<div class="panel"><h2>Research tree</h2>
      <div class="toolbar"><input id="rQ" type="search" placeholder="Search research, machines, recipes…" value="${esc(q)}" style="min-width:16rem">
        <label class="hint">Zoom <input id="rZ" type="range" min="25" max="120" value="${Math.round(zoom * 100)}" style="width:7rem"></label>
        <button class="btn" id="rFit">Fit width</button>
        <label class="hint"><input type="checkbox" id="rAvail" ${onlyAvail ? "checked" : ""}> Ready to research only</label>
        <button class="btn" id="rSaveBtn">${showSave ? "Hide" : "Save / load"} progress</button>
        ${done.size ? `<button class="btn" id="rClear">Clear done marks</button>` : ""}</div>
      <p class="hint">${nodes.length} nodes · <b>${done.size}</b> done · <b>${ready}</b> ready to research · ${dur(left)} of ${dur(total)} left (before lab speed).
        <span class="rkey done">done</span> <span class="rkey avail">ready</span> <span class="rkey">locked</span></p>
      ${q.length > 1 ? `<div class="box">${matches.length ? `${matches.length} match${matches.length > 1 ? "es" : ""}: ${chips}${matches.length > 14 ? " …" : ""}` : "Nothing matches."}</div>` : ""}
      ${showSave ? `<div class="box"><p class="hint">Your done list, one research id per line. Copy it to keep or share, or paste a list here and load it.</p><textarea id="rList" style="width:100%;height:6rem;font:12px ui-monospace,monospace">${esc([...done].join("\n"))}</textarea><p><button class="btn" id="rLoad">Load this list</button></p></div>` : ""}
      <div class="rwrap"><div style="width:${W * zoom}px;height:${H * zoom}px"><div class="rcanvas" style="width:${W}px;height:${H}px;transform:scale(${zoom});transform-origin:0 0"><svg width="${W}" height="${H}">${edges}</svg>${boxes}</div></div></div>
      ${d ? detail(d, byId, kids, hidden) : `<p class="hint">Click a node to highlight what it needs and opens up and to plan it. Double-click marks it researched. Drag the background to move around.</p>`}
      ${unplaced.length ? `<details style="margin-top:10px"><summary class="hint">${unplaced.length} research entries are not part of the game's tree (no position, links or unlocks)</summary><p class="hint">${unplaced.map((n) => esc(n.name)).join(", ")}</p></details>` : ""}</div>`;

    const wrap = el.querySelector<HTMLElement>(".rwrap")!;
    const keep = scrollMemo;
    if (center && byId.has(center) && !hidden.has(center)) { const p = pos(byId.get(center)!); wrap.scrollLeft = (p.x + NW / 2) * zoom - wrap.clientWidth / 2; wrap.scrollTop = (p.y + NH / 2) * zoom - wrap.clientHeight / 2; center = null; }
    else { wrap.scrollLeft = keep.l; wrap.scrollTop = keep.t; }
    wrap.onscroll = () => { scrollMemo = { l: wrap.scrollLeft, t: wrap.scrollTop }; };
    // drag the background to pan
    wrap.onpointerdown = (e) => {
      if ((e.target as HTMLElement).closest(".rnode")) return;
      const sx = e.clientX, sy = e.clientY, l = wrap.scrollLeft, t = wrap.scrollTop;
      wrap.setPointerCapture(e.pointerId); wrap.style.cursor = "grabbing";
      wrap.onpointermove = (m) => { wrap.scrollLeft = l - (m.clientX - sx); wrap.scrollTop = t - (m.clientY - sy); };
      wrap.onpointerup = () => { wrap.onpointermove = null; wrap.onpointerup = null; wrap.style.cursor = ""; };
    };
    const qi = el.querySelector<HTMLInputElement>("#rQ")!;
    if (focusQ) { qi.focus(); qi.setSelectionRange(qi.value.length, qi.value.length); focusQ = false; }
    qi.oninput = () => { q = qi.value.trim().toLowerCase(); focusQ = true; render(); };
    qi.onkeydown = (e) => { if (e.key === "Enter" && matches.length) { sel = matches[0].id; center = sel; render(); } };
    const z = el.querySelector<HTMLInputElement>("#rZ")!;
    z.onchange = () => { zoom = Number(z.value) / 100; pref.set("coi-research-zoom", zoom); render(); };
    el.querySelector<HTMLElement>("#rFit")!.onclick = () => { zoom = Math.max(0.25, Math.min(1.2, (wrap.clientWidth - 4) / W)); pref.set("coi-research-zoom", zoom); scrollMemo = { l: 0, t: scrollMemo.t }; render(); };
    el.querySelector<HTMLInputElement>("#rAvail")!.onchange = (e) => { onlyAvail = (e.target as HTMLInputElement).checked; render(); };
    el.querySelector<HTMLElement>("#rSaveBtn")!.onclick = () => { showSave = !showSave; render(); };
    el.querySelector<HTMLElement>("#rClear")?.addEventListener("click", () => { done = new Set(); save(); render(); });
    el.querySelector<HTMLElement>("#rLoad")?.addEventListener("click", () => {
      const ids = (el.querySelector<HTMLTextAreaElement>("#rList")!.value).split(/[\s,;]+/).filter((s) => byId.has(s));
      done = new Set(ids); save(); render();
    });
    el.querySelectorAll<HTMLElement>("[data-go]").forEach((b) => (b.onclick = () => { sel = b.dataset.go!; center = sel; render(); }));
    el.querySelectorAll<HTMLElement>(".rnode").forEach((b) => {
      b.onclick = () => { sel = sel === b.dataset.id ? null : b.dataset.id!; render(); };
      b.ondblclick = () => { const id = b.dataset.id!; done.has(id) ? done.delete(id) : done.add(id); save(); render(); };
    });
    el.querySelector<HTMLElement>("#rMarkPlan")?.addEventListener("click", () => { for (const n of researchPlan(all, [sel!], done).order) done.add(n.id); save(); render(); });
    el.querySelector<HTMLElement>("#rUnmark")?.addEventListener("click", () => {
      const out = new Set<string>(), down = (id: string) => { if (out.has(id)) return; out.add(id); (kids.get(id) ?? []).forEach(down); };
      down(sel!); out.forEach((i) => done.delete(i)); save(); render();
    });
  }
  let scrollMemo = { l: 0, t: 0 };

  function detail(n: ResearchNode, byId: Map<string, ResearchNode>, kids: Map<string, string[]>, hidden: Set<string>): string {
    const link = (id: string) => `<button class="btn rgo" data-go="${esc(id)}" style="padding:1px 8px">${esc(byId.get(id)?.name ?? id)}${done.has(id) ? " ✓" : ""}</button>`;
    const group = (kind: string, label: string) => {
      const xs = n.unlocks.filter((u) => u.kind === kind);
      return xs.length ? `<p><b>${label}</b> (${xs.length}): ${xs.map((u) => esc(u.title ?? u.id.split(":").pop()!)).join(", ")}</p>` : "";
    };
    const plan = researchPlan([...byId.values()], [n.id], done);
    const steps = plan.order.map((s, i) => `<li>${link(s.id)} <span class="hint">${dur(s.durationSec)}</span></li>`).join("");
    const after = kids.get(n.id) ?? [];
    return `<div class="box" style="margin-top:12px"><b style="font-size:1.05rem">${esc(n.name)}</b> <span class="hint">${esc(n.id)} · ${dur(n.durationSec)} of research${done.has(n.id) ? " · marked done" : ""}${n.startUnlocked ? " · unlocked from the start" : ""}</span>
      ${n.description ? `<p>${esc(n.description)}</p>` : ""}
      <p><b>Needs</b>${n.anyParent ? " (any one of)" : ""}: ${n.parents.length ? n.parents.map(link).join(" ") : "nothing"}</p>
      <p><b>Opens up</b>: ${after.length ? after.map(link).join(" ") : "nothing further"}</p>
      ${group("machine", "Machines")}${group("building", "Buildings and other")}${group("recipe", "Recipes")}${group("product", "Products")}${group("other", "Other")}
      <h4 style="margin:12px 0 4px">Plan: how to get this</h4>
      ${plan.order.length ? `<p class="hint">${plan.order.length} step${plan.order.length > 1 ? "s" : ""}, ${dur(plan.seconds)} in total (before lab speed), prerequisites first:</p><ol style="margin:4px 0 8px 1.2rem">${steps}</ol>
        <button class="btn" id="rMarkPlan">Mark all of these done</button>` : `<p class="hint">${done.has(n.id) ? "Already researched." : "Nothing left to research for this."}</p>`}
      ${after.length || done.has(n.id) ? ` <button class="btn" id="rUnmark" title="Un-mark this and everything that depends on it">Un-mark this and everything after it</button>` : ""}</div>`;
  }
  return render;
}
