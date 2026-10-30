/*
 * Kanshi · interfaz de usuario.
 * Depende de: KanshiStorage (storage.js), KanshiCalc (calc.js), Chart.js y SheetJS.
 */
(function () {
  'use strict';

  const SCHEMA_VERSION = 1;
  const SUMMARY_TAB = '__resumen__';
  const $ = (sel) => document.querySelector(sel);

  let state = null;
  let charts = [];

  // ---------- Estado ----------

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function defaultUi() {
    return { accountId: null, postByAccount: {}, newestFirst: true, period: { from: null, to: null, scope: 'account' } };
  }

  function defaultState() {
    return {
      version: SCHEMA_VERSION,
      accounts: [
        { id: uid(), name: 'Cuenta 1', posts: [] },
        { id: uid(), name: 'Cuenta 2', posts: [] },
      ],
      ui: defaultUi(),
    };
  }

  // Valida y completa un estado (cargado o restaurado). Lanza error si no sirve.
  function normalizeState(raw) {
    if (!raw || !Array.isArray(raw.accounts)) throw new Error('El archivo no tiene el formato de Kanshi.');
    const s = {
      version: SCHEMA_VERSION,
      accounts: raw.accounts.map((a, i) => ({
        id: a.id || uid(),
        name: String(a.name || `Cuenta ${i + 1}`),
        posts: (Array.isArray(a.posts) ? a.posts : []).map((p) => ({
          id: p.id || uid(),
          name: String(p.name || 'Publicación'),
          createdAt: p.createdAt || Date.now(),
          firstIsBaseline: !!p.firstIsBaseline,
          weeks: (Array.isArray(p.weeks) ? p.weeks : []).map((w) => ({
            id: w.id || uid(),
            date: String(w.date || ''),
            views: Number(w.views) || 0,
            clicks: Number(w.clicks) || 0,
            sales: Number(w.sales) || 0,
            price: Number(w.price) || 0,
            createdAt: w.createdAt || Date.now(),
          })),
        })),
      })),
      ui: Object.assign(defaultUi(), raw.ui || {}),
    };
    if (!s.accounts.length) s.accounts = defaultState().accounts;
    return s;
  }

  async function persist() {
    try {
      await KanshiStorage.save(state);
      const time = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      const where = KanshiStorage.name === 'supabase' ? 'Sincronizado con Supabase' : 'Datos guardados en este navegador';
      $('#storage-status').textContent = `${where} · último guardado ${time}`;
    } catch (err) {
      console.error(err);
      toast('No se pudieron guardar los datos. Descargá una copia de seguridad.', 'error');
    }
  }

  const currentAccount = () =>
    state.accounts.find((a) => a.id === state.ui.accountId) || state.accounts[0];

  const isSummaryTab = () => {
    const acc = currentAccount();
    return acc.posts.length > 0 && state.ui.postByAccount[acc.id] === SUMMARY_TAB;
  };

  function currentPost() {
    const acc = currentAccount();
    const id = state.ui.postByAccount[acc.id];
    if (id === SUMMARY_TAB && acc.posts.length) return null;
    return acc.posts.find((p) => p.id === id) || acc.posts[0] || null;
  }

  // ---------- Formato ----------

  const nfInt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
  const nfMoney = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
  const nfMoneyDec = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nfPct = new Intl.NumberFormat('es-AR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nfConv = new Intl.NumberFormat('es-AR', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const fmtInt = (n) => (n == null ? '—' : nfInt.format(n));
  const fmtMoney = (n) => (n == null ? '—' : (Number.isInteger(n) ? nfMoney : nfMoneyDec).format(n));
  const fmtConv = (n) => (n == null ? '—' : nfConv.format(n));

  function fmtDate(iso, short) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    return short ? `${d}/${m}` : `${d}/${m}/${y}`;
  }

  function todayISO() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Acepta "1.234", "1234", "1.234,50", "1234,5", "$ 1.500".
  function parseNumber(str, integer) {
    let s = String(str).trim().replace(/[\s$]/g, '');
    if (!s) return NaN;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (s.includes('.') && (integer || /^\d{1,3}(\.\d{3})+$/.test(s))) s = s.replace(/\./g, '');
    if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
    return Number(s);
  }

  function changeBadge(value, title = 'Contra la semana anterior') {
    if (value == null) return '<span class="chg chg-none">—</span>';
    if (Math.abs(value) < 0.0005) return '<span class="chg chg-flat">= 0,0%</span>';
    const up = value > 0;
    return `<span class="chg ${up ? 'chg-up' : 'chg-down'}" title="${title}">${up ? '▲' : '▼'} ${nfPct.format(Math.abs(value))}</span>`;
  }

  // ---------- Render ----------

  function render() {
    renderAccounts();
    renderPostTabs();
    renderPostView();
  }

  function renderAccounts() {
    const acc = currentAccount();
    $('#account-tabs').innerHTML = state.accounts
      .map((a) => `<button role="tab" class="seg ${a.id === acc.id ? 'active' : ''}" aria-selected="${a.id === acc.id}" data-account="${a.id}">${esc(a.name)}</button>`)
      .join('');
  }

  function renderPostTabs() {
    const acc = currentAccount();
    const post = currentPost();
    const el = $('#post-tabs');
    if (!acc.posts.length) {
      el.innerHTML = '';
      return;
    }
    const summary = isSummaryTab();
    el.innerHTML = `<button role="tab" class="tab tab-summary ${summary ? 'active' : ''}" aria-selected="${summary}" data-post="${SUMMARY_TAB}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10 M10 20V4 M16 20v-7 M22 20H2"/></svg>Resumen
      </button>` + acc.posts
      .map((p) => `<button role="tab" class="tab ${post && p.id === post.id ? 'active' : ''}" aria-selected="${post && p.id === post.id}" data-post="${p.id}">${esc(p.name)}<span class="tab-count">${p.weeks.length}</span></button>`)
      .join('');
    const active = el.querySelector('.tab.active');
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function renderPostView() {
    destroyCharts();
    const view = $('#post-view');
    const acc = currentAccount();
    const post = currentPost();

    if (isSummaryTab()) return renderPeriodView();

    if (!post) {
      view.innerHTML = `
        <div class="empty card">
          <div class="empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7h16v13H4z M8 7V4h8v3 M9 12h6"/></svg></div>
          <h2>${esc(acc.name)} todavía no tiene publicaciones</h2>
          <p>Creá una publicación (por ejemplo, “Zapatillas Negras”) para empezar a cargar sus números semanales.</p>
          <button class="btn btn-primary" data-action="add-post">Crear publicación</button>
        </div>`;
      return;
    }

    const rows = KanshiCalc.computeWeeks(post.weeks, post);
    const sum = KanshiCalc.summarize(rows);
    const chartRows = rows.filter((r) => !r.isStart);

    view.innerHTML = `
      <div class="post-head">
        <div class="post-title">
          <h2>${esc(post.name)}</h2>
          <div class="post-title-actions">
            <button class="icon-btn" data-action="rename-post" title="Renombrar publicación" aria-label="Renombrar publicación">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z M14 6l4 4"/></svg>
            </button>
            <button class="icon-btn danger" data-action="delete-post" title="Eliminar publicación" aria-label="Eliminar publicación">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13"/></svg>
            </button>
          </div>
        </div>
        <button class="btn btn-primary" data-action="add-week">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14 M5 12h14"/></svg>
          Cargar semana
        </button>
      </div>
      ${sum ? renderSummary(sum) : ''}
      ${rows.length ? renderTable(rows) : renderNoWeeks()}
      ${chartRows.length ? renderChartsShell(chartRows) : ''}
    `;

    if (chartRows.length) drawCharts(chartRows);
  }

  function renderSummary(sum) {
    const l = sum.last;
    const card = (label, value, sub) => `
      <div class="stat">
        <span class="stat-label">${label}</span>
        <span class="stat-value">${value}</span>
        <span class="stat-sub">${sub}</span>
      </div>`;
    const vs = (m) => (l.isStart ? '<span class="muted">Punto de partida · cargá la próxima semana</span>' : l.isBaseline ? '<span class="muted">Primera semana</span>' : `${changeBadge(l.change[m])} <span class="muted">vs. semana anterior</span>`);
    return `
      <section class="stats" aria-label="Resumen de la última semana">
        ${card(`Vistas · Semana ${l.number}`, fmtInt(l.views), vs('views'))}
        ${card(`Ventas · Semana ${l.number}`, fmtInt(l.sales), vs('sales'))}
        ${card(`Facturación · Semana ${l.number}`, fmtMoney(l.revenue), vs('revenue'))}
        ${card(`Conversión · Semana ${l.number}`, fmtConv(l.conversion), vs('conversion'))}
      </section>
      <p class="totals">
        Acumulado: <strong>${fmtInt(sum.totalViews)}</strong> vistas ·
        <strong>${fmtInt(sum.totalClicks)}</strong> clicks ·
        <strong>${fmtInt(sum.totalSales)}</strong> ventas ·
        facturación registrada <strong>${fmtMoney(sum.totalRevenue)}</strong> ·
        conversión total <strong>${fmtConv(sum.conversion)}</strong>
      </p>`;
  }

  function renderNoWeeks() {
    return `
      <div class="empty card">
        <div class="empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 5h16v15H4z M4 10h16 M9 3v4 M15 3v4"/></svg></div>
        <h2>Cargá tu primera semana</h2>
        <p>Copiá las vistas, clicks y ventas <strong>acumuladas</strong> tal como aparecen en Mercado Libre. Desde la segunda semana, Kanshi calcula sola lo que pasó en cada semana.</p>
        <button class="btn btn-primary" data-action="add-week">Cargar semana</button>
      </div>`;
  }

  function renderTable(rows) {
    const ordered = state.ui.newestFirst ? [...rows].reverse() : rows;
    const cell = (main, change, isBaseline) =>
      `<td class="num">${main}<div>${isBaseline ? '' : changeBadge(change)}</div></td>`;
    // En la fila "punto de partida" se muestra el acumulado en gris.
    const cumCell = (r, k) =>
      r.isStart ? `<td class="num muted">—<div class="cum-note">acum. ${fmtInt(r.cumulative[k])}</div></td>` : cell(fmtInt(r[k]), r.change[k], r.isBaseline);
    const body = ordered
      .map((r) => {
        const warn = r.warnings.length
          ? `<span class="warn" title="${esc(r.warnings.join(' '))}" aria-label="Revisar datos">!</span>`
          : '';
        return `
        <tr>
          <th scope="row" class="week-cell">
            <span class="week-name">Semana ${r.number} ${warn}</span>
            <span class="week-date">${fmtDate(r.date)}${r.isStart ? ' · punto de partida' : ''}</span>
          </th>
          ${cumCell(r, 'views')}
          ${cumCell(r, 'clicks')}
          ${cumCell(r, 'sales')}
          ${cell(fmtMoney(r.price), r.change.price, r.isBaseline)}
          ${cell(fmtMoney(r.revenue), r.change.revenue, r.isBaseline)}
          ${cell(fmtConv(r.conversion), r.change.conversion, r.isBaseline)}
          <td class="row-actions">
            <button class="icon-btn" data-action="edit-week" data-week="${r.id}" title="Editar semana" aria-label="Editar semana ${r.number}">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z M14 6l4 4"/></svg>
            </button>
            <button class="icon-btn danger" data-action="delete-week" data-week="${r.id}" title="Borrar semana" aria-label="Borrar semana ${r.number}">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13"/></svg>
            </button>
          </td>
        </tr>`;
      })
      .join('');

    const post = currentPost();
    return `
      <section class="card table-card">
        <div class="card-head">
          <h3>Semana a semana</h3>
          <button class="btn btn-ghost btn-sm" data-action="toggle-order">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16 M3 16l4 4 4-4 M17 20V4 M13 8l4-4 4 4"/></svg>
            ${state.ui.newestFirst ? 'Más recientes primero' : 'Más antiguas primero'}
          </button>
        </div>
        <div class="table-scroll">
          <table class="weeks">
            <thead>
              <tr>
                <th scope="col">Semana</th>
                <th scope="col" class="num">Vistas</th>
                <th scope="col" class="num">Clicks</th>
                <th scope="col" class="num">Ventas</th>
                <th scope="col" class="num">Precio</th>
                <th scope="col" class="num">Facturación</th>
                <th scope="col" class="num">Conversión</th>
                <th scope="col"><span class="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>${body}</tbody>
          </table>
        </div>
        <div class="table-note">
          <p>Vistas, clicks y ventas son de cada semana (acumulado actual − acumulado anterior). Facturación = ventas × precio · Conversión = ventas ÷ vistas.</p>
          <p>${post.firstIsBaseline
            ? 'La <strong>Semana 1</strong> se usa sólo como punto de partida (la publicación ya tenía vistas y ventas antes).'
            : 'La <strong>Semana 1</strong> muestra los acumulados cargados, como si la publicación hubiera empezado esa semana.'}
            <button class="link-btn" data-action="toggle-baseline">${post.firstIsBaseline ? 'Contar la Semana 1 como una semana normal' : 'Usarla sólo como punto de partida'}</button>
          </p>
        </div>
      </section>`;
  }

  function renderChartsShell(rows) {
    const note = rows.length < 2 ? '<p class="chart-note">Con dos o más semanas vas a ver la evolución.</p>' : '';
    return `
      <section class="charts">
        <div class="card chart-card">
          <div class="card-head"><h3><span class="dot dot-views"></span>Vistas por semana</h3></div>
          <div class="chart-box"><canvas id="chart-views" aria-label="Gráfico de vistas por semana" role="img"></canvas></div>
          ${note}
        </div>
        <div class="card chart-card">
          <div class="card-head"><h3><span class="dot dot-sales"></span>Ventas por semana</h3></div>
          <div class="chart-box"><canvas id="chart-sales" aria-label="Gráfico de ventas por semana" role="img"></canvas></div>
          ${note}
        </div>
      </section>`;
  }

  // ---------- Resumen por período ----------

  function periodItems() {
    const accounts = state.ui.period.scope === 'all' ? state.accounts : [currentAccount()];
    return accounts.flatMap((account) => account.posts.map((post) => ({ account, post })));
  }

  function periodPreset(preset) {
    const today = todayISO();
    const [y, m] = today.split('-').map(Number);
    const pad = (n) => String(n).padStart(2, '0');
    switch (preset) {
      case '30d': return { from: KanshiCalc.addDays(today, -30), to: today };
      case '90d': return { from: KanshiCalc.addDays(today, -90), to: today };
      case 'month': return { from: `${y}-${pad(m)}-01`, to: today };
      case 'prev-month': {
        const first = m === 1 ? `${y - 1}-12-01` : `${y}-${pad(m - 1)}-01`;
        return { from: first, to: KanshiCalc.addDays(`${y}-${pad(m)}-01`, -1) };
      }
      case 'all': {
        const dates = periodItems().flatMap((i) => i.post.weeks.map((w) => w.date)).filter(Boolean).sort();
        return dates.length ? { from: dates[0], to: dates[dates.length - 1] > today ? dates[dates.length - 1] : today } : periodPreset('30d');
      }
    }
  }

  function renderPeriodView() {
    const view = $('#post-view');
    const p = state.ui.period;
    if (!p.from || !p.to) Object.assign(p, periodPreset('30d'));
    const all = p.scope === 'all';

    const presets = [['30d', 'Últimos 30 días'], ['90d', 'Últimos 90 días'], ['month', 'Este mes'], ['prev-month', 'Mes anterior'], ['all', 'Todo']];
    const controls = `
      <section class="card period-controls">
        <div class="period-dates">
          <label class="field">
            <span>Desde</span>
            <input type="date" data-period="from" value="${esc(p.from)}" />
          </label>
          <label class="field">
            <span>Hasta</span>
            <input type="date" data-period="to" value="${esc(p.to)}" />
          </label>
        </div>
        <div class="period-presets">
          ${presets.map(([k, l]) => `<button class="chip" data-action="period-preset" data-preset="${k}">${l}</button>`).join('')}
        </div>
        <div class="segmented segmented-sm" role="group" aria-label="Alcance">
          <button class="seg ${all ? '' : 'active'}" data-action="period-scope" data-scope="account">${esc(currentAccount().name)}</button>
          <button class="seg ${all ? 'active' : ''}" data-action="period-scope" data-scope="all">Todas las cuentas</button>
        </div>
      </section>`;

    const head = `
      <div class="post-head">
        <div class="post-title"><h2>Resumen del período</h2></div>
      </div>`;

    if (p.from > p.to) {
      view.innerHTML = head + controls + '<p class="form-error period-error">La fecha “Desde” tiene que ser anterior a “Hasta”.</p>';
      return;
    }

    const sum = KanshiCalc.summarizePeriod(periodItems(), p.from, p.to);
    const t = sum.total;
    const prevLabel = `${fmtDate(sum.prevFrom)} – ${fmtDate(sum.prevTo)}`;
    const vsPrev = (m) => {
      if (!sum.prevTotal.weeks) return '<span class="muted">Sin datos del período anterior</span>';
      return `${changeBadge(sum.change[m], `Contra ${prevLabel}`)} <span class="muted">vs. período anterior</span>`;
    };
    const card = (label, value, m) => `
      <div class="stat">
        <span class="stat-label">${label}</span>
        <span class="stat-value">${value}</span>
        <span class="stat-sub">${vsPrev(m)}</span>
      </div>`;

    const badge = (r, m) => (r.change[m] === undefined ? '' : `<div>${changeBadge(r.change[m], `Contra ${prevLabel}`)}</div>`);
    const tableRows = sum.byPost
      .map((r) => {
        const x = r.totals;
        const empty = !x.weeks;
        return `
        <tr class="${empty ? 'row-empty' : ''}">
          <th scope="row" class="week-cell">
            <button class="link-btn post-link" data-action="open-post" data-account="${r.account.id}" data-post="${r.post.id}">${esc(r.post.name)}</button>
            ${all ? `<span class="week-date">${esc(r.account.name)}</span>` : ''}
          </th>
          <td class="num">${x.weeks}</td>
          <td class="num">${empty ? '—' : fmtInt(x.views)}${badge(r, 'views')}</td>
          <td class="num">${empty ? '—' : fmtInt(x.clicks)}${badge(r, 'clicks')}</td>
          <td class="num">${empty ? '—' : fmtInt(x.sales)}${badge(r, 'sales')}</td>
          <td class="num">${fmtMoney(x.avgPrice)}${badge(r, 'avgPrice')}</td>
          <td class="num">${empty ? '—' : fmtMoney(x.revenue)}${badge(r, 'revenue')}</td>
          <td class="num">${fmtConv(x.conversion)}${badge(r, 'conversion')}</td>
        </tr>`;
      })
      .join('');

    const table = `
      <section class="card table-card">
        <div class="card-head"><h3>Por publicación</h3></div>
        <div class="table-scroll">
          <table class="weeks">
            <thead>
              <tr>
                <th scope="col">Publicación</th>
                <th scope="col" class="num">Semanas</th>
                <th scope="col" class="num">Vistas</th>
                <th scope="col" class="num">Clicks</th>
                <th scope="col" class="num">Ventas</th>
                <th scope="col" class="num">Precio prom.</th>
                <th scope="col" class="num">Facturación</th>
                <th scope="col" class="num">Conversión</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                <td class="num">${t.weeks}</td>
                <td class="num">${fmtInt(t.views)}</td>
                <td class="num">${fmtInt(t.clicks)}</td>
                <td class="num">${fmtInt(t.sales)}</td>
                <td class="num">${fmtMoney(t.avgPrice)}</td>
                <td class="num">${fmtMoney(t.revenue)}</td>
                <td class="num">${fmtConv(t.conversion)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div class="table-note">
          <p>Se suman las semanas cuya fecha de carga cae entre el ${fmtDate(sum.from)} y el ${fmtDate(sum.to)}. Los % comparan contra el período anterior del mismo largo (${prevLabel}). Precio prom. = facturación ÷ ventas.</p>
        </div>
      </section>`;

    const body = t.weeks
      ? `
        <section class="stats stats-5" aria-label="Totales del período">
          ${card('Vistas', fmtInt(t.views), 'views')}
          ${card('Clicks', fmtInt(t.clicks), 'clicks')}
          ${card('Ventas', fmtInt(t.sales), 'sales')}
          ${card('Facturación', fmtMoney(t.revenue), 'revenue')}
          ${card('Conversión', fmtConv(t.conversion), 'conversion')}
        </section>
        ${table}
        ${renderChartsShell(sum.series)}`
      : `
        <div class="empty card">
          <div class="empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 5h16v15H4z M4 10h16 M9 3v4 M15 3v4"/></svg></div>
          <h2>No hay semanas cargadas en este período</h2>
          <p>Probá con otras fechas o elegí “Todo”.</p>
        </div>`;

    view.innerHTML = head + controls + body;

    if (t.weeks) {
      drawLineCharts(sum.series.map((b) => ({
        label: fmtDate(b.key, true),
        title: `Semana del ${fmtDate(b.key)} al ${fmtDate(KanshiCalc.addDays(b.key, 6))}`,
        views: b.views,
        sales: b.sales,
        change: b.change,
      })));
    }
  }

  // ---------- Gráficos ----------

  function destroyCharts() {
    charts.forEach((c) => c.destroy());
    charts = [];
  }

  // Gráficos de una publicación: un punto por semana cargada.
  function drawCharts(rows) {
    drawLineCharts(rows.map((r) => ({
      label: [`Sem ${r.number}`, fmtDate(r.date, true)],
      title: `Semana ${r.number} · ${fmtDate(r.date)}`,
      views: r.views,
      sales: r.sales,
      change: r.isBaseline ? null : r.change,
    })));
  }

  // points: [{ label, title, views, sales, change: { views, sales } | null }]
  function drawLineCharts(points) {
    if (!window.Chart) return;
    const css = getComputedStyle(document.documentElement);
    const v = (name) => css.getPropertyValue(name).trim();
    const labels = points.map((p) => p.label);

    const make = (id, data, color, labelFor) => {
      const ctx = document.getElementById(id);
      if (!ctx) return;
      charts.push(
        new Chart(ctx, {
          type: 'line',
          data: {
            labels,
            datasets: [{
              data,
              borderColor: color,
              backgroundColor: color + '1f',
              fill: true,
              tension: 0.3,
              borderWidth: 2,
              pointRadius: 4,
              pointHoverRadius: 6,
              pointBackgroundColor: color,
              pointBorderColor: v('--surface'),
              pointBorderWidth: 2,
            }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: v('--tooltip-bg'),
                titleColor: v('--tooltip-fg'),
                bodyColor: v('--tooltip-fg'),
                padding: 10,
                cornerRadius: 8,
                displayColors: false,
                callbacks: {
                  title: (items) => points[items[0].dataIndex].title,
                  label: (item) => labelFor(points[item.dataIndex]),
                },
              },
            },
            scales: {
              x: {
                grid: { display: false },
                border: { color: v('--border') },
                ticks: { color: v('--text-muted'), font: { family: 'Inter', size: 11 } },
              },
              y: {
                beginAtZero: true,
                grid: { color: v('--grid') },
                border: { display: false },
                ticks: { color: v('--text-muted'), font: { family: 'Inter', size: 11 }, precision: 0, callback: (val) => fmtInt(val) },
              },
            },
          },
        })
      );
    };

    const withChange = (txt, p, m) => {
      const c = p.change && p.change[m];
      if (c == null) return txt;
      return `${txt} (${c >= 0 ? '+' : '−'}${nfPct.format(Math.abs(c))})`;
    };
    make('chart-views', points.map((p) => p.views), v('--series-views'), (p) => withChange(`${fmtInt(p.views)} vistas`, p, 'views'));
    make('chart-sales', points.map((p) => p.sales), v('--series-sales'), (p) => withChange(`${fmtInt(p.sales)} ventas`, p, 'sales'));
  }

  // ---------- Diálogos ----------

  const dialog = $('#dialog');
  let dialogHandler = null;

  function openDialog({ title, body, actions, onSubmit, onOpen }) {
    $('#dialog-title').textContent = title;
    $('#dialog-body').innerHTML = body;
    $('#dialog-foot').innerHTML = actions
      .map((a) => `<button type="${a.submit ? 'submit' : 'button'}" class="btn ${a.className || 'btn-ghost'}" ${a.submit ? '' : 'data-close'}>${esc(a.label)}</button>`)
      .join('');
    dialogHandler = onSubmit || null;
    dialog.showModal();
    if (onOpen) onOpen($('#dialog-body'));
    const first = $('#dialog-body').querySelector('input, select, textarea');
    if (first) { first.focus(); if (first.select) first.select(); }
  }

  function closeDialog() {
    dialogHandler = null;
    if (dialog.open) dialog.close();
  }

  $('#dialog-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!dialogHandler) return closeDialog();
    // El handler devuelve false para dejar el diálogo abierto (error de validación).
    if (dialogHandler($('#dialog-body')) !== false) closeDialog();
  });
  dialog.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]') || e.target === dialog) closeDialog();
  });

  function promptName({ title, label, value = '', confirm = 'Guardar' }) {
    return new Promise((resolve) => {
      let result = null;
      openDialog({
        title,
        body: `
          <label class="field">
            <span>${esc(label)}</span>
            <input type="text" name="name" maxlength="80" value="${esc(value)}" autocomplete="off" required />
            <small class="field-error" hidden>Escribí un nombre.</small>
          </label>`,
        actions: [{ label: 'Cancelar' }, { label: confirm, submit: true, className: 'btn-primary' }],
        onSubmit: (b) => {
          const v = b.querySelector('[name=name]').value.trim();
          if (!v) { b.querySelector('.field-error').hidden = false; return false; }
          result = v;
        },
      });
      dialog.addEventListener('close', () => resolve(result), { once: true });
    });
  }

  function confirmDanger({ title, message, confirm }) {
    return new Promise((resolve) => {
      let ok = false;
      openDialog({
        title,
        body: `<p class="dialog-text">${message}</p>`,
        actions: [{ label: 'Cancelar' }, { label: confirm, submit: true, className: 'btn-danger' }],
        onSubmit: () => { ok = true; },
      });
      dialog.addEventListener('close', () => resolve(ok), { once: true });
    });
  }

  function weekDialog(post, week) {
    const sorted = KanshiCalc.sortWeeks(post.weeks);
    const last = sorted[sorted.length - 1];
    const init = week || { date: todayISO(), views: '', clicks: '', sales: '', price: last ? last.price : '' };
    const fmtField = (n) => (n === '' || n == null ? '' : String(n).replace('.', ','));

    openDialog({
      title: week ? 'Editar semana' : 'Cargar semana',
      body: `
        <p class="dialog-hint">Ingresá los números <strong>acumulados</strong> que muestra Mercado Libre. Kanshi resta la semana anterior.</p>
        <label class="field">
          <span>Fecha</span>
          <input type="date" name="date" value="${esc(init.date)}" required />
        </label>
        <div class="field-grid">
          <label class="field">
            <span>Vistas acumuladas</span>
            <input type="text" inputmode="numeric" name="views" value="${fmtField(init.views)}" placeholder="0" autocomplete="off" />
          </label>
          <label class="field">
            <span>Clicks acumulados</span>
            <input type="text" inputmode="numeric" name="clicks" value="${fmtField(init.clicks)}" placeholder="0" autocomplete="off" />
          </label>
          <label class="field">
            <span>Ventas acumuladas</span>
            <input type="text" inputmode="numeric" name="sales" value="${fmtField(init.sales)}" placeholder="0" autocomplete="off" />
          </label>
          <label class="field">
            <span>Precio ($)</span>
            <input type="text" inputmode="decimal" name="price" value="${fmtField(init.price)}" placeholder="0" autocomplete="off" />
          </label>
        </div>
        <label class="check" id="baseline-field" hidden>
          <input type="checkbox" name="firstIsBaseline" ${post.firstIsBaseline ? 'checked' : ''} />
          <span>La publicación ya tenía vistas o ventas antes de esta fecha: usar esta semana <strong>sólo como punto de partida</strong>.</span>
        </label>
        <div class="prev-box" id="prev-box"></div>
        <p class="form-error" id="form-error" hidden></p>`,
      actions: [{ label: 'Cancelar' }, { label: week ? 'Guardar cambios' : 'Guardar semana', submit: true, className: 'btn-primary' }],
      onOpen: (b) => {
        const update = () => updatePrevBox(b, post, week);
        b.querySelectorAll('input').forEach((i) => i.addEventListener('input', update));
        update();
      },
      onSubmit: (b) => {
        const get = (n) => b.querySelector(`[name=${n}]`).value;
        const date = get('date');
        const data = {
          views: parseNumber(get('views'), true),
          clicks: parseNumber(get('clicks'), true),
          sales: parseNumber(get('sales'), true),
          price: parseNumber(get('price'), false),
        };
        const err = b.querySelector('#form-error');
        const fail = (msg) => { err.textContent = msg; err.hidden = false; return false; };
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail('Elegí una fecha.');
        const names = { views: 'las vistas', clicks: 'los clicks', sales: 'las ventas', price: 'el precio' };
        for (const k of Object.keys(data)) {
          if (!isFinite(data[k]) || data[k] < 0) return fail(`Revisá ${names[k]}: tiene que ser un número mayor o igual a 0.`);
        }
        if (data.clicks > data.views) return fail('Los clicks no pueden ser más que las vistas.');

        if (!b.querySelector('#baseline-field').hidden) {
          post.firstIsBaseline = b.querySelector('[name=firstIsBaseline]').checked;
        }
        if (week) {
          Object.assign(week, { date }, data);
        } else {
          post.weeks.push(Object.assign({ id: uid(), date, createdAt: Date.now() }, data));
        }
        persist();
        renderPostTabs();
        renderPostView();
        toast(week ? 'Semana actualizada' : 'Semana cargada');
      },
    });
  }

  // Muestra la semana anterior (según la fecha elegida) y avisa inconsistencias.
  function updatePrevBox(b, post, editing) {
    const box = b.querySelector('#prev-box');
    const date = b.querySelector('[name=date]').value;
    const others = KanshiCalc.sortWeeks(post.weeks.filter((w) => !editing || w.id !== editing.id));
    const prev = others.filter((w) => w.date <= date).pop();
    const next = others.find((w) => w.date > date);
    const dup = others.some((w) => w.date === date);
    const val = (n) => parseNumber(b.querySelector(`[name=${n}]`).value, true);

    const notes = [];
    if (prev) {
      notes.push(`<div class="prev-line"><strong>Semana anterior (${fmtDate(prev.date)}):</strong> ${fmtInt(prev.views)} vistas · ${fmtInt(prev.clicks)} clicks · ${fmtInt(prev.sales)} ventas</div>`);
      const lower = ['views', 'clicks', 'sales'].filter((k) => isFinite(val(k)) && val(k) < prev[k]);
      if (lower.length) {
        const n = { views: 'vistas', clicks: 'clicks', sales: 'ventas' };
        notes.push(`<div class="prev-warn">⚠ ${lower.map((k) => n[k]).join(', ')} menor${lower.length > 1 ? 'es' : ''} que la semana anterior. ¿Seguro que es el acumulado?</div>`);
      }
    } else {
      notes.push('<div class="prev-line">Esta será la <strong>Semana 1</strong>.</div>');
    }
    // La opción "punto de partida" sólo aplica a la primera semana.
    b.querySelector('#baseline-field').hidden = !!prev;
    if (next) notes.push(`<div class="prev-line muted">Hay una semana posterior (${fmtDate(next.date)}): esta se va a ubicar antes.</div>`);
    if (dup) notes.push('<div class="prev-warn">⚠ Ya hay una semana cargada con esa fecha.</div>');
    box.innerHTML = notes.join('');
    box.hidden = !notes.length;
  }

  // ---------- Acciones ----------

  async function addPost() {
    const name = await promptName({ title: 'Nueva publicación', label: 'Nombre de la publicación', confirm: 'Crear' });
    if (!name) return;
    const acc = currentAccount();
    const post = { id: uid(), name, createdAt: Date.now(), weeks: [] };
    acc.posts.push(post);
    state.ui.postByAccount[acc.id] = post.id;
    persist();
    render();
  }

  async function renamePost() {
    const post = currentPost();
    const name = await promptName({ title: 'Renombrar publicación', label: 'Nombre', value: post.name });
    if (!name) return;
    post.name = name;
    persist();
    render();
  }

  async function deletePost() {
    const acc = currentAccount();
    const post = currentPost();
    const n = post.weeks.length;
    const ok = await confirmDanger({
      title: 'Eliminar publicación',
      message: `Vas a eliminar <strong>${esc(post.name)}</strong>${n ? ` y sus ${n} semana${n > 1 ? 's' : ''} cargada${n > 1 ? 's' : ''}` : ''}. Esta acción no se puede deshacer.`,
      confirm: 'Eliminar',
    });
    if (!ok) return;
    const idx = acc.posts.indexOf(post);
    acc.posts.splice(idx, 1);
    const neighbor = acc.posts[idx] || acc.posts[idx - 1];
    state.ui.postByAccount[acc.id] = neighbor ? neighbor.id : null;
    persist();
    render();
    toast('Publicación eliminada');
  }

  async function renameAccount() {
    const acc = currentAccount();
    const name = await promptName({ title: 'Renombrar cuenta', label: 'Nombre de la cuenta', value: acc.name });
    if (!name) return;
    acc.name = name;
    persist();
    render();
  }

  async function deleteWeek(weekId) {
    const post = currentPost();
    const row = KanshiCalc.computeWeeks(post.weeks, post).find((r) => r.id === weekId);
    const ok = await confirmDanger({
      title: 'Borrar semana',
      message: `Vas a borrar la <strong>Semana ${row.number}</strong> (${fmtDate(row.date)}). Las semanas siguientes se vuelven a numerar y recalcular.`,
      confirm: 'Borrar',
    });
    if (!ok) return;
    post.weeks = post.weeks.filter((w) => w.id !== weekId);
    persist();
    renderPostTabs();
    renderPostView();
    toast('Semana borrada');
  }

  // ---------- Respaldo y Excel ----------

  function download(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function backup() {
    const payload = { app: 'kanshi', version: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data: state };
    download(`kanshi-respaldo-${todayISO()}.json`, new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    toast('Copia de seguridad descargada');
  }

  async function restore(file) {
    let next;
    try {
      const json = JSON.parse(await file.text());
      next = normalizeState(json.data || json);
    } catch (err) {
      toast(err instanceof SyntaxError ? 'El archivo no es una copia de seguridad válida.' : err.message, 'error');
      return;
    }
    const posts = next.accounts.reduce((s, a) => s + a.posts.length, 0);
    const ok = await confirmDanger({
      title: 'Restaurar copia de seguridad',
      message: `La copia tiene ${next.accounts.length} cuenta${next.accounts.length > 1 ? 's' : ''} y ${posts} publicaci${posts === 1 ? 'ón' : 'ones'}. <strong>Va a reemplazar todos los datos actuales.</strong> Si querés, descargá antes una copia de lo que tenés ahora.`,
      confirm: 'Restaurar',
    });
    if (!ok) return;
    state = next;
    persist();
    render();
    toast('Datos restaurados');
  }

  function exportExcel() {
    if (!window.XLSX) return toast('No se pudo cargar el exportador de Excel. Revisá tu conexión.', 'error');
    const wb = XLSX.utils.book_new();
    const used = new Set();
    const sheetName = (base) => {
      let name = base.replace(/[\[\]:*?\/\\]/g, ' ').trim().slice(0, 31) || 'Hoja';
      let i = 2;
      while (used.has(name.toLowerCase())) {
        const suffix = ` (${i++})`;
        name = name.slice(0, 31 - suffix.length) + suffix;
      }
      used.add(name.toLowerCase());
      return name;
    };
    const PCT = '0.0%';
    const CONV = '0.00%';
    const MONEY = '"$" #,##0.00';
    const INT = '#,##0';
    const applyFormats = (ws, formats, firstRow) => {
      const range = XLSX.utils.decode_range(ws['!ref']);
      for (let r = firstRow; r <= range.e.r; r++) {
        formats.forEach((f, c) => {
          const cell = ws[XLSX.utils.encode_cell({ r, c })];
          if (f && cell && cell.t === 'n') cell.z = f;
        });
      }
    };

    // Resumen
    const summary = [['Cuenta', 'Publicación', 'Semanas', 'Vistas acumuladas', 'Clicks acumulados', 'Ventas acumuladas', 'Facturación registrada', 'Conversión total']];
    state.accounts.forEach((a) => a.posts.forEach((p) => {
      const s = KanshiCalc.summarize(KanshiCalc.computeWeeks(p.weeks, p));
      summary.push([a.name, p.name, s ? s.weeks : 0, s ? s.totalViews : 0, s ? s.totalClicks : 0, s ? s.totalSales : 0, s ? s.totalRevenue : 0, s ? s.conversion : null]);
    }));
    const wsSum = XLSX.utils.aoa_to_sheet(summary);
    applyFormats(wsSum, [null, null, INT, INT, INT, INT, MONEY, CONV], 1);
    wsSum['!cols'] = [{ wch: 16 }, { wch: 28 }, { wch: 9 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 20 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, wsSum, sheetName('Resumen'));

    // Una hoja por publicación
    const header = ['Semana', 'Fecha', 'Vistas', 'Clicks', 'Ventas', 'Precio', 'Facturación', 'Conversión',
      'Δ Vistas', 'Δ Clicks', 'Δ Ventas', 'Δ Precio', 'Δ Facturación', 'Δ Conversión',
      'Vistas acum.', 'Clicks acum.', 'Ventas acum.'];
    const formats = [null, null, INT, INT, INT, MONEY, MONEY, CONV, PCT, PCT, PCT, PCT, PCT, PCT, INT, INT, INT];
    state.accounts.forEach((a) => a.posts.forEach((p) => {
      const rows = KanshiCalc.computeWeeks(p.weeks, p);
      const aoa = [[`${a.name} · ${p.name}`], header];
      rows.forEach((r) => {
        const c = r.change;
        aoa.push([`Semana ${r.number}`, fmtDate(r.date), r.views, r.clicks, r.sales, r.price, r.revenue, r.conversion,
          c.views, c.clicks, c.sales, c.price, c.revenue, c.conversion,
          r.cumulative.views, r.cumulative.clicks, r.cumulative.sales]);
      });
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      applyFormats(ws, formats, 2);
      ws['!cols'] = header.map((h, i) => ({ wch: i < 2 ? 12 : Math.max(11, h.length + 2) }));
      XLSX.utils.book_append_sheet(wb, ws, sheetName(`${a.name} - ${p.name}`));
    }));

    XLSX.writeFile(wb, `kanshi-${todayISO()}.xlsx`);
    toast('Excel descargado');
  }

  // ---------- Toast ----------

  let toastTimer = null;
  function toast(msg, type) {
    const el = $('#toast');
    el.textContent = msg;
    el.className = `toast ${type === 'error' ? 'toast-error' : ''}`;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, type === 'error' ? 5000 : 2500);
  }

  // ---------- Eventos ----------

  function bindEvents() {
    $('#account-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-account]');
      if (!b) return;
      state.ui.accountId = b.dataset.account;
      persist();
      render();
    });

    $('#post-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-post]');
      if (!b) return;
      state.ui.postByAccount[currentAccount().id] = b.dataset.post;
      persist();
      renderPostTabs();
      renderPostView();
    });

    $('#btn-rename-account').addEventListener('click', renameAccount);
    $('#btn-add-post').addEventListener('click', addPost);

    $('#post-view').addEventListener('click', (e) => {
      const b = e.target.closest('[data-action]');
      if (!b) return;
      const post = currentPost();
      switch (b.dataset.action) {
        case 'add-post': return addPost();
        case 'rename-post': return renamePost();
        case 'delete-post': return deletePost();
        case 'add-week': return weekDialog(post);
        case 'edit-week': return weekDialog(post, post.weeks.find((w) => w.id === b.dataset.week));
        case 'delete-week': return deleteWeek(b.dataset.week);
        case 'period-preset':
          Object.assign(state.ui.period, periodPreset(b.dataset.preset));
          persist();
          return renderPostView();
        case 'period-scope':
          state.ui.period.scope = b.dataset.scope;
          persist();
          return renderPostView();
        case 'open-post':
          state.ui.accountId = b.dataset.account;
          state.ui.postByAccount[b.dataset.account] = b.dataset.post;
          persist();
          return render();
        case 'toggle-baseline':
          post.firstIsBaseline = !post.firstIsBaseline;
          persist();
          return renderPostView();
        case 'toggle-order':
          state.ui.newestFirst = !state.ui.newestFirst;
          persist();
          return renderPostView();
      }
    });

    $('#post-view').addEventListener('change', (e) => {
      const field = e.target.dataset.period;
      if (!field || !e.target.value) return;
      state.ui.period[field] = e.target.value;
      persist();
      renderPostView();
    });

    // Menú de respaldo
    const menuBtn = $('#btn-data-menu');
    const menu = $('#data-menu');
    const setMenu = (open) => { menu.hidden = !open; menuBtn.setAttribute('aria-expanded', String(open)); };
    menuBtn.addEventListener('click', (e) => { e.stopPropagation(); setMenu(menu.hidden); });
    document.addEventListener('click', (e) => { if (!menu.contains(e.target)) setMenu(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

    $('#btn-backup').addEventListener('click', () => { setMenu(false); backup(); });
    $('#btn-restore').addEventListener('click', () => { setMenu(false); $('#file-restore').click(); });
    $('#file-restore').addEventListener('change', (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (f) restore(f);
    });
    $('#btn-export-xlsx').addEventListener('click', exportExcel);

    // Redibujar gráficos al cambiar el tema del sistema
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => renderPostView());
  }

  // ---------- Inicio ----------

  async function init() {
    bindEvents();
    try {
      const saved = await KanshiStorage.load();
      state = saved ? normalizeState(saved) : defaultState();
    } catch (err) {
      console.error(err);
      state = defaultState();
      toast('No se pudieron leer los datos guardados.', 'error');
    }
    if (!state.ui.accountId) state.ui.accountId = state.accounts[0].id;
    render();
  }

  init();
})();
