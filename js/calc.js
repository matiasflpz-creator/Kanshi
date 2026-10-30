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

  function num(v) {
    const n = Number(v);
    return isFinite(n) ? n : 0;
  }

  window.KanshiCalc = { computeWeeks, summarize, sortWeeks, pctChange, METRICS };
})();
