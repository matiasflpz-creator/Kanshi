/*
 * Cálculos puros (sin DOM). Mercado Libre muestra vistas, clicks y ventas
 * ACUMULADOS; acá se convierten en lo que pasó en cada semana.
 */
(function () {
  const METRICS = ['views', 'clicks', 'sales', 'price', 'revenue', 'conversion'];

  function sortWeeks(weeks) {
    return [...weeks].sort((a, b) =>
      a.date === b.date ? (a.createdAt || 0) - (b.createdAt || 0) : a.date < b.date ? -1 : 1
    );
  }

  // Variación relativa de `prev` a `curr`. null si no se puede calcular.
  function pctChange(prev, curr) {
    if (prev == null || curr == null || !isFinite(prev) || !isFinite(curr)) return null;
    if (prev === 0) return curr === 0 ? 0 : null;
    return (curr - prev) / Math.abs(prev);
  }

  /*
   * Devuelve una fila por semana, ordenadas por fecha:
   *   number, date, cumulative {views, clicks, sales}, views, clicks, sales,
   *   price, revenue, conversion, change {métrica: % | null}, warnings []
   * La Semana 1 no tiene semana anterior. Por defecto sus valores son los
   * acumulados cargados (publicación nueva). Con opts.firstIsBaseline, la
   * Semana 1 es sólo el punto de partida: sus valores semanales quedan en null
   * y no se usan en comparaciones, gráficos ni facturación.
   */
  function computeWeeks(weeks, opts = {}) {
    const rows = [];
    let prevCum = null;
    sortWeeks(weeks).forEach((w, i) => {
      const cum = { views: num(w.views), clicks: num(w.clicks), sales: num(w.sales) };
      const isStart = !prevCum && !!opts.firstIsBaseline;
      const weekly = (k) => (isStart ? null : prevCum ? cum[k] - prevCum[k] : cum[k]);
      const views = weekly('views');
      const clicks = weekly('clicks');
      const sales = weekly('sales');
      const price = num(w.price);
      const row = {
        id: w.id,
        number: i + 1,
        date: w.date,
        cumulative: cum,
        views,
        clicks,
        sales,
        price,
        revenue: sales == null ? null : sales * price,
        conversion: views > 0 ? sales / views : null,
        isBaseline: !prevCum,
        isStart,
        warnings: [],
        change: {},
      };
      if (views < 0) row.warnings.push('Las vistas acumuladas son menores que la semana anterior.');
      if (clicks < 0) row.warnings.push('Los clicks acumulados son menores que la semana anterior.');
      if (sales < 0) row.warnings.push('Las ventas acumuladas son menores que la semana anterior.');

      const prev = rows[rows.length - 1];
      METRICS.forEach((m) => {
        row.change[m] = prev ? pctChange(prev[m], row[m]) : null;
      });
      rows.push(row);
      prevCum = cum;
    });
    return rows;
  }

  function summarize(rows) {
    if (!rows.length) return null;
    const last = rows[rows.length - 1];
    const revenue = rows.reduce((s, r) => s + (r.revenue || 0), 0);
    return {
      weeks: rows.length,
      totalViews: last.cumulative.views,
      totalClicks: last.cumulative.clicks,
      totalSales: last.cumulative.sales,
      totalRevenue: revenue,
      conversion: last.cumulative.views > 0 ? last.cumulative.sales / last.cumulative.views : null,
      last,
    };
  }

  // ---------- Resumen por período ----------

  // Suma días a una fecha ISO (yyyy-mm-dd) sin problemas de zona horaria.
  function addDays(iso, n) {
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function daysBetween(from, to) {
    return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000);
  }

  // Lunes de la semana de una fecha ISO.
  function weekStart(iso) {
    const dow = new Date(iso + 'T00:00:00Z').getUTCDay(); // 0 = domingo
    return addDays(iso, -((dow + 6) % 7));
  }

  function totalsOf(rows) {
    const t = { weeks: rows.length, views: 0, clicks: 0, sales: 0, revenue: 0 };
    rows.forEach((r) => {
      t.views += r.views;
      t.clicks += r.clicks;
      t.sales += r.sales;
      t.revenue += r.revenue;
    });
    t.conversion = t.views > 0 ? t.sales / t.views : null;
    t.avgPrice = t.sales > 0 ? t.revenue / t.sales : rows.length ? rows[rows.length - 1].price : null;
    return t;
  }

  /*
   * Resume un período [from, to] (fechas ISO, inclusive) para varias publicaciones.
   * Se cuentan las semanas cuya fecha de carga cae dentro del período (la fila
   * "punto de partida" no suma). Compara contra el período anterior de igual largo.
   *   items: [{ account, post }]
   * Devuelve { from, to, prevFrom, prevTo, total, prevTotal, change, byPost, series }.
   */
  function summarizePeriod(items, from, to) {
    const len = daysBetween(from, to) + 1;
    const prevTo = addDays(from, -1);
    const prevFrom = addDays(prevTo, -(len - 1));
    const inRange = (r, a, b) => !r.isStart && r.date >= a && r.date <= b;

    const all = [];
    const allPrev = [];
    const byPost = items.map(({ account, post }) => {
      const rows = computeWeeks(post.weeks, post);
      const cur = rows.filter((r) => inRange(r, from, to));
      const prev = rows.filter((r) => inRange(r, prevFrom, prevTo));
      all.push(...cur);
      allPrev.push(...prev);
      const t = totalsOf(cur);
      const pt = totalsOf(prev);
      return { account, post, totals: t, change: changesOf(pt, t) };
    });

    const total = totalsOf(all);
    const prevTotal = totalsOf(allPrev);

    // Serie semanal: agrupa por semana (lunes a domingo) sumando todas las publicaciones.
    const buckets = new Map();
    all.forEach((r) => {
      const key = weekStart(r.date);
      const b = buckets.get(key) || { key, views: 0, clicks: 0, sales: 0, revenue: 0 };
      b.views += r.views;
      b.clicks += r.clicks;
      b.sales += r.sales;
      b.revenue += r.revenue;
      buckets.set(key, b);
    });
    const series = [...buckets.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
    series.forEach((b, i) => {
      const p = series[i - 1];
      b.change = { views: p ? pctChange(p.views, b.views) : null, sales: p ? pctChange(p.sales, b.sales) : null };
    });

    return { from, to, prevFrom, prevTo, total, prevTotal, change: changesOf(prevTotal, total), byPost, series };
  }

  function changesOf(prev, curr) {
    if (!prev.weeks || !curr.weeks) return {};
    const c = {};
    ['views', 'clicks', 'sales', 'revenue', 'conversion', 'avgPrice'].forEach((m) => { c[m] = pctChange(prev[m], curr[m]); });
    return c;
  }

  function num(v) {
    const n = Number(v);
    return isFinite(n) ? n : 0;
  }

  window.KanshiCalc = { computeWeeks, summarize, summarizePeriod, sortWeeks, pctChange, addDays, METRICS };
})();
