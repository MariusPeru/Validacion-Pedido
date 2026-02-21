// ============================================================
// dashboard.js — Dashboard Dinámico e Interactivo
// Lee los datos del array global `orders` (ya en memoria)
// ============================================================

// ---- Estado del dashboard ----
let dashCharts = {};     // Instancias Chart.js activas
let dashOrders = [];     // Pedidos filtrados para el dashboard

// ---- Colores del tema ----
const COLORS = {
    azul: 'rgba(96, 165, 250, 0.85)',
    verde: 'rgba(74, 222, 128, 0.85)',
    rojo: 'rgba(248, 113, 113, 0.85)',
    naranja: 'rgba(251, 146, 60, 0.85)',
    violeta: 'rgba(167, 139, 250, 0.85)',
    cyan: 'rgba(34, 211, 238, 0.85)',
    amarillo: 'rgba(250, 204, 21, 0.85)',
    gris: 'rgba(148, 163, 184, 0.85)',
    azulBG: 'rgba(96, 165, 250, 0.15)',
    verdeBG: 'rgba(74, 222, 128, 0.15)',
    rojoBG: 'rgba(248, 113, 113, 0.15)',
    naranjaBG: 'rgba(251, 146, 60, 0.15)',
};

const CHART_DEFAULTS = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { labels: { color: 'rgba(255,255,255,0.8)', font: { family: 'Inter' } } } },
};

// ============================================================
// Inicialización y navegación
// ============================================================
function initDashboard() {
    // Inyectar el HTML del dashboard en el main si no existe
    if (!document.getElementById('dashboard-view')) {
        document.querySelector('.main-content').insertAdjacentHTML('beforeend', getDashboardHTML());
    }

    // Nav: click en "Dashboard"
    document.getElementById('nav-dashboard').addEventListener('click', (e) => {
        e.preventDefault();
        document.querySelectorAll('.nav-links li').forEach(l => l.classList.remove('active'));
        document.getElementById('nav-dashboard').classList.add('active');
        document.getElementById('app-content').style.display = 'none';
        document.getElementById('reports-content').style.display = 'none';
        document.getElementById('dashboard-view').style.display = 'block';

        // Por defecto: filtrar por hoy si aún no hay fechas puestas
        const fromEl = document.getElementById('dash-from');
        const toEl = document.getElementById('dash-to');
        if (!fromEl.value && !toEl.value) {
            const t = new Date();
            const yy = t.getFullYear();
            const mm = String(t.getMonth() + 1).padStart(2, '0');
            const dd = String(t.getDate()).padStart(2, '0');
            fromEl.value = `${yy}-${mm}-${dd}`;
            toEl.value = `${yy}-${mm}-${dd}`;
        }

        renderDashboard();
    });

    // Filtros del dashboard
    document.getElementById('dash-filter-btn').addEventListener('click', renderDashboard);
    document.getElementById('dash-reset-btn').addEventListener('click', () => {
        document.getElementById('dash-from').value = '';
        document.getElementById('dash-to').value = '';
        document.getElementById('dash-driver').value = '';
        renderDashboard();
    });

    // Contador SLA: quitado (ahora es automático desde columna O)
}

// ============================================================
// Render principal
// ============================================================
function renderDashboard() {
    const fromVal = document.getElementById('dash-from').value;
    const toVal = document.getElementById('dash-to').value;
    const driver = (document.getElementById('dash-driver').value || '').toLowerCase().trim();

    // Filtrar pedidos
    dashOrders = (typeof orders !== 'undefined' ? orders : []).filter(o => {
        let ok = true;
        if (fromVal || toVal) {
            const d = new Date(o.fecha);
            d.setHours(0, 0, 0, 0);
            if (fromVal) { const f = new Date(fromVal + 'T00:00:00'); ok = ok && d >= f; }
            if (toVal) { const t = new Date(toVal + 'T00:00:00'); ok = ok && d <= t; }
        }
        if (driver) ok = ok && (o.envio || '').toLowerCase().includes(driver);
        return ok;
    });

    // Poblar selector de repartidores
    const allDrivers = [...new Set((typeof orders !== 'undefined' ? orders : []).map(o => o.envio).filter(Boolean))].sort();
    const dashDriver = document.getElementById('dash-driver');
    if (dashDriver.options.length <= 1) {
        allDrivers.forEach(d => { const opt = document.createElement('option'); opt.value = d; opt.textContent = d; dashDriver.appendChild(opt); });
    }

    renderKPIs();
    renderChartPorDia();
    renderChartPagos();
    renderChartRepartidores();
    renderChartCancelaciones();
    renderChartHoras();
    renderChartValidadores();
    renderTablaDia();
}

// ============================================================
// KPI Cards
// ============================================================
function renderKPIs() {
    const total = dashOrders.length;
    const validados = dashOrders.filter(o => o.estado === 'Validado').length;
    const cancelados = dashOrders.filter(o => o.estado === 'Cancelado' || o.estado === 'Rechazado').length;
    const pendientes = dashOrders.filter(o => o.estado === 'Pendiente').length;
    const montoVal = dashOrders.filter(o => o.estado === 'Validado').reduce((s, o) => s + (parseFloat(o.monto) || 0), 0);
    const fillRate = total > 0 ? (validados / total * 100).toFixed(1) : '0.0';

    // SLA automático desde columna O
    const slaFuera = dashOrders.filter(o => o.sla_fuera && String(o.sla_fuera).trim() !== '').length;
    const slaBase = total - cancelados;
    const slaRate = slaBase > 0 ? (slaFuera / slaBase * 100).toFixed(1) : '0.0';

    setText('kpi-total', total);
    setText('kpi-validados', validados);
    setText('kpi-cancelados', cancelados);
    setText('kpi-pendientes', pendientes);
    setText('kpi-monto', 'S/ ' + montoVal.toFixed(2));
    setText('kpi-fill', fillRate + '%');
    setText('kpi-sla', slaRate + '%');
    setText('kpi-sla-base', `${slaFuera} de ${slaBase} pedidos`);
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

// ============================================================
// Helpers de Chart.js
// ============================================================
function destroyChart(key) {
    if (dashCharts[key]) { dashCharts[key].destroy(); delete dashCharts[key]; }
}

function baseOptions(extra = {}) {
    return Object.assign({}, CHART_DEFAULTS, extra);
}

// ============================================================
// Gráfico 1: Pedidos por Día
// ============================================================
function renderChartPorDia() {
    destroyChart('porDia');
    const byDay = {};
    dashOrders.forEach(o => {
        if (!o.fecha) return;
        let d;
        try { d = new Date(o.fecha); } catch (e) { return; }
        const key = d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' });
        if (!byDay[key]) byDay[key] = { count: 0, monto: 0 };
        byDay[key].count++;
        if (o.estado === 'Validado') byDay[key].monto += parseFloat(o.monto) || 0;
    });
    const labels = Object.keys(byDay).sort();
    const ctx = document.getElementById('chart-por-dia').getContext('2d');
    dashCharts.porDia = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: 'Pedidos', data: labels.map(l => byDay[l].count), borderColor: COLORS.azul, backgroundColor: COLORS.azulBG, tension: 0.3, fill: true }
            ]
        },
        options: baseOptions({
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => ` ${ctx.parsed.y} pedidos`,
                        afterLabel: (ctx) => {
                            const monto = byDay[labels[ctx.dataIndex]]?.monto || 0;
                            return ` Monto validado: S/ ${monto.toFixed(2)}`;
                        }
                    }
                }
            },
            scales: {
                x: { ticks: { color: 'rgba(255,255,255,0.6)' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { beginAtZero: true, ticks: { color: COLORS.azul }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        }),
        plugins: [{
            id: 'verticalLine',
            afterDraw(chart) {
                if (chart.tooltip._active && chart.tooltip._active.length) {
                    const ctx2 = chart.ctx;
                    const x = chart.tooltip._active[0].element.x;
                    const topY = chart.scales.y.top;
                    const bottomY = chart.scales.y.bottom;
                    ctx2.save();
                    ctx2.beginPath();
                    ctx2.moveTo(x, topY);
                    ctx2.lineTo(x, bottomY);
                    ctx2.lineWidth = 1;
                    ctx2.strokeStyle = 'rgba(255,255,255,0.25)';
                    ctx2.setLineDash([4, 4]);
                    ctx2.stroke();
                    ctx2.restore();
                }
            }
        }]
    });
}

// ============================================================
// Gráfico 2: Distribución de Pagos (dona)
// ============================================================
function renderChartPagos() {
    destroyChart('pagos');
    const agrupado = { POS: 0, EFECTIVO: 0, ONLINE: 0, 'Sin tipo': 0 };
    const posDetalle = { TARJETA: 0, QR: 0 };

    dashOrders.filter(o => o.estado === 'Validado').forEach(o => {
        const t = (o.tipo_pago || '').toString().trim().toUpperCase();
        if (t === 'TARJETA') { agrupado.POS++; posDetalle.TARJETA++; }
        else if (t === 'QR') { agrupado.POS++; posDetalle.QR++; }
        else if (t === 'POS') { agrupado.POS++; posDetalle.TARJETA++; } // POS genérico va a Tarjeta
        else if (t === 'EFECTIVO') agrupado.EFECTIVO++;
        else if (t === 'ONLINE') agrupado.ONLINE++;
        else agrupado['Sin tipo']++;
    });

    const montos = { POS: 0, EFECTIVO: 0, ONLINE: 0 };
    dashOrders.filter(o => o.estado === 'Validado').forEach(o => {
        const t = (o.tipo_pago || '').trim().toUpperCase();
        const m = parseFloat(o.monto) || 0;
        if (['TARJETA', 'QR', 'POS'].includes(t)) montos.POS += m;
        else if (t === 'EFECTIVO') montos.EFECTIVO += m;
        else if (t === 'ONLINE') montos.ONLINE += m;
    });

    const labels = Object.keys(agrupado).filter(k => agrupado[k] > 0);
    const colorMap = { POS: COLORS.azul, EFECTIVO: COLORS.verde, ONLINE: COLORS.violeta, 'Sin tipo': COLORS.gris };

    const ctx = document.getElementById('chart-pagos').getContext('2d');
    dashCharts.pagos = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{ data: labels.map(l => agrupado[l]), backgroundColor: labels.map(l => colorMap[l]), borderWidth: 2, borderColor: 'rgba(0,0,0,0.3)' }]
        },
        options: baseOptions({
            plugins: {
                legend: { position: 'bottom', labels: { color: 'rgba(255,255,255,0.8)', padding: 16 } },
                tooltip: {
                    callbacks: {
                        afterLabel: (ctx) => {
                            const lbl = ctx.label;
                            if (lbl === 'POS') return `  Tarjeta: ${posDetalle.TARJETA}  |  QR: ${posDetalle.QR}\n  Monto: S/ ${montos.POS.toFixed(2)}`;
                            if (lbl === 'EFECTIVO') return `  Monto total: S/ ${montos.EFECTIVO.toFixed(2)}`;
                            if (lbl === 'ONLINE') return `  Monto: S/ ${montos.ONLINE.toFixed(2)}`;
                        }
                    }
                }
            }
        })
    });
}

// ============================================================
// Gráfico 3: Ranking de Repartidores
// ============================================================
function renderChartRepartidores() {
    destroyChart('repartidores');
    const validated = {};
    const cancelled = {};

    dashOrders.filter(o => o.envio).forEach(o => {
        const d = o.envio;
        if (o.estado === 'Validado') {
            validated[d] = (validated[d] || 0) + 1;
        } else if (o.estado === 'Cancelado' || o.estado === 'Rechazado') {
            cancelled[d] = (cancelled[d] || 0) + 1;
        }
    });

    // Unir todos los repartidores y ordenar por validados desc
    const allDrivers = [...new Set([...Object.keys(validated), ...Object.keys(cancelled)])];
    const sorted = allDrivers
        .map(d => ({ name: d, val: validated[d] || 0, can: cancelled[d] || 0 }))
        .sort((a, b) => b.val - a.val)
        .slice(0, 10);

    const ctx = document.getElementById('chart-repartidores').getContext('2d');
    dashCharts.repartidores = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sorted.map(e => e.name),
            datasets: [
                { label: 'Validados', data: sorted.map(e => e.val), backgroundColor: COLORS.azul, borderRadius: 4 },
                { label: 'Cancelados', data: sorted.map(e => e.can), backgroundColor: COLORS.rojo, borderRadius: 4 }
            ]
        },
        options: baseOptions({
            indexAxis: 'y',
            scales: {
                x: { stacked: true, ticks: { color: 'rgba(255,255,255,0.6)', stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { stacked: true, ticks: { color: 'rgba(255,255,255,0.8)' }, grid: { display: false } }
            },
            plugins: { legend: { position: 'bottom', labels: { color: 'rgba(255,255,255,0.8)', padding: 12 } } }
        })
    });
}


// ============================================================
// Gráfico 4: Motivos de Cancelación
// ============================================================
function renderChartCancelaciones() {
    destroyChart('cancelaciones');
    const motivos = { 'Por consumidor': 0, 'Por Punto de Venta': 0, 'Por Repartidor': 0 };
    dashOrders.filter(o => o.estado === 'Cancelado' || o.estado === 'Rechazado').forEach(o => {
        const m = (o.motivo_cancelacion || '').trim();
        if (motivos[m] !== undefined) motivos[m]++;
    });
    const ctx = document.getElementById('chart-cancelaciones').getContext('2d');
    dashCharts.cancelaciones = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(motivos),
            datasets: [{ label: 'Cancelaciones', data: Object.values(motivos), backgroundColor: [COLORS.rojo, COLORS.naranja, COLORS.amarillo], borderRadius: 8 }]
        },
        options: baseOptions({
            plugins: { legend: { display: false } }, scales: {
                x: { ticks: { color: 'rgba(255,255,255,0.7)' }, grid: { display: false } },
                y: { ticks: { color: 'rgba(255,255,255,0.6)' }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        })
    });
}

// ============================================================
// Gráfico 5: Pedidos por Hora del Día
// ============================================================
function renderChartHoras() {
    destroyChart('horas');
    const horas = Array(24).fill(0);
    dashOrders.forEach(o => {
        if (!o.fecha) return;
        try { const h = new Date(o.fecha).getHours(); if (h >= 0 && h < 24) horas[h]++; } catch (e) { }
    });
    const labels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}h`);
    const ctx = document.getElementById('chart-horas').getContext('2d');
    dashCharts.horas = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [{ label: 'Pedidos', data: horas, backgroundColor: horas.map(v => v === Math.max(...horas) ? COLORS.naranja : COLORS.violeta), borderRadius: 4 }]
        },
        options: baseOptions({
            plugins: { legend: { display: false } }, scales: {
                x: { ticks: { color: 'rgba(255,255,255,0.6)', maxRotation: 0 }, grid: { display: false } },
                y: { ticks: { color: 'rgba(255,255,255,0.6)' }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        })
    });
}

// ============================================================
// Gráfico 6: Actividad por Validador
// ============================================================
function renderChartValidadores() {
    destroyChart('validadores');
    const byUser = {};
    dashOrders.filter(o => o.validado_por).forEach(o => {
        if (!byUser[o.validado_por]) byUser[o.validado_por] = 0;
        byUser[o.validado_por]++;
    });
    const sorted = Object.entries(byUser).sort((a, b) => b[1] - a[1]);
    const paleta = [COLORS.azul, COLORS.verde, COLORS.violeta, COLORS.naranja, COLORS.cyan];
    const ctx = document.getElementById('chart-validadores').getContext('2d');
    dashCharts.validadores = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: sorted.map(e => e[0]),
            datasets: [{ data: sorted.map(e => e[1]), backgroundColor: sorted.map((_, i) => paleta[i % paleta.length]), borderWidth: 2 }]
        },
        options: baseOptions({ plugins: { legend: { position: 'bottom', labels: { color: 'rgba(255,255,255,0.8)', padding: 12 } } } })
    });
}

// ============================================================
// Tabla: Resumen del Día
// ============================================================
function renderTablaDia() {
    const tbody = document.getElementById('dash-tabla-body');
    tbody.innerHTML = '';
    const recientes = [...dashOrders].sort((a, b) => b.nro - a.nro).slice(0, 20);
    recientes.forEach(o => {
        const hr = o.fecha ? (() => { try { return new Date(o.fecha).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true }); } catch (e) { return ''; } })() : '';
        const estadoClass = o.estado === 'Validado' ? 'color:#4ade80' : o.estado === 'Cancelado' || o.estado === 'Rechazado' ? 'color:#f87171' : 'color:#fbbf24';
        const tipo = (o.tipo_pago || '-').toString().toUpperCase();
        tbody.insertAdjacentHTML('beforeend', `
            <tr>
                <td style="font-weight:600;">${o.llave}</td>
                <td style="${estadoClass}; font-weight:600;">${o.estado}</td>
                <td>S/ ${parseFloat(o.monto || 0).toFixed(2)}</td>
                <td style="font-size:0.85em;">${o.envio || '-'}</td>
                <td><span style="font-size:0.8em; padding:2px 8px; border-radius:12px; background:rgba(255,255,255,0.08);">${tipo}</span></td>
                <td style="font-size:0.8em; color:rgba(255,255,255,0.6);">${hr}</td>
            </tr>`);
    });
}

// ============================================================
// HTML del Dashboard
// ============================================================
function getDashboardHTML() {
    return `
<div id="dashboard-view" style="display:none; padding:20px; overflow-y:auto; height:100%;">

    <!-- Filtros -->
    <div class="glass-panel" style="padding:16px; margin-bottom:20px; display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
        <i class="fa-solid fa-filter" style="color:rgba(255,255,255,0.5);"></i>
        <label style="font-size:0.85em; color:rgba(255,255,255,0.6);">Desde</label>
        <input type="date" id="dash-from" style="background:rgba(255,255,255,0.07); border:1px solid rgba(255,255,255,0.15); color:white; border-radius:8px; padding:6px 10px; color-scheme:dark;">
        <label style="font-size:0.85em; color:rgba(255,255,255,0.6);">Hasta</label>
        <input type="date" id="dash-to" style="background:rgba(255,255,255,0.07); border:1px solid rgba(255,255,255,0.15); color:white; border-radius:8px; padding:6px 10px; color-scheme:dark;">
        <select id="dash-driver" style="background:rgba(255,255,255,0.07); border:1px solid rgba(255,255,255,0.15); color:white; border-radius:8px; padding:6px 10px;">
            <option value="">Todos los repartidores</option>
        </select>
        <button id="dash-filter-btn" class="btn-primary" style="padding:6px 16px;">Aplicar</button>
        <button id="dash-reset-btn" class="btn-secondary" style="padding:6px 12px;">Restablecer</button>
    </div>

    <!-- KPI Cards -->
    <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:14px; margin-bottom:20px;">
        ${kpiCard('kpi-total', 'fa-list-ol', 'Total Pedidos', '0', COLORS.azul)}
        ${kpiCard('kpi-validados', 'fa-circle-check', 'Validados', '0', COLORS.verde)}
        ${kpiCard('kpi-cancelados', 'fa-ban', 'Cancelados', '0', COLORS.rojo)}
        ${kpiCard('kpi-pendientes', 'fa-hourglass-half', 'Pendientes', '0', COLORS.amarillo)}
        ${kpiCard('kpi-monto', 'fa-sack-dollar', 'Monto Validado', 'S/ 0.00', COLORS.cyan)}
        ${kpiCard('kpi-fill', 'fa-percent', 'Fill Rate', '0%', COLORS.naranja)}
        <div class="glass-panel" style="padding:14px; border-radius:12px; border-left:3px solid ${COLORS.violeta}; text-align:center;">
            <div style="color:${COLORS.violeta}; font-size:1.3em; margin-bottom:4px;"><i class="fa-solid fa-stopwatch"></i></div>
            <div style="font-size:0.75em; color:rgba(255,255,255,0.55); margin-bottom:2px;">SLA 35 min</div>
            <div id="kpi-sla" style="font-size:1.6em; font-weight:700; color:white;">0%</div>
            <div id="kpi-sla-base" style="font-size:0.7em; color:rgba(255,255,255,0.4); margin-top:4px;">0 de 0 pedidos</div>
        </div>
    </div>

    <!-- Fila 1: Línea de pedidos/día + Dona de pagos -->
    <div style="display:grid; grid-template-columns:2fr 1fr; gap:16px; margin-bottom:16px;">
        <div class="glass-panel" style="padding:16px; border-radius:12px;">
            <h4 style="margin:0 0 12px; font-size:0.9em; color:rgba(255,255,255,0.7);">📈 Pedidos por Día</h4>
            <div style="height:220px;"><canvas id="chart-por-dia"></canvas></div>
        </div>
        <div class="glass-panel" style="padding:16px; border-radius:12px;">
            <h4 style="margin:0 0 12px; font-size:0.9em; color:rgba(255,255,255,0.7);">💳 Distribución de Pagos</h4>
            <div style="height:220px;"><canvas id="chart-pagos"></canvas></div>
        </div>
    </div>

    <!-- Fila 2: Repartidores + Cancelaciones -->
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:16px;">
        <div class="glass-panel" style="padding:16px; border-radius:12px;">
            <h4 style="margin:0 0 12px; font-size:0.9em; color:rgba(255,255,255,0.7);">🚴 Ranking de Repartidores</h4>
            <div style="height:240px;"><canvas id="chart-repartidores"></canvas></div>
        </div>
        <div class="glass-panel" style="padding:16px; border-radius:12px;">
            <h4 style="margin:0 0 12px; font-size:0.9em; color:rgba(255,255,255,0.7);">❌ Motivos de Cancelación</h4>
            <div style="height:240px;"><canvas id="chart-cancelaciones"></canvas></div>
        </div>
    </div>

    <!-- Fila 3: Horas + Validadores -->
    <div style="display:grid; grid-template-columns:2fr 1fr; gap:16px; margin-bottom:16px;">
        <div class="glass-panel" style="padding:16px; border-radius:12px;">
            <h4 style="margin:0 0 12px; font-size:0.9em; color:rgba(255,255,255,0.7);">🕐 Pedidos por Hora del Día</h4>
            <div style="height:200px;"><canvas id="chart-horas"></canvas></div>
        </div>
        <div class="glass-panel" style="padding:16px; border-radius:12px;">
            <h4 style="margin:0 0 12px; font-size:0.9em; color:rgba(255,255,255,0.7);">👤 Actividad por Validador</h4>
            <div style="height:200px;"><canvas id="chart-validadores"></canvas></div>
        </div>
    </div>

    <!-- Tabla de Últimos Pedidos -->
    <div class="glass-panel" style="padding:16px; border-radius:12px;">
        <h4 style="margin:0 0 12px; font-size:0.9em; color:rgba(255,255,255,0.7);">📋 Últimos 20 Pedidos</h4>
        <div style="overflow-x:auto;">
            <table class="orders-table" style="font-size:0.85em;">
                <thead><tr>
                    <th>Llave</th><th>Estado</th><th>Monto</th><th>Repartidor</th><th>Tipo Pago</th><th>Hora</th>
                </tr></thead>
                <tbody id="dash-tabla-body"></tbody>
            </table>
        </div>
    </div>
</div>`;
}

function kpiCard(id, icon, label, defaultVal, color) {
    return `<div class="glass-panel" style="padding:14px; border-radius:12px; border-left:3px solid ${color}; text-align:center;">
        <div style="color:${color}; font-size:1.3em; margin-bottom:4px;"><i class="fa-solid ${icon}"></i></div>
        <div style="font-size:0.75em; color:rgba(255,255,255,0.55); margin-bottom:2px;">${label}</div>
        <div id="${id}" style="font-size:1.6em; font-weight:700; color:white;">${defaultVal}</div>
    </div>`;
}

// ============================================================
// Arranque: esperar a que app.js inicialice
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    // Espera breve a que app.js termine de registrar sus listeners
    setTimeout(initDashboard, 100);
});

// Exponer para que app.js pueda llamar após loadOrders
window.refreshDashboardIfVisible = function () {
    if (document.getElementById('dashboard-view') &&
        document.getElementById('dashboard-view').style.display !== 'none') {
        renderDashboard();
    }
};
