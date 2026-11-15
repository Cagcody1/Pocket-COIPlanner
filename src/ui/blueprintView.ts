import type { GameData } from "../data/schema";
import { whenNative, type NativeApi } from "./native";
import { esc } from "./store";

interface Ent { proto: string; kind?: string; id?: number; pos?: number[]; rot?: number; flip?: boolean; title?: string; recipes?: string[]; pivots?: number[][]; startDir?: number[]; endDir?: number[]; maxProducts?: number; error?: string }
interface Bp { folder: string; name: string; description?: string; gameVersion?: string; itemCount?: number; string?: string; entities?: Ent[] }

const COLORS: Record<string, string> = { Pipe: "#2a9d8f", Flat: "#3b82c4", Loose: "#b07a3a", Molten: "#d1493f", Shaft: "#7d6bb5" };
const tcolor = (p: string) => (/pipe/i.test(p) ? COLORS.Pipe : /loose/i.test(p) ? COLORS.Loose : /molten|channel/i.test(p) ? COLORS.Molten : /shaft/i.test(p) ? COLORS.Shaft : COLORS.Flat);

/** Your game's blueprint library, as read by the exporter: browse, search, see what is in each and draw it on a tile grid. */
export function mountBlueprints(el: HTMLElement, getData: () => GameData) {
  let native: NativeApi | null = null, list: Bp[] | null = null, msg = "", q = "", sel = -1, pasted: Bp | null = null, code = "", waiting = false, zoom = 0, labels = true;

  const load = async () => {
    native ??= await whenNative();
    if (!native) { msg = `<div class="box">This tab needs the desktop app: it reads the library file the exporter writes.</div>`; return render(); }
    msg = `<div class="box">Reading your blueprint library…</div>`; render();
    const r = await native.read_blueprint_library();
    if (!r.ok) { msg = `<div class="box bad">${esc(r.error)}</div>`; return render(); }
    try { list = (JSON.parse(String(r.text)).blueprints ?? []) as Bp[]; msg = ""; } catch (e) { msg = `<div class="box bad">Could not read the library file: ${esc(String(e))}</div>`; }
    render();
  };

  const open = async () => {
    native ??= await whenNative();
    if (!native) { msg = `<div class="box">This needs the desktop app.</div>`; return render(); }
    const r = await native.save_blueprint_input(code);
    if (!r.ok) { msg = `<div class="box bad">${esc(r.error)}</div>`; return render(); }
    waiting = true; pasted = null; msg = `<div class="box">Waiting for the game to read it… (the game must be running with the exporter on and a map loaded)</div>`; render();
    for (let i = 0; i < 90 && waiting; i++) {
      await new Promise((ok) => setTimeout(ok, 1000));
      const a = await native.read_blueprint_decoded();
      if (!a.ok) { msg = `<div class="box bad">${esc(a.error)}</div>`; break; }
      if (!a.ready) continue;
      try {
        const t = JSON.parse(String(a.text)) as Bp & { parsed?: boolean; error?: string; exception?: string; roundTripEqual?: boolean };
        if (t.parsed === false || t.exception) { msg = `<div class="box bad">The game could not read that code: ${esc(t.error || t.exception || "unknown")}</div>`; }
        else { t.string = code.trim(); t.folder = "pasted"; pasted = t; sel = -2; msg = t.roundTripEqual === false ? `<div class="box warn">Read OK, but writing it back changes the code. Tell me before you rely on it.</div>` : ""; }
      } catch (e) { msg = `<div class="box bad">Could not read the answer: ${esc(String(e))}</div>`; }
      waiting = false; return render();
    }
    if (waiting) { waiting = false; msg = `<div class="box bad">No answer after 90 seconds. Is the game running with Planner Data Exporter enabled and a map loaded? (It needs the exporter 0.4.0 or newer; use Rebuild and update exporter.)</div>`; }
    render();
  };
  const pasteBox = () => `<div class="box"><b>Paste a blueprint code</b> <span class="hint">(copy it in the game with the blueprint's Copy button)</span>
    <textarea id="bpCode" placeholder="B1564:H4sIAAAA…" style="width:100%;height:4.5rem;font:12px ui-monospace,monospace">${esc(code)}</textarea>
    <p><button class="btn" id="bpOpen" ${waiting ? "disabled" : ""}>Open it here</button></p></div>`;
  const wirePaste = () => {
    const ta = el.querySelector<HTMLTextAreaElement>("#bpCode"); if (ta) ta.oninput = () => (code = ta.value);
    const b = el.querySelector<HTMLButtonElement>("#bpOpen"); if (b) b.onclick = () => void open();
  };

  function draw(bp: Bp, data: GameData) {
    const size = new Map<string, { w: number; h: number }>();
    for (const m of data.machines) if (m.footprint) size.set(m.id, m.footprint);
    const es = (bp.entities ?? []).filter((e) => !e.error);
    const rects: { x0: number; y0: number; x1: number; y1: number; e: Ent }[] = [], lines: { pts: number[][]; e: Ent }[] = [];
    for (const e of es) {
      if (e.pivots?.length) { lines.push({ pts: e.pivots, e }); continue; }
      if (!e.pos) continue;
      const f = size.get(e.proto) ?? { w: 1, h: 1 }, r = (e.rot ?? 0) % 2 ? { w: f.h, h: f.w } : f;
      rects.push({ x0: e.pos[0], y0: e.pos[1], x1: e.pos[0] + r.w, y1: e.pos[1] + r.h, e });
    }
    const xs = [...rects.flatMap((r) => [r.x0, r.x1]), ...lines.flatMap((l) => l.pts.map((p) => p[0]))], ys = [...rects.flatMap((r) => [r.y0, r.y1]), ...lines.flatMap((l) => l.pts.map((p) => p[1]))];
    if (!xs.length) return "";
    const x0 = Math.min(...xs) - 2, x1 = Math.max(...xs) + 3, y0 = Math.min(...ys) - 2, y1 = Math.max(...ys) + 3;
    const fit = Math.max(6, Math.min(22, Math.floor(760 / (x1 - x0)))), sc = zoom > 0 ? zoom : fit, W = (x1 - x0) * sc, H = (y1 - y0) * sc;
    const sx = (x: number) => (x - x0) * sc, sy = (y: number) => (y1 - y) * sc;          // world y points north
    let g = "";
    for (let x = Math.ceil(x0); x <= x1; x++) g += `<line x1="${sx(x)}" y1="0" x2="${sx(x)}" y2="${H}" stroke="var(--line)" stroke-width="${x % 10 === 0 ? 1 : 0.3}"/>`;
    for (let y = Math.ceil(y0); y <= y1; y++) g += `<line x1="0" y1="${sy(y)}" x2="${W}" y2="${sy(y)}" stroke="var(--line)" stroke-width="${y % 10 === 0 ? 1 : 0.3}"/>`;
    const short = (p: string) => p.replace(/^MiniZip_IoPortShape_/, "Zip ").replace(/^LiftIoPortShape_/, "Lift ").replace(/_/g, " ");
    const ls = lines.map(({ pts, e }) => `<polyline points="${pts.map((p) => `${sx(p[0]) + sc / 2},${sy(p[1]) - sc / 2}`).join(" ")}" fill="none" stroke="${tcolor(e.proto)}" stroke-width="${Math.max(2, sc * 0.3)}" stroke-linejoin="round" opacity=".8"><title>${esc(e.proto)}</title></polyline>`).join("");
    const rs = rects.map(({ x0: a, y0: b, x1: c, y1: d, e }) => {
      const big = (c - a) * (d - b) >= 4, small = !big && !size.has(e.proto);
      const tip = `<title>${esc(e.title ?? short(e.proto))}${e.recipes?.length ? ": " + esc(e.recipes.join(", ")) : ""}</title>`;
      if (small) return `<rect x="${sx(a) + sc * 0.2}" y="${sy(d) + sc * 0.2}" width="${sc * 0.6}" height="${sc * 0.6}" rx="${sc * 0.3}" fill="${tcolor(e.proto)}" opacity=".9">${tip}</rect>`;
      const lab = labels && sc * (c - a) > 28 ? `<text x="${sx(a) + 2}" y="${sy(d) + 10}" font-size="${Math.max(8, Math.min(12, sc * 0.6))}" fill="var(--ink)" pointer-events="none">${esc((e.title ?? short(e.proto)).slice(0, Math.max(4, Math.floor(((c - a) * sc) / 6))))}</text>` : "";
      return `<g><rect x="${sx(a)}" y="${sy(d)}" width="${(c - a) * sc}" height="${(d - b) * sc}" fill="var(--panel)" stroke="var(--muted)" stroke-width="1.2"/>${lab}${tip}</g>`;
    }).join("");
    const controls = `<p class="row"><label>Zoom <input type="range" id="bpZoom" min="4" max="40" value="${Math.round(sc)}"></label> <label><input type="checkbox" id="bpLabels" ${labels ? "checked" : ""}> Labels</label> <button class="btn" id="bpFit">Fit</button> <span class="hint">Hover any part for its name and recipe. Dots are conveyor/pipe ports and lifts; lines are conveyors, pipes and channels.</span></p>`;
    return `${controls}<div style="overflow:auto;max-height:70vh;border:1px solid var(--line)"><svg width="${W}" height="${H}" style="display:block">${g}${ls}${rs}</svg></div>
      <p class="hint">Drawn from the saved positions. Sizes come from the game data where known (storages and small parts show as one tile), so treat the shapes as approximate.</p>`;
  }

  function detail(bp: Bp, data: GameData) {
    const counts = new Map<string, number>();
    for (const e of bp.entities ?? []) if (e.proto) counts.set(e.proto, (counts.get(e.proto) ?? 0) + 1);
    const rows = [...counts].sort((a, b) => b[1] - a[1]).map(([p, n]) => `<tr><td>${esc(p)}</td><td class="num">${n}</td></tr>`).join("");
    return `<h3>${esc(bp.name)} <small>${esc(bp.folder || "/")}${bp.gameVersion ? " · game " + esc(bp.gameVersion) : ""}</small></h3>${bp.description ? `<p>${esc(bp.description)}</p>` : ""}
      ${draw(bp, data)}<table><thead><tr><th>Part</th><th>Count</th></tr></thead><tbody>${rows}</tbody></table>
      <p><button class="btn" id="bpCopy">Copy blueprint string</button> <span class="hint">Paste it in the game (Blueprints → Import) to place it.</span></p>`;
  }

  function render() {
    if (!list) { el.innerHTML = `${pasteBox()}${msg}${pasted ? detail(pasted, getData()) : ""}<div class="box"><p>Or browse your whole blueprint library (read by the exporter once a map is loaded).</p><p><button class="btn" id="bpLoad">Load my blueprint library</button></p></div>`; wirePaste(); el.querySelector<HTMLButtonElement>("#bpLoad")!.onclick = () => void load(); wireCopy(); return; }
    const needle = q.trim().toLowerCase();
    const shown = list.map((b, i) => ({ b, i })).filter(({ b }) => !needle || `${b.name} ${b.folder} ${(b.entities ?? []).map((e) => e.proto).join(" ")}`.toLowerCase().includes(needle)).slice(0, 300);
    el.innerHTML = `${pasteBox()}${msg}<div class="row"><input id="bpQ" type="search" placeholder="Search name, folder or part (e.g. Distiller)…" value="${esc(q)}" style="width:22rem"> <span class="hint">${list.length} blueprints${shown.length < list.length ? `, showing ${shown.length}` : ""}</span> <button class="btn" id="bpLoad">Reload</button></div>
      <div style="display:grid;grid-template-columns:minmax(14rem,22rem) 1fr;gap:1rem;align-items:start"><div style="max-height:75vh;overflow:auto">${shown.map(({ b, i }) => `<div><button class="btn" data-i="${i}" style="width:100%;text-align:left;${i === sel ? "outline:2px solid var(--accent)" : ""}">${esc(b.name)}<br><small>${esc(b.folder || "/")} · ${b.itemCount ?? b.entities?.length ?? "?"} parts</small></button></div>`).join("")}</div>
      <div>${sel === -2 && pasted ? detail(pasted, getData()) : sel >= 0 && list[sel] ? detail(list[sel], getData()) : `<p class="hint">Pick a blueprint on the left.</p>`}</div></div>`;
    const inp = el.querySelector<HTMLInputElement>("#bpQ")!;
    inp.oninput = () => { q = inp.value; const pos = inp.selectionStart; render(); const n = el.querySelector<HTMLInputElement>("#bpQ")!; n.focus(); n.setSelectionRange(pos, pos); };
    el.querySelector<HTMLButtonElement>("#bpLoad")!.onclick = () => void load();
    el.querySelectorAll<HTMLButtonElement>("[data-i]").forEach((b) => (b.onclick = () => { sel = Number(b.dataset.i); render(); }));
    wirePaste(); wireCopy();
  }
  function wireCopy() {
    const z = el.querySelector<HTMLInputElement>("#bpZoom"); if (z) z.onchange = () => { zoom = Number(z.value); render(); };
    const lb = el.querySelector<HTMLInputElement>("#bpLabels"); if (lb) lb.onchange = () => { labels = lb.checked; render(); };
    const ft = el.querySelector<HTMLButtonElement>("#bpFit"); if (ft) ft.onclick = () => { zoom = 0; render(); };
    const cp = el.querySelector<HTMLButtonElement>("#bpCopy");
    if (cp) cp.onclick = async () => { const s = (sel === -2 ? pasted : list?.[sel])?.string; if (!s) { msg = `<div class="box bad">The exporter did not write a string for this blueprint.</div>`; return render(); } try { await navigator.clipboard.writeText(s); cp.textContent = "Copied"; } catch { msg = `<div class="box"><textarea readonly style="width:100%;height:6rem">${esc(s)}</textarea></div>`; render(); } };
  }
  return render;
}
