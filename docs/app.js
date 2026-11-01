(function () {
  "use strict";

  const D = window.WQ_DATA;
  const PARAMS = D.parameters;
  const P = Object.fromEntries(PARAMS.map((p) => [p.key, p]));
  const REF_PARAMS = PARAMS.filter((p) => p.ref);
  const TYPES = ["Medium/Minor Rivers", "Other/Unclassified", "Tributary Streams"];
  // Colour follows the water-body type everywhere on the page
  const TYPE_COLOR = {
    "Medium/Minor Rivers": "var(--series-1)",
    "Other/Unclassified": "var(--series-2)",
    "Tributary Streams": "var(--series-3)",
  };
  const HOTSPOT_MIN_FAILS = 3;
  const $ = (id) => document.getElementById(id);

  const filters = { state: "", type: "" };

  // ---------- helpers ----------

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  function fmt(v) {
    if (v == null || Number.isNaN(v)) return "—";
    const abs = Math.abs(v);
    const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
    return v.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  const pct = (n, d) => (d ? (100 * n) / d : NaN);
  const fmtPct = (v) => (Number.isNaN(v) ? "—" : v.toFixed(1) + "%");
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

  function median(xs) {
    if (!xs.length) return NaN;
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function unitOf(p) {
    return p.unit ? " " + p.unit : "";
  }

  function fails(st, p) {
    const v = st.v[p.key];
    const r = p.ref;
    if (r.op === "min") return v < r.value;
    if (r.op === "max") return v > r.value;
    return v < r.value[0] || v > r.value[1];
  }

  function failedParams(st) {
    return REF_PARAMS.filter((p) => fails(st, p));
  }

  function groupBy(list, keyFn) {
    const m = new Map();
    for (const x of list) {
      const k = keyFn(x);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(x);
    }
    return m;
  }

  function filtered() {
    return D.stations.filter(
      (s) => (!filters.state || s.state === filters.state) && (!filters.type || s.type === filters.type)
    );
  }

  const EMPTY = '<p class="empty">No stations match the current filters.</p>';

  // ---------- chart builders ----------

  // Horizontal bars: rows = [{label, value, text, tip, color}]
  function hbar(el, rows, opts = {}) {
    if (!rows.length) {
      el.innerHTML = EMPTY;
      return;
    }
    const ref = opts.ref;
    const max = opts.max || Math.max(...rows.map((r) => r.value), ref || 0) || 1;
    const key = ref != null ? `<div class="ref-key"><i></i>${esc(opts.refLabel)}</div>` : "";
    el.innerHTML =
      key +
      '<div class="hbar">' +
      rows
        .map((r) => {
          const w = Math.max(0, Math.min(100, (100 * r.value) / max));
          const refLine = ref != null ? `<span class="hbar-ref" style="left:${((100 * ref) / max).toFixed(2)}%"></span>` : "";
          const color = r.color ? ` style="width:${w.toFixed(2)}%;background:${r.color}"` : ` style="width:${w.toFixed(2)}%"`;
          return `<div class="hbar-row" tabindex="0" data-tip="${esc(r.tip)}">
            <span class="hbar-label">${esc(r.label)}</span>
            <span class="hbar-track"><span class="hbar-fill"${color}></span>${refLine}</span>
            <span class="hbar-val">${r.text}</span>
          </div>`;
        })
        .join("") +
      "</div>";
  }

  // Sortable table: cols = [{key, label, num, value(row), html(row)}]
  function table(el, cols, rows, opts = {}) {
    const sort = el._sort || (el._sort = { key: opts.sortKey, desc: opts.desc !== false });
    const col = cols.find((c) => c.key === sort.key) || cols[0];
    const sorted = opts.sortable === false ? rows : [...rows].sort((a, b) => {
      const x = col.value(a);
      const y = col.value(b);
      const c = typeof x === "number" ? x - y : String(x).localeCompare(String(y));
      return sort.desc ? -c : c;
    });
    const shown = opts.limit ? sorted.slice(0, opts.limit) : sorted;
    const head = cols
      .map((c) => {
        const active = opts.sortable !== false && c.key === col.key;
        const aria = active ? ` aria-sort="${sort.desc ? "descending" : "ascending"}"` : "";
        const arrow = active ? (sort.desc ? " ↓" : " ↑") : "";
        const cls = [c.num ? "num" : "", opts.sortable === false ? "" : "sortable"].join(" ");
        return `<th class="${cls}" data-key="${c.key}"${aria} scope="col">${esc(c.label)}${arrow}</th>`;
      })
      .join("");
    const body = shown.length
      ? shown
          .map((r) => "<tr>" + cols.map((c) => `<td class="${c.num ? "num" : ""} ${c.cls || ""}">${c.html ? c.html(r) : esc(c.value(r))}</td>`).join("") + "</tr>")
          .join("")
      : `<tr><td colspan="${cols.length}" class="empty">No stations match the current filters.</td></tr>`;
    el.innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body}</tbody>`;
    if (opts.sortable !== false) {
      el.onclick = (e) => {
        const th = e.target.closest("th[data-key]");
        if (!th) return;
        if (sort.key === th.dataset.key) sort.desc = !sort.desc;
        else Object.assign(sort, { key: th.dataset.key, desc: cols.find((c) => c.key === th.dataset.key).num });
        opts.onSort ? opts.onSort() : table(el, cols, rows, opts);
      };
    }
    return sorted.length;
  }

  function stationCell(s) {
    return `${esc(s.loc)}<span class="sub">#${esc(s.code)} · ${esc(s.src)}</span>`;
  }

  function valueCell(s, key) {
    const badge = s.imp.includes(key) ? ' <span class="imp-badge" title="Missing in raw data; filled with the median">imputed</span>' : "";
    return fmt(s.v[key]) + badge;
  }

  // ---------- sections ----------

  function renderStatus(list) {
    const parts = [filters.state && filters.state, filters.type && filters.type].filter(Boolean);
    $("filter-status").textContent =
      `Showing ${list.length.toLocaleString("en-IN")} of ${D.stations.length.toLocaleString("en-IN")} stations` +
      (parts.length ? " · " + parts.join(" · ") : "");
  }

  function renderTiles(list) {
    const n = list.length;
    const bodHigh = list.filter((s) => s.v.bod > 3).length;
    const hot = list.filter((s) => failedParams(s).length >= HOTSPOT_MIN_FAILS).length;
    const tiles = [
      ["Monitoring stations", n.toLocaleString("en-IN"), `of ${D.stations.length} in the dataset`],
      ["States & UTs", new Set(list.map((s) => s.state)).size, "as recorded in the data"],
      ["Source files", new Set(list.map((s) => s.src)).size, `of ${D.meta.files} river-basin CSVs`],
      ["Mean BOD above 3 mg/L", bodHigh.toLocaleString("en-IN"), `${fmtPct(pct(bodHigh, n))} of stations`],
      ["Potential hotspots", hot.toLocaleString("en-IN"), `fail ${HOTSPOT_MIN_FAILS}+ of 5 checks · ${fmtPct(pct(hot, n))}`],
    ];
    $("tiles").innerHTML = tiles
      .map(([l, v, s]) => `<div class="tile"><div class="tile-label">${l}</div><div class="tile-value">${v}</div><div class="tile-sub">${s}</div></div>`)
      .join("");
  }

  function renderQ1(list) {
    const rows = PARAMS.map((p) => {
      const vals = list.map((s) => s.v[p.key]);
      const out = p.ref ? list.filter((s) => fails(s, p)).length : null;
      return { p, mean: mean(vals), median: median(vals), out, share: out == null ? null : pct(out, list.length) };
    });
    table(
      $("q1-table"),
      [
        { key: "param", label: "Parameter", value: (r) => r.p.label, html: (r) => `${esc(r.p.label)}${r.p.unit ? `<span class="sub">${esc(r.p.unit)}</span>` : ""}` },
        { key: "mean", label: "Mean", num: true, value: (r) => r.mean, html: (r) => fmt(r.mean) },
        { key: "median", label: "Median", num: true, value: (r) => r.median, html: (r) => fmt(r.median) },
        { key: "ref", label: "Reference", value: (r) => (r.p.ref ? r.p.ref.text : ""), html: (r) => (r.p.ref ? esc(r.p.ref.text) : '<span class="ok">none given</span>') },
        {
          key: "out", label: "Outside ref.", num: true, value: (r) => (r.out == null ? -1 : r.out),
          html: (r) => (r.out == null ? "—" : `${r.out.toLocaleString("en-IN")} <span class="sub">${fmtPct(r.share)}</span>`),
        },
      ],
      list.length ? rows : [],
      { sortable: false }
    );
    const bars = rows
      .filter((r) => r.p.ref && list.length)
      .sort((a, b) => b.share - a.share)
      .map((r) => ({
        label: r.p.label,
        value: r.share,
        text: fmtPct(r.share),
        tip: `<b>${esc(r.p.label)}</b><br>${r.out} of ${list.length} stations outside ${esc(r.p.ref.text)}`,
      }));
    hbar($("q1-chart"), bars, { max: 100 });
  }

  const BOD_BINS = [0, 1, 2, 3, 4, 6, 10, 20, 30, 50, Infinity];

  function renderQ2(list) {
    const t = Number($("q2-threshold").value);
    const above = list.filter((s) => s.v.bod > t);
    $("q2-stat").innerHTML = `<strong>${above.length.toLocaleString("en-IN")}</strong> of ${list.length.toLocaleString("en-IN")} stations (${fmtPct(pct(above.length, list.length))}) have mean BOD above ${t} mg/L`;

    // Histogram: first bin is [0, 1], the rest are (lo, hi]
    const counts = BOD_BINS.slice(0, -1).map((lo, i) => {
      const hi = BOD_BINS[i + 1];
      return list.filter((s) => (i === 0 ? s.v.bod >= lo : s.v.bod > lo) && s.v.bod <= hi).length;
    });
    const maxC = Math.max(...counts, 1);
    const label = (i) => (BOD_BINS[i + 1] === Infinity ? `${BOD_BINS[i]}+` : `${BOD_BINS[i]}–${BOD_BINS[i + 1]}`);
    $("q2-legend").innerHTML = `<span><i style="background:var(--series-1)"></i>At or below ${t} mg/L</span><span><i style="background:var(--series-2)"></i>Above ${t} mg/L</span>`;
    $("q2-hist").innerHTML =
      '<div class="cols">' +
      counts
        .map((c, i) => {
          const isAbove = BOD_BINS[i] >= t;
          const tip = `<b>BOD ${label(i)} mg/L</b><br>${c} stations · ${fmtPct(pct(c, list.length))}`;
          return `<div class="col${isAbove ? " above" : ""}" tabindex="0" data-tip="${esc(tip)}"><div class="col-fill" style="height:${((100 * c) / maxC).toFixed(2)}%"></div></div>`;
        })
        .join("") +
      "</div>" +
      `<div class="col-labels">${counts.map((_, i) => `<span>${label(i)}</span>`).join("")}</div>` +
      '<div class="axis-title">Mean BOD range (mg/L) · bins get wider to the right</div>';

    const q = $("q2-search").value.trim().toLowerCase();
    const rows = q ? above.filter((s) => (s.loc + " " + s.state + " " + s.src + " " + s.code).toLowerCase().includes(q)) : above;
    const el = $("q2-table");
    const limit = el._showAll ? 0 : 12;
    const draw = () =>
      table(
        el,
        [
          { key: "loc", label: "Station", cls: "loc", value: (s) => s.loc, html: stationCell },
          { key: "state", label: "State", value: (s) => s.state },
          { key: "bod", label: "BOD (mg/L)", num: true, value: (s) => s.v.bod, html: (s) => valueCell(s, "bod") },
        ],
        rows,
        { sortKey: "bod", limit, onSort: draw }
      );
    draw();
    const more = $("q2-more");
    more.hidden = rows.length <= 12;
    more.textContent = el._showAll ? "Show fewer" : `Show all ${rows.length.toLocaleString("en-IN")} stations`;
  }

  function renderQ3(list) {
    const bars = PARAMS.map((p) => {
      const n = list.filter((s) => s.imp.includes(p.key)).length;
      return { label: p.label, value: pct(n, list.length), n };
    })
      .sort((a, b) => b.value - a.value)
      .map((r) => ({
        label: r.label,
        value: r.value,
        text: `${fmtPct(r.value)} <small>(${r.n})</small>`,
        tip: `<b>${esc(r.label)}</b><br>${r.n} of ${list.length} stations had a missing value, filled with the median`,
      }));
    hbar($("q3-chart"), list.length ? bars : []);
  }

  function renderQ4(list) {
    const byState = [...groupBy(list, (s) => s.state)].map(([state, ss]) => ({
      state,
      n: ss.length,
      m: Object.fromEntries(PARAMS.map((p) => [p.key, mean(ss.map((s) => s.v[p.key]))])),
    }));
    table(
      $("q4-state"),
      [
        { key: "state", label: "State", value: (r) => r.state },
        { key: "n", label: "Stations", num: true, value: (r) => r.n },
        ...PARAMS.map((p) => ({
          key: p.key,
          label: p.label + (p.unit ? ` (${p.unit})` : ""),
          num: true,
          value: (r) => r.m[p.key],
          html: (r) => fmt(r.m[p.key]),
        })),
      ],
      byState,
      { sortKey: "bod" }
    );

    const byType = TYPES.map((type) => {
      const ss = list.filter((s) => s.type === type);
      return { type, n: ss.length, m: Object.fromEntries(PARAMS.map((p) => [p.key, mean(ss.map((s) => s.v[p.key]))])) };
    }).filter((r) => r.n);

    const p = P[$("q4-param").value];
    const single = p.ref && p.ref.op !== "range" ? p.ref.value : null;
    hbar(
      $("q4-chart"),
      byType.map((r) => ({
        label: r.type,
        value: r.m[p.key],
        text: `${fmt(r.m[p.key])} <small>n=${r.n}</small>`,
        color: TYPE_COLOR[r.type],
        tip: `<b>${esc(r.type)}</b><br>Average ${esc(p.label)}: ${fmt(r.m[p.key])}${esc(unitOf(p))}<br>${r.n} stations`,
      })),
      { ref: single, refLabel: single != null ? `Reference ${p.ref.text}` : "" }
    );

    table(
      $("q4-type"),
      [
        { key: "param", label: "Parameter", value: (pp) => pp.label, html: (pp) => `${esc(pp.label)}${pp.unit ? `<span class="sub">${esc(pp.unit)}</span>` : ""}` },
        ...byType.map((r) => ({ key: r.type, label: r.type.replace("/Unclassified", "/Unclass."), num: true, value: (pp) => r.m[pp.key], html: (pp) => fmt(r.m[pp.key]) })),
      ],
      byType.length ? PARAMS : [],
      { sortable: false }
    );
  }

  function renderQ5(list) {
    const p = P[$("q5-param").value];
    const lowIsBad = p.ref && p.ref.op === "min";
    const rows = [...groupBy(list, (s) => s.state)]
      .map(([state, ss]) => ({ state, n: ss.length, v: mean(ss.map((s) => s.v[p.key])) }))
      .sort((a, b) => (lowIsBad ? a.v - b.v : b.v - a.v))
      .slice(0, 10);
    $("q5-title").textContent = `${lowIsBad ? "Bottom" : "Top"} 10 states by average ${p.label}`;
    $("q5-note").textContent = lowIsBad
      ? `Lowest averages first: for ${p.label.toLowerCase()}, lower is worse.`
      : `Highest averages first${p.unit ? `, in ${p.unit}` : ""}.`;
    const single = p.ref && p.ref.op !== "range" ? p.ref.value : null;
    hbar(
      $("q5-chart"),
      rows.map((r) => ({
        label: r.state,
        value: r.v,
        text: `${fmt(r.v)} <small>n=${r.n}</small>`,
        tip: `<b>${esc(r.state)}</b><br>Average ${esc(p.label)}: ${fmt(r.v)}${esc(unitOf(p))}<br>${r.n} stations`,
      })),
      { ref: single, refLabel: single != null ? `Reference ${p.ref.text}` : "" }
    );
  }

  function renderHotspots(list) {
    const scored = list.map((s) => ({ s, failed: failedParams(s) }));

    table(
      $("hs-table"),
      [
        { key: "loc", label: "Station", cls: "loc", value: (r) => r.s.loc, html: (r) => stationCell(r.s) },
        { key: "state", label: "State", value: (r) => r.s.state },
        { key: "n", label: "Checks failed", num: true, value: (r) => r.failed.length + r.s.v.bod / 1e6, html: (r) => `${r.failed.length} / ${REF_PARAMS.length}` },
        {
          key: "which", label: "Failed", value: (r) => r.failed.length,
          html: (r) => (r.failed.length ? `<span class="chips">${r.failed.map((p) => `<span class="flag">✕ ${esc(p.label)}</span>`).join("")}</span>` : '<span class="ok">none</span>'),
        },
        { key: "bod", label: "BOD (mg/L)", num: true, value: (r) => r.s.v.bod, html: (r) => valueCell(r.s, "bod") },
      ],
      scored,
      { sortKey: "n", limit: 10 }
    );

    const dist = [5, 4, 3, 2, 1, 0].map((k) => ({ k, n: scored.filter((r) => r.failed.length === k).length }));
    hbar(
      $("hs-dist"),
      list.length
        ? dist.map((d) => ({
            label: `${d.k} check${d.k === 1 ? "" : "s"} failed`,
            value: d.n,
            text: d.n.toLocaleString("en-IN"),
            tip: `<b>${d.k} of 5 checks failed</b><br>${d.n} stations · ${fmtPct(pct(d.n, list.length))}${d.k >= HOTSPOT_MIN_FAILS ? "<br>Flagged as potential hotspot" : ""}`,
          }))
        : []
    );

    const states = [...groupBy(scored, (r) => r.s.state)]
      .filter(([, rs]) => rs.length >= 5)
      .map(([state, rs]) => {
        const hot = rs.filter((r) => r.failed.length >= HOTSPOT_MIN_FAILS).length;
        return { state, n: rs.length, hot, share: pct(hot, rs.length) };
      })
      .sort((a, b) => b.share - a.share || b.hot - a.hot)
      .slice(0, 8);
    hbar(
      $("hs-states"),
      states.map((r) => ({
        label: r.state,
        value: r.share,
        text: `${fmtPct(r.share)} <small>${r.hot}/${r.n}</small>`,
        tip: `<b>${esc(r.state)}</b><br>${r.hot} of ${r.n} stations fail ${HOTSPOT_MIN_FAILS}+ checks`,
      })),
      { max: 100 }
    );

    const counts = [...groupBy(list, (s) => s.state)].map(([state, ss]) => ({ state, n: ss.length })).sort((a, b) => b.n - a.n).slice(0, 8);
    hbar(
      $("st-count"),
      counts.map((r) => ({
        label: r.state,
        value: r.n,
        text: r.n.toLocaleString("en-IN"),
        tip: `<b>${esc(r.state)}</b><br>${r.n} stations · ${fmtPct(pct(r.n, list.length))} of selection`,
      }))
    );

    const mix = TYPES.map((type) => ({ type, n: list.filter((s) => s.type === type).length })).filter((m) => m.n);
    $("mix").innerHTML = list.length
      ? `<div class="seg">${mix
          .map((m) => `<span class="seg-part" tabindex="0" style="flex:${m.n};background:${TYPE_COLOR[m.type]}" data-tip="${esc(`<b>${m.type}</b><br>${m.n} stations · ${fmtPct(pct(m.n, list.length))}`)}"></span>`)
          .join("")}</div>
         <ul class="seg-list">${mix
           .map((m) => `<li><i style="background:${TYPE_COLOR[m.type]}"></i><span>${esc(m.type)}</span><b>${fmtPct(pct(m.n, list.length))} <small>${m.n}</small></b></li>`)
           .join("")}</ul>`
      : EMPTY;
  }

  function renderAll() {
    const list = filtered();
    renderStatus(list);
    renderTiles(list);
    renderQ1(list);
    renderQ2(list);
    renderQ3(list);
    renderQ4(list);
    renderQ5(list);
    renderHotspots(list);
  }

  // ---------- controls ----------

  function setupControls() {
    const states = [...new Set(D.stations.map((s) => s.state))].sort();
    $("f-state").insertAdjacentHTML("beforeend", states.map((s) => `<option>${esc(s)}</option>`).join(""));
    $("f-type").insertAdjacentHTML("beforeend", TYPES.map((t) => `<option>${esc(t)}</option>`).join(""));
    const paramOptions = PARAMS.map((p) => `<option value="${p.key}">${esc(p.label)}</option>`).join("");
    $("q4-param").innerHTML = paramOptions;
    $("q5-param").innerHTML = paramOptions;
    $("q4-param").value = "bod";
    $("q5-param").value = "bod";

    const list = filtered;
    $("f-state").onchange = (e) => { filters.state = e.target.value; renderAll(); };
    $("f-type").onchange = (e) => { filters.type = e.target.value; renderAll(); };
    $("f-reset").onclick = () => {
      filters.state = filters.type = "";
      $("f-state").value = $("f-type").value = "";
      renderAll();
    };
    $("q2-threshold").onchange = () => renderQ2(list());
    $("q2-search").oninput = () => renderQ2(list());
    $("q2-more").onclick = () => { $("q2-table")._showAll = !$("q2-table")._showAll; renderQ2(list()); };
    $("q4-param").onchange = () => renderQ4(list());
    $("q5-param").onchange = () => renderQ5(list());
  }

  // ---------- tooltip ----------

  function setupTooltip() {
    const tip = $("tip");
    let current = null;
    const place = (x, y) => {
      const r = tip.getBoundingClientRect();
      const left = Math.min(x + 14, window.innerWidth - r.width - 8);
      const top = y + 16 + r.height > window.innerHeight ? y - r.height - 12 : y + 16;
      tip.style.left = Math.max(8, left) + "px";
      tip.style.top = Math.max(8, top) + "px";
    };
    const show = (el) => {
      current = el;
      tip.innerHTML = el.dataset.tip;
      tip.hidden = false;
    };
    const hide = () => { current = null; tip.hidden = true; };
    document.addEventListener("mousemove", (e) => {
      const el = e.target.closest("[data-tip]");
      if (!el) return current && hide();
      if (el !== current) show(el);
      place(e.clientX, e.clientY);
    });
    document.addEventListener("focusin", (e) => {
      const el = e.target.closest("[data-tip]");
      if (!el) return hide();
      show(el);
      const r = el.getBoundingClientRect();
      place(r.left + r.width / 2, r.bottom);
    });
    document.addEventListener("scroll", hide, { passive: true });
  }

  setupControls();
  setupTooltip();
  renderAll();
})();
