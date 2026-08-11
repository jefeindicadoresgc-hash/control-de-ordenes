<!DOCTYPE html>
<html lang="es">
<head>
    <!-- ========================================== -->
    <!-- SECCIÓN 1: CONFIGURACIÓN Y LIBRERÍAS       -->
    <!-- ========================================== -->
    <meta charset="UTF-8">
    <title>Control de Órdenes - Hyundai Coatza</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css">
    <script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js"></script>
    <script src="https://www.gstatic.com/firebasejs/8.10.1/firebase-database.js"></script>
    
    <!-- El ?v=10 fuerza al navegador a cargar el nuevo diseño de botones y tablero -->
    <link rel="stylesheet" href="styles.css?v=10">
    <script src="app.js" defer></script>
</head>
<body>

// ==========================================
// SECCIÓN 2: EVENTOS DOM Y UI
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    // Ya no hay letras chinas, cargamos directamente el sistema.
    document.getElementById('fecha-hoy').innerText = new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    document.getElementById('btn-login').addEventListener('click', verificarPassword);
    document.getElementById('pass-input').addEventListener("keypress", (e) => { if (e.key === "Enter") { e.preventDefault(); verificarPassword(); } });

    document.getElementById('btn-sync').addEventListener('click', () => mostrarToast("Datos sincronizados en tiempo real.", "fa-cloud"));
    document.getElementById('btn-export').addEventListener('click', exportarAExcel);
    document.getElementById('input-excel').addEventListener('change', cargarExcelNube);

    document.getElementById('btn-clear-filters').addEventListener('click', limpiarFiltrosFlotantes);
    document.getElementById('btn-copy-summary').addEventListener('click', copiarTabla);
    document.getElementById('btn-close-filter').addEventListener('click', cerrarMenuFiltro);
    document.getElementById('btn-apply-filter').addEventListener('click', aplicarFiltroFlotante);

    document.getElementById('btn-close-modal').addEventListener('click', cerrarModal);
    document.getElementById('btn-back-modal').addEventListener('click', volverVistaPrincipal);
    document.getElementById('btn-copy-detail').addEventListener('click', copiarTablaDetalle);
    document.getElementById('btn-export-detail').addEventListener('click', exportarDetalleAExcel);
    document.getElementById('modalFiltroSemaforo').addEventListener('change', aplicarFiltroModal);

    document.getElementById('btn-settings').addEventListener('click', abrirAjustes);
    document.getElementById('btn-close-settings').addEventListener('click', () => document.getElementById('settingsModal').style.display = 'none');
    document.getElementById('btn-save-user').addEventListener('click', guardarUsuario);

    // Eventos del Tablero de Comentarios
    let btnSend = document.getElementById('btn-send-comment');
    if(btnSend) btnSend.addEventListener('click', enviarComentarioGeneral);
    
    let inputComment = document.getElementById('new-general-comment');
    if(inputComment) inputComment.addEventListener("keypress", (e) => { if (e.key === "Enter") enviarComentarioGeneral(); });

    window.onclick = function(e) { 
        if (e.target == document.getElementById('kpiModal')) cerrarModal(); 
        if (e.target == document.getElementById('settingsModal')) document.getElementById('settingsModal').style.display = 'none';
        let menu = document.getElementById('floatingFilter'); 
        if (menu.style.display === 'block' && !menu.contains(e.target) && !e.target.classList.contains('fa-filter')) { cerrarMenuFiltro(); }
    };
});

function mostrarToast(mensaje, icono = 'fa-check-circle') {
    let toast = document.createElement('div'); toast.className = 'toast'; toast.innerHTML = `<i class="fas ${icono}"></i> ${mensaje}`;
    document.body.appendChild(toast); setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
}

function getPastelColor(texto) {
    if (!texto || texto.trim() === "") return ''; 
    let hash = 0; texto = texto.toLowerCase().trim();
    for (let i = 0; i < texto.length; i++) { hash = texto.charCodeAt(i) + ((hash << 5) - hash); }
    return `hsl(${Math.abs(hash) % 360}, 40%, 97%)`; 
}
<!-- ========================================== -->
<!-- SECCIÓN 3: CABECERA Y RESUMEN (DASHBOARD)  -->
<!-- ========================================== -->
<div class="container" id="main-app">
    <header>
        <div class="header-left">
            <div class="header-brand">
                <h1>Control de Órdenes</h1>
                <span>Hyundai Coatzacoalcos | <span id="fecha-hoy"></span> | Usuario: <strong id="usuario-activo"></strong></span>
            </div>
        </div>
        <div class="header-actions">
            <div class="upload-info" id="caja-cargar-excel">
                <label class="btn btn-upload">
                    <i class="fas fa-upload"></i> Cargar Excel
                    <input type="file" id="input-excel" accept=".xls,.xlsx,.csv" />
                </label>
                <div class="sync-status">Última carga: <span id="ultima-carga-fecha">Buscando...</span></div>
            </div>
            <button class="btn btn-save" id="btn-settings" style="display: none;"><i class="fas fa-users-cog"></i> Ajustes</button>
            <button class="btn btn-save" id="btn-sync"><i class="fas fa-cloud"></i> Sincronizado</button>
            <button class="btn btn-excel" id="btn-export"><i class="fas fa-file-excel"></i> Exportar</button>
        </div>
    </header>

    <div id="empty-state" class="empty-state" style="display: none;">
        <i class="fas fa-folder-open empty-icon"></i>
        <h2>Base de datos vacía</h2>
        <p>Carga el reporte de Excel para comenzar.</p>
    </div>

    <div id="active-filters-banner" class="filter-banner">
        <div><i class="fas fa-exclamation-triangle"></i> Tienes filtros activos en <span id="filtros-seccion"></span>. Ocultando <span id="filtros-count">0</span> estatus.</div>
        <button class="btn btn-outline-danger" id="btn-clear-filters"><i class="fas fa-times"></i> Quitar Filtros</button>
    </div>

    <div id="summary-panel" class="summary-panel">
        <div class="kpi-card total"><div class="kpi-label">Total Órdenes</div><div class="kpi-value" id="kpi-total-ops">0</div></div>
        <div class="kpi-card ok"><div class="kpi-label">&lt; 15 Días</div><div class="kpi-value txt-ok" id="kpi-ok-ops">0</div></div>
        <div class="kpi-card warn"><div class="kpi-label">15 a 29 Días</div><div class="kpi-value txt-warn" id="kpi-warn-ops">0</div></div>
        <div class="kpi-card alert"><div class="kpi-label">≥ 30 Días</div><div class="kpi-value txt-alert" id="kpi-alert-ops">0</div></div>
        <div class="kpi-card money"><div class="kpi-label">Dinero Total (S/IVA)</div><div class="kpi-value txt-money" id="kpi-money">0</div><div class="kpi-sub" id="kpi-money-sub"></div></div>
    </div>

    <div id="email-section" class="email-section">
        <div class="email-header">
            <h3><i class="fas fa-envelope-open-text"></i> Resumen Ejecutivo (Para Correo)</h3>
            <button class="btn btn-copy" id="btn-copy-summary"><i class="fas fa-copy"></i> Copiar Tabla</button>
        </div>
        <div id="tabla-resumen-container" class="table-responsive"></div>
    </div>

    <!-- ========================================== -->
    <!-- TABLERO DE AVISOS Y COMENTARIOS            -->
    <!-- ========================================== -->
    <div id="general-comments-board" class="comments-board">
        <div class="comments-header">
            <h3><i class="fas fa-bullhorn"></i> Tablero de Avisos Generales</h3>
            <span class="comments-subtitle">Visible para todo el equipo</span>
        </div>
        <div class="comments-list" id="comments-list">
            <!-- Los comentarios se insertarán aquí dinámicamente -->
            <p style="color:var(--grey); font-size:0.9em; text-align:center; margin-top:10px;">Cargando comentarios...</p>
        </div>
        <div class="comments-input-area">
            <input type="text" id="new-general-comment" placeholder="Escribe un aviso, nota o actualización para el equipo..." autocomplete="off">
            <button id="btn-send-comment" class="btn btn-send"><i class="fas fa-paper-plane"></i> Enviar</button>
        </div>
    </div>

    <div id="dashboard" class="grid-container"></div>
</div>

<!-- ========================================== -->
<!-- SECCIÓN 4: MODALES Y MENÚS FLOTANTES       -->
<!-- ========================================== -->
<datalist id="list-comentarios"></datalist>
<datalist id="list-observaciones"></datalist>

<div id="floatingFilter" class="floating-filter-menu" style="display:none;">
    <div class="floating-filter-header">
        <span><i class="fas fa-filter"></i> Filtrar <span id="filter-section-title"></span></span>
        <span class="close-filter" id="btn-close-filter">&times;</span>
    </div>
    <div id="floatingFilterList" class="floating-filter-list"></div>
    <div class="floating-filter-footer">
        <button class="btn btn-save full-width" id="btn-apply-filter">Aplicar Filtro</button>
    </div>
</div>

<div id="kpiModal" class="modal">
    <div class="modal-content">
        <span class="close-modal" id="btn-close-modal">&times;</span>
        <h2 id="modalTitle" class="modal-title">Desglose de Datos</h2>
        <div class="filtro-semaforo-container">
            <label for="modalFiltroSemaforo"><i class="fas fa-filter"></i> Filtrar por Antigüedad:</label>
            <select id="modalFiltroSemaforo">
                <option value="todos">Mostrar Todas las Órdenes</option>
                <option value="verde">Solo Verde (< 15 días)</option>
                <option value="amarillo">Solo Amarillo (15 a 29 días)</option>
                <option value="rojo">Solo Rojo (≥ 30 días)</option>
            </select>
        </div>
        <div id="modalMainView" class="modal-body-main">
            <div class="chart-details-box" style="grid-column: span 2;">
                <p class="hint-text" style="text-align: left; margin-bottom: 10px;">(Haz clic en las filas para ver detalle filtrado)</p>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
                    <div class="detail-section"><h4>Desglose por Seguimiento</h4><div id="tableEstatusContainer"></div></div>
                    <div class="detail-section"><h4 style="border-color: var(--green);">Desglose por Comentarios</h4><div id="tableObservacionesContainer"></div></div>
                    <div class="detail-section"><h4 style="border-color: var(--h-blue);">Desglose por Asesor</h4><div id="tableAsesorContainer"></div></div>
                </div>
            </div>
        </div>
        <div id="modalDetailView" class="modal-body-detail">
            <button class="btn-back" id="btn-back-modal"><i class="fas fa-arrow-left"></i> Volver al Desglose</button>
            <div class="email-header modal-detail-header">
                <h3 id="detalleTitulo" class="txt-money">Detalle Filtrado</h3>
                <div class="flex-gap">
                    <button class="btn btn-copy" id="btn-copy-detail"><i class="fas fa-copy"></i> Copiar Lista</button>
                    <button class="btn btn-excel btn-sm" id="btn-export-detail"><i class="fas fa-file-excel"></i> Excel</button>
                </div>
            </div>
            <div id="detalleTablaContainer" class="table-responsive"></div>
        </div>
    </div>
</div>

<div id="settingsModal" class="modal">
    <div class="modal-content" style="max-width: 800px;">
        <span class="close-modal" id="btn-close-settings">&times;</span>
        <h2 class="modal-title"><i class="fas fa-users-cog"></i> Gestión de Usuarios</h2>
        <div class="settings-form" style="display:grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 25px; padding: 20px; background: var(--bg); border-radius: 8px; border: 1px solid var(--border-color);">
            <div><label class="form-label">Contraseña / Código</label><input type="text" id="set-pass" class="form-input" placeholder="Ej. YCD3"></div>
            <div><label class="form-label">Nombre Real del Usuario</label><input type="text" id="set-nombre" class="form-input" placeholder="Ej. Juan Pérez"></div>
            <div>
                <label class="form-label">Rol del Sistema</label>
                <select id="set-rol" class="form-input">
                    <option value="Administrador">Administrador</option>
                    <option value="Asesor">Asesor (Standard)</option>
                    <option value="Visor">Visor (Solo Lectura)</option>
                </select>
            </div>
            <div>
                <label class="form-label">Departamentos Permitidos (Edición)</label>
                <div style="display:flex; gap:10px; margin-top:5px; flex-wrap:wrap; font-size: 0.9em; font-weight: bold;">
                    <label><input type="checkbox" class="chk-sec" value="S"> Siniestros (S)</label>
                    <label><input type="checkbox" class="chk-sec" value="A"> Siniestros (A)</label>
                    <label><input type="checkbox" class="chk-sec" value="N"> Normales</label>
                    <label><input type="checkbox" class="chk-sec" value="G"> Garantías</label>
                    <label><input type="checkbox" class="chk-sec" value="V"> Ventas</label>
                    <label><input type="checkbox" class="chk-sec" value="I"> Internas</label>
                </div>
            </div>
            <button class="btn btn-upload" style="grid-column: span 2; padding: 12px; font-size: 1.1em;" id="btn-save-user"><i class="fas fa-save"></i> Guardar Usuario</button>
        </div>
        <table class="track-table">
            <thead>
                <tr>
                    <th>Código (Contraseña)</th>
                    <th>Nombre</th>
                    <th>Rol</th>
                    <th>Secciones</th>
                    <th>Último Acceso</th>
                    <th>Acción</th>
                </tr>
            </thead>
            <tbody id="tabla-usuarios-body"></tbody>
        </table>
    </div>
</div>

<div style="position: fixed; bottom: 3px; right: 8px; font-size: 10px; color: var(--grey); opacity: 0.3; pointer-events: none; z-index: 10000; font-weight: bold; letter-spacing: 1px;">EMM</div>

</body>
</html>
