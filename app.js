// ==========================================
// CONFIGURACIÓN FIREBASE
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyCNnyVRFkdcLX8SFTbiIAmC05cXy63Me64",
    authDomain: "tablero-servicio-hyundai.firebaseapp.com",
    databaseURL: "https://tablero-servicio-hyundai-default-rtdb.firebaseio.com",
    projectId: "tablero-servicio-hyundai",
    storageBucket: "tablero-servicio-hyundai.firebasestorage.app",
    messagingSenderId: "455631253850",
    appId: "1:455631253850:web:f9385b23ebb6c333a14363"
};
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// ==========================================
// VARIABLES DE ROLES Y PERMISOS
// ==========================================
let USER_ROLE = null; 
let IS_ADMIN = false;
let ALLOWED_SECTIONS = []; 

let DB_NOTAS_COMPARTIDAS = {}; 
let DATOS_GLOBALES = null; 
let RAW_EXCEL_DATA = null;
let CURRENT_SECTION_KEY = null; 
let chartInstance1 = null;
let SORT_STATE = {}; 
let FILTROS_POR_SECCION = {}; 
let ACTIVE_FILTER_SECTION = null; 

const moneyFormat = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById('fecha-hoy').innerText = new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    Chart.register(ChartDataLabels);

    document.getElementById('btn-login').addEventListener('click', verificarPassword);
    document.getElementById('pass-input').addEventListener("keypress", function(event) {
        if (event.key === "Enter") { event.preventDefault(); verificarPassword(); }
    });

    document.getElementById('btn-sync').addEventListener('click', () => mostrarToast("Datos sincronizados.", "fa-cloud"));
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

    window.onclick = function(e) { 
        if (e.target == document.getElementById('kpiModal')) cerrarModal(); 
        let menu = document.getElementById('floatingFilter'); 
        if (menu.style.display === 'block' && !menu.contains(e.target) && !e.target.classList.contains('fa-filter')) { cerrarMenuFiltro(); }
    };
});

function mostrarToast(mensaje, icono = 'fa-check-circle') {
    let toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="fas ${icono}"></i> ${mensaje}`;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Colores muy sutiles para no ocultar las líneas de la tabla
function getPastelColor(texto) {
    if (!texto || texto.trim() === "") return 'transparent'; 
    texto = texto.toLowerCase().trim();
    let hash = 0;
    for (let i = 0; i < texto.length; i++) { hash = texto.charCodeAt(i) + ((hash << 5) - hash); }
    let h = Math.abs(hash) % 360; return `hsl(${h}, 50%, 97%)`; 
}

// ==========================================
// SISTEMA DE ROLES
// ==========================================
function verificarPassword() {
    let input = document.getElementById('pass-input').value.trim().toUpperCase();
    
    IS_ADMIN = false; ALLOWED_SECTIONS = [];
    
    if (input === 'YCA0') { USER_ROLE = 'Administrador'; IS_ADMIN = true; ALLOWED_SECTIONS = ['A', 'S', 'N', 'V', 'G', 'I']; } 
    else if (input === 'YCD3') { USER_ROLE = 'Siniestros'; ALLOWED_SECTIONS = ['A', 'S']; } 
    else if (input === 'YCR0' || input === 'YCR') { USER_ROLE = 'Normales'; ALLOWED_SECTIONS = ['N']; } 
    else if (input === 'YCD2') { USER_ROLE = 'Garantías'; ALLOWED_SECTIONS = ['G']; } 
    else if (input === 'YCD0') { USER_ROLE = 'Visor'; ALLOWED_SECTIONS = []; } 
    else { document.getElementById('login-error').style.display = 'block'; document.getElementById('pass-input').value = ''; return; }
    
    iniciarApp();
}

function iniciarApp() {
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('main-app').style.display = 'block';
    
    if (!IS_ADMIN) { document.getElementById('caja-cargar-excel').style.display = 'none'; }
    if (USER_ROLE === 'Visor') { mostrarToast("Sesión iniciada como Visor (Modo Lectura)", "fa-eye"); } 
    else { mostrarToast(`Sesión iniciada: ${USER_ROLE}`, "fa-user-edit"); }

    try {
        let filtrosGuardados = localStorage.getItem('hyundai_filtros_seccion');
        if (filtrosGuardados) {
            let parsed = JSON.parse(filtrosGuardados);
            for (let key in parsed) { FILTROS_POR_SECCION[key] = new Set(parsed[key]); }
        }
    } catch (e) { console.error(e); }

    iniciarConexionNube();
}

// ==========================================
// FIREBASE
// ==========================================
function iniciarConexionNube() {
    database.ref('excel_compartido').on('value', (snapshot) => {
        let datosEnNube = snapshot.val();
        
        if (datosEnNube && datosEnNube.datos_json) {
            try {
                RAW_EXCEL_DATA = JSON.parse(datosEnNube.datos_json);
                document.getElementById('ultima-carga-fecha').innerText = datosEnNube.fecha_subida;
                
                document.getElementById('empty-state').style.display = 'none';
                document.getElementById('summary-panel').style.display = 'grid';
                document.getElementById('email-section').style.display = 'block';
                document.getElementById('dashboard').style.display = 'grid';

                analizarDatos(RAW_EXCEL_DATA);
            } catch(e) { console.error("Error al leer Excel de la nube", e); }
        } else {
            document.getElementById('empty-state').style.display = 'block';
            document.getElementById('summary-panel').style.display = 'none';
            document.getElementById('email-section').style.display = 'none';
            document.getElementById('dashboard').style.display = 'none';
            if(IS_ADMIN) { document.getElementById('ultima-carga-fecha').innerText = "Esperando primer archivo"; }
        }
    });

    database.ref('notas').on('value', (snapshot) => {
        DB_NOTAS_COMPARTIDAS = snapshot.val() || {};
        actualizarListasDesplegables();
        if (DATOS_GLOBALES) { 
            let ordenKeys = ['A', 'S', 'N', 'V', 'G', 'I'];
            ordenKeys.forEach(key => {
                if (DATOS_GLOBALES[key] && DATOS_GLOBALES[key].ordenes.length > 0) { renderizarTablaSeccion(key); }
            });
        }
    });
}

function cargarExcelNube(e) {
    let reader = new FileReader();
    reader.onload = function(e) {
        let data = new Uint8Array(e.target.result);
        let workbook = XLSX.read(data, {type: 'array'});
        let json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {defval:""});
        let dateStr = new Date().toLocaleDateString('es-MX') + ' ' + new Date().toLocaleTimeString('es-MX', {hour: '2-digit', minute:'2-digit'});
        document.getElementById('ultima-carga-fecha').innerText = "Subiendo a la nube, espera...";
        
        database.ref('excel_compartido').set({
            fecha_subida: dateStr,
            datos_json: JSON.stringify(json)
        }).then(() => { mostrarToast("Archivo cargado exitosamente.", "fa-cloud-upload-alt");
        }).catch((error) => { mostrarToast("Hubo un error al subir a la nube.", "fa-times"); console.error(error); });
    };
    reader.readAsArrayBuffer(e.target.files[0]);
}

window.guardarDatosNota = function(orden, campo, valor) {
    let letraOrden = orden.charAt(0).toUpperCase();
    let canEdit = IS_ADMIN || ALLOWED_SECTIONS.includes(letraOrden);

    if (!canEdit) {
        mostrarToast("No tienes permisos para modificar este departamento.", "fa-lock");
        renderizarTablaSeccion(letraOrden); 
        return;
    }
    let fechaActual = new Date().toLocaleString('es-MX', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    database.ref('notas/' + orden + '/' + campo).set(valor);
    database.ref('notas/' + orden + '/fecha').set(fechaActual);
};

function leerDatosNota(orden) {
    if (DB_NOTAS_COMPARTIDAS && DB_NOTAS_COMPARTIDAS[orden]) {
        let n = DB_NOTAS_COMPARTIDAS[orden];
        return { comentario: n.comentario || '', observaciones: n.observaciones || '', fecha: n.fecha || '' };
    }
    return { comentario: '', observaciones: '', fecha: '' };
}

function actualizarListasDesplegables() {
    let db = DB_NOTAS_COMPARTIDAS || {}; let com = new Set(); let obs = new Set(); 
    Object.values(db).forEach(i => { if(i.comentario) com.add(i.comentario); if(i.observaciones) obs.add(i.observaciones); });
    let dlCom = document.getElementById('list-comentarios');
    dlCom.innerHTML = ''; com.forEach(c => dlCom.innerHTML += `<option value="${c}">`);
    let dlObs = document.getElementById('list-observaciones');
    if(dlObs) { dlObs.innerHTML = ''; obs.forEach(c => dlObs.innerHTML += `<option value="${c}">`); }
}

// ==========================================
// PROCESAMIENTO Y RENDERIZADO
// ==========================================
function analizarDatos(datos) {
    let secciones = {
        'S': { titulo: 'Siniestros (S)', ordenes: [], total: 0, countOk: 0, countWarn: 0, countAlert: 0 },
        'A': { titulo: 'Siniestros (A)', ordenes: [], total: 0, countOk: 0, countWarn: 0, countAlert: 0 }, 
        'N': { titulo: 'Normales',      ordenes: [], total: 0, countOk: 0, countWarn: 0, countAlert: 0 },
        'V': { titulo: 'Ventas',        ordenes: [], total: 0, countOk: 0, countWarn: 0, countAlert: 0 },
        'I': { titulo: 'Internas',      ordenes: [], total: 0, countOk: 0, countWarn: 0, countAlert: 0 },
        'G': { titulo: 'Garantías',     ordenes: [], total: 0, countOk: 0, countWarn: 0, countAlert: 0 }
    };
    let global = { total: 0, ok: 0, warn: 0, alert: 0, dinero: 0, dineroAlert: 0 };
    actualizarBannerFiltros(); 

    datos.forEach(fila => {
        let orden = String(fila['Orden'] || "").trim().toUpperCase();
        if (orden.length <= 1) return;
        let letra = orden.charAt(0); let sec = secciones[letra]; if (!sec) return;

        let notas = leerDatosNota(orden);
        let estatusFiltro = notas.comentario ? notas.comentario.trim() : "";
        if (estatusFiltro === "") estatusFiltro = "(Vacío)";

        let seccionOcultos = FILTROS_POR_SECCION[letra] || new Set();
        if (seccionOcultos.has(estatusFiltro)) return; 

        let dias = parseFloat(fila['Dias']) || 0;
        let importe = parseFloat(String(fila['Importe  S/iva '] || "0").replace(/[^0-9.-]+/g,"")) || 0;
        let nombre = String(fila['Nombre'] || "Sin Nombre"); 
        let asesor = String(fila['Asesor'] || "No Asignado").replace(/^\d+\s*ASE-\s*/i, '').substring(0, 20);
        
        let semaforo = 'verde';
        if (dias >= 30) semaforo = 'rojo'; else if (dias >= 15) semaforo = 'amarillo';

        sec.ordenes.push({ orden, nombre, asesor, dias, importe, semaforo, comentario: notas.comentario, observaciones: notas.observaciones });
        sec.total += importe;
        
        if (semaforo === 'rojo') sec.countAlert++; else if (semaforo === 'amarillo') sec.countWarn++; else sec.countOk++;
        global.total++; global.dinero += importe;
        if (semaforo === 'rojo') { global.alert++; global.dineroAlert += importe; } 
        else if (semaforo === 'amarillo') { global.warn++; } else { global.ok++; }
    });

    DATOS_GLOBALES = secciones;
    actualizarResumenGlobal(global);
    generarTablaEmail(secciones);
    renderizarTablero(secciones);
}

function actualizarResumenGlobal(g) {
    document.getElementById('kpi-total-ops').innerText = g.total;
    document.getElementById('kpi-ok-ops').innerText = g.ok;
    document.getElementById('kpi-warn-ops').innerText = g.warn;
    document.getElementById('kpi-alert-ops').innerText = g.alert;
    document.getElementById('kpi-money').innerText = moneyFormat.format(g.dinero);
    document.getElementById('kpi-money-sub').innerHTML = `<span style="color:var(--red); font-weight:600;">${moneyFormat.format(g.dineroAlert)}</span> crítico (≥ 30d)`;
}

function generarTablaEmail(secciones) {
    let container = document.getElementById('tabla-resumen-container');
    let keys = ['A', 'S', 'N', 'V', 'G', 'I'];
    let html = `<table class="mini-summary-table" id="tabla-para-copiar"><thead><tr><th style="width:25%">Departamento</th><th>< 15 Días (Verde)</th><th>15-29 Días (Ama)</th><th>≥ 30 Días (Rojo)</th><th>Monto Total</th></tr></thead><tbody>`;
    keys.forEach(key => {
        let sec = secciones[key];
        if (sec.ordenes.length > 0) {
            let estiloAlert = sec.countAlert > 0 ? 'bg-alert-light' : '';
            let estiloWarn = sec.countWarn > 0 ? 'bg-warn-light' : '';
            html += `<tr><td>${sec.titulo}</td><td class="bg-ok-light">${sec.countOk}</td><td class="${estiloWarn}">${sec.countWarn}</td><td class="${estiloAlert}">${sec.countAlert}</td><td style="text-align:right; font-weight:600;">${moneyFormat.format(sec.total)}</td></tr>`;
        }
    });
    html += `</tbody></table>`; container.innerHTML = html;
}

window.cambiarOrden = function(key, modo) { SORT_STATE[key] = modo; renderizarTablaSeccion(key); };
window.toggleCard = function(id, event) { if (event.target.tagName === 'TH' || event.target.tagName === 'I' || event.target.tagName === 'INPUT' || event.target.tagName === 'BUTTON') return; document.getElementById(id).classList.toggle('collapsed'); };

function renderizarTablero(secciones) {
    let container = document.getElementById('dashboard'); container.innerHTML = "";
    let ordenKeys = ['A', 'S', 'N', 'V', 'G', 'I'];
    ordenKeys.forEach(key => {
        let sec = secciones[key];
        if (sec.ordenes.length === 0) return;
        let cardId = `card-${key}`;
        let html = `<div class="card" id="${cardId}"><div class="card-header" onclick="toggleCard('${cardId}', event)"><div class="card-title">${sec.titulo} <small>(${sec.ordenes.length})</small></div><div style="font-weight:700; color:var(--text-main);">${moneyFormat.format(sec.total)} <i class="fas fa-chevron-down chevron"></i></div></div><div class="card-content"><div class="breakdown-bar"><div class="bd-stats"><span class="bd-ok">Verde: ${sec.countOk}</span> <span class="bd-warn">Amarillo: ${sec.countWarn}</span> <span class="bd-alert">Rojo: ${sec.countAlert}</span></div><button class="btn-chart" onclick="abrirGraficas('${key}', '${sec.titulo}')"><i class="fas fa-chart-bar"></i> Gráficas</button></div><div class="table-responsive" id="table-container-${key}"></div></div></div>`;
        container.innerHTML += html;
    });
    ordenKeys.forEach(key => { if (secciones[key] && secciones[key].ordenes.length > 0) { renderizarTablaSeccion(key); } });
}

function renderizarTablaSeccion(key) {
    let sec = DATOS_GLOBALES[key];
    let sortMode = SORT_STATE[key] || 'dias'; 
    if (sortMode === 'asesor') { sec.ordenes.sort((a, b) => { let cmp = a.asesor.localeCompare(b.asesor); if (cmp !== 0) return cmp; return b.dias - a.dias; }); } 
    else { sec.ordenes.sort((a, b) => b.dias - a.dias); }
    
    let classAsesor = sortMode === 'asesor' ? 'active' : '';
    let classDias = sortMode === 'dias' ? 'active' : '';
    let iconAsesor = sortMode === 'asesor' ? '<i class="fas fa-sort-alpha-down"></i>' : '<i class="fas fa-sort" style="opacity:0.3"></i>';
    let iconDias = sortMode === 'dias' ? '<i class="fas fa-sort-numeric-down"></i>' : '<i class="fas fa-sort" style="opacity:0.3"></i>';
    let seccionFiltros = FILTROS_POR_SECCION[key] || new Set();
    let styleFiltro = seccionFiltros.size > 0 ? "color: var(--accent); font-size: 1.2em; transform: scale(1.1);" : "";

    let canEdit = IS_ADMIN || ALLOWED_SECTIONS.includes(key);
    let inputState = canEdit ? '' : 'readonly disabled style="background:#f1f5f9; cursor:not-allowed;" title="Bloqueado"';

    let html = `<table class="track-table"><thead><tr>
                    <th>Orden</th><th>Cliente</th>
                    <th class="th-sortable ${classAsesor}" onclick="cambiarOrden('${key}', 'asesor')" title="Agrupar">Asesor ${iconAsesor}</th>
                    <th class="th-sortable ${classDias}" style="text-align:center;" onclick="cambiarOrden('${key}', 'dias')" title="Ordenar">Días ${iconDias}</th>
                    <th style="text-align:right;">Importe</th>
                    <th style="width: 20%; background-color:var(--card-bg);">Seguimiento <i class="fas fa-filter icon-filter" onclick="abrirMenuFiltroColumna(event, '${key}')" style="cursor:pointer; float:right; ${styleFiltro}" title="Filtrar"></i></th>
                    <th style="width: 20%;">Comentarios</th>
                    <th>Modificado</th>
                </tr></thead><tbody>`;

    sec.ordenes.forEach((item) => {
        let datosNota = leerDatosNota(item.orden);
        let badgeClass = item.semaforo === 'verde' ? 'badge-ok' : (item.semaforo === 'amarillo' ? 'badge-warn' : 'badge-alert');
        let pastelColor = getPastelColor(datosNota.comentario);
        
        html += `<tr id="row-${item.orden}" style="background-color:${pastelColor}">
                <td class="cell-orden">${item.orden}</td>
                <td><span style="font-weight:400; color:var(--text-muted); font-size:0.9em;">${item.nombre}</span></td>
                <td><span class="asesor-name">${item.asesor}</span></td>
                <td class="cell-dias" style="text-align:center;"><span class="badge-dias ${badgeClass}">${item.dias}</span></td>
                <td class="cell-money">${moneyFormat.format(item.importe)}</td>
                <td><input type="text" class="comment-box" list="list-comentarios" placeholder="..." value="${datosNota.comentario}" onchange="guardarDatosNota('${item.orden}', 'comentario', this.value)" ${inputState}></td>
                <td><input type="text" class="comment-box" list="list-observaciones" placeholder="..." value="${datosNota.observaciones}" onchange="guardarDatosNota('${item.orden}', 'observaciones', this.value)" ${inputState}></td>
                <td class="date-cell" id="date-${item.orden}">${datosNota.fecha}</td>
            </tr>`;
    });
    
    html += `</tbody></table>`;
    document.getElementById(`table-container-${key}`).innerHTML = html;
}

// ==========================================
// FILTROS
// ==========================================
function actualizarBannerFiltros() {
    let banner = document.getElementById('active-filters-banner');
    let totalFiltros = 0; let seccionesConFiltro = [];
    for (let key in FILTROS_POR_SECCION) {
        if (FILTROS_POR_SECCION[key].size > 0) {
            totalFiltros += FILTROS_POR_SECCION[key].size;
            seccionesConFiltro.push(DATOS_GLOBALES && DATOS_GLOBALES[key] ? DATOS_GLOBALES[key].titulo : key);
        }
    }
    if (totalFiltros > 0) { banner.style.display = 'flex'; document.getElementById('filtros-count').innerText = totalFiltros; document.getElementById('filtros-seccion').innerText = seccionesConFiltro.join(", "); } else { banner.style.display = 'none'; }
}

window.abrirMenuFiltroColumna = function(event, sectionKey) {
    event.stopPropagation(); ACTIVE_FILTER_SECTION = sectionKey;
    let sectionTitle = DATOS_GLOBALES[sectionKey] ? DATOS_GLOBALES[sectionKey].titulo : sectionKey;
    document.getElementById('filter-section-title').innerText = sectionTitle;
    
    let estatusSet = new Set();
    RAW_EXCEL_DATA.forEach(fila => {
        let orden = String(fila['Orden'] || "").trim().toUpperCase();
        if(orden.length <= 1) return; let letra = orden.charAt(0); if (letra !== sectionKey) return; 
        let notas = leerDatosNota(orden); let estatus = notas.comentario ? notas.comentario.trim() : ""; if(estatus === "") estatus = "(Vacío)";
        estatusSet.add(estatus);
    });

    let contenedor = document.getElementById('floatingFilterList'); contenedor.innerHTML = "";
    let arr = Array.from(estatusSet).sort();
    let seccionOcultos = FILTROS_POR_SECCION[sectionKey] || new Set();

    contenedor.innerHTML += `<label class="filter-item" style="border-bottom:1px solid var(--border-color); padding-bottom:6px; margin-bottom:6px;"><input type="checkbox" id="chkAllFiltro" onchange="window.toggleAllFiltros(this)"><span class="filter-item-text"><strong>(Seleccionar Todo)</strong></span></label>`;
    arr.forEach(est => {
        let isChecked = seccionOcultos.has(est) ? "" : "checked";
        contenedor.innerHTML += `<label class="filter-item"><input type="checkbox" class="chk-filtro-item" value="${est}" ${isChecked} onchange="window.updateChkAll()"><span class="filter-item-text">${est}</span></label>`;
    });
    let menu = document.getElementById('floatingFilter'); menu.style.display = 'block';
    let x = event.pageX - 150; if (x < 10) x = 10; menu.style.left = x + "px"; menu.style.top = (event.pageY + 15) + "px"; window.updateChkAll();
}

window.toggleAllFiltros = function(source) { let checkboxes = document.querySelectorAll('.chk-filtro-item'); checkboxes.forEach(chk => chk.checked = source.checked); }
window.updateChkAll = function() { let chkAll = document.getElementById('chkAllFiltro'); let checkboxes = document.querySelectorAll('.chk-filtro-item'); let allChecked = Array.from(checkboxes).every(chk => chk.checked); if(chkAll) chkAll.checked = allChecked; }
function cerrarMenuFiltro() { document.getElementById('floatingFilter').style.display = 'none'; ACTIVE_FILTER_SECTION = null; }

function aplicarFiltroFlotante() {
    if (!ACTIVE_FILTER_SECTION) return;
    let checkboxes = document.querySelectorAll('.chk-filtro-item');
    if (!FILTROS_POR_SECCION[ACTIVE_FILTER_SECTION]) { FILTROS_POR_SECCION[ACTIVE_FILTER_SECTION] = new Set(); } else { FILTROS_POR_SECCION[ACTIVE_FILTER_SECTION].clear(); }
    checkboxes.forEach(chk => { if (!chk.checked) { FILTROS_POR_SECCION[ACTIVE_FILTER_SECTION].add(chk.value); } });
    let toSave = {}; for (let key in FILTROS_POR_SECCION) { toSave[key] = Array.from(FILTROS_POR_SECCION[key]); }
    localStorage.setItem('hyundai_filtros_seccion', JSON.stringify(toSave));
    cerrarMenuFiltro(); mostrarToast(`Filtros aplicados.`, "fa-filter");
    if (RAW_EXCEL_DATA) { analizarDatos(RAW_EXCEL_DATA); }
}

function limpiarFiltrosFlotantes() { FILTROS_POR_SECCION = {}; localStorage.removeItem('hyundai_filtros_seccion'); mostrarToast("Todos los filtros removidos.", "fa-eye"); if (RAW_EXCEL_DATA) { analizarDatos(RAW_EXCEL_DATA); } }

// ==========================================
// MODAL Y GRÁFICAS
// ==========================================
window.abrirGraficas = function(key, titulo) {
    CURRENT_SECTION_KEY = key; document.getElementById('modalTitle').innerText = "Análisis: " + titulo;
    document.getElementById('kpiModal').style.display = "block"; document.getElementById('modalMainView').style.display = "grid";
    document.getElementById('modalDetailView').style.display = "none"; document.getElementById('modalFiltroSemaforo').value = 'todos'; aplicarFiltroModal();
}

function aplicarFiltroModal() {
    let filtroValor = document.getElementById('modalFiltroSemaforo').value; let sec = DATOS_GLOBALES[CURRENT_SECTION_KEY];
    let ordenesAAnalizar = sec.ordenes.filter(o => { if(filtroValor === 'todos') return true; return o.semaforo === filtroValor; });
    let conteoAsesor = {}; ordenesAAnalizar.forEach(o => { let a = o.asesor || "Sin Asignar"; conteoAsesor[a] = (conteoAsesor[a] || 0) + 1; });
    if(chartInstance1) chartInstance1.destroy();
    let ctx1 = document.getElementById('chartAsesores').getContext('2d');
    chartInstance1 = new Chart(ctx1, { type: 'bar', data: { labels: Object.keys(conteoAsesor), datasets: [{ label: 'Órdenes', data: Object.values(conteoAsesor), backgroundColor: '#0f172a', borderRadius: 4 }] }, options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, datalabels: { anchor: 'end', align: 'end', color: '#1e293b', font: { weight: 'bold' }, formatter: v => v } }, scales: { x: { display: false } } } });

    let conteoStat = {}; ordenesAAnalizar.forEach(o => { let s = o.comentario ? o.comentario.trim() : "Sin Estatus"; if(s==="") s="Sin Estatus"; conteoStat[s] = (conteoStat[s] || 0) + 1; });
    let htmlStat = `<table class="modal-table"><thead><tr><th>Seguimiento</th><th>Cantidad</th></tr></thead><tbody>`;
    Object.entries(conteoStat).sort((a,b)=>b[1]-a[1]).forEach(([s,c]) => { htmlStat += `<tr onclick="window.verDetalleFiltrado('comentario', '${s}')"><td>${s}</td><td><span class="count-badge">${c}</span></td></tr>`; });
    htmlStat += `</tbody></table>`; if (Object.keys(conteoStat).length === 0) htmlStat = "<p style='color:var(--text-muted); text-align:center;'>No hay datos.</p>"; document.getElementById('tableEstatusContainer').innerHTML = htmlStat;

    let conteoObs = {}; ordenesAAnalizar.forEach(o => { let s = o.observaciones ? o.observaciones.trim() : "Sin Comentario"; if(s==="") s="Sin Comentario"; conteoObs[s] = (conteoObs[s] || 0) + 1; });
    let htmlObs = `<table class="modal-table"><thead><tr><th>Comentario</th><th>Cantidad</th></tr></thead><tbody>`;
    Object.entries(conteoObs).sort((a,b)=>b[1]-a[1]).forEach(([s,c]) => { htmlObs += `<tr onclick="window.verDetalleFiltrado('observaciones', '${s}')"><td>${s}</td><td><span class="count-badge" style="background:var(--green); color:white; border:none;">${c}</span></td></tr>`; });
    htmlObs += `</tbody></table>`; if (Object.keys(conteoObs).length === 0) htmlObs = "<p style='color:var(--text-muted); text-align:center;'>No hay datos.</p>"; document.getElementById('tableObservacionesContainer').innerHTML = htmlObs;

    let htmlAsesor = `<table class="modal-table"><thead><tr><th>Asesor</th><th>Cantidad</th></tr></thead><tbody>`;
    Object.entries(conteoAsesor).sort((a,b)=>b[1]-a[1]).forEach(([a,c]) => { htmlAsesor += `<tr onclick="window.verDetalleFiltrado('asesor', '${a}')"><td>${a}</td><td><span class="count-badge" style="background:var(--accent); color:white; border:none;">${c}</span></td></tr>`; });
    htmlAsesor += `</tbody></table>`; if (Object.keys(conteoAsesor).length === 0) htmlAsesor = ""; document.getElementById('tableAsesorContainer').innerHTML = htmlAsesor;
}

window.verDetalleFiltrado = function(tipo, valor) {
    document.getElementById('modalMainView').style.display = "none"; document.getElementById('modalDetailView').style.display = "block";
    let filtroValor = document.getElementById('modalFiltroSemaforo').value; let etqFiltro = filtroValor !== 'todos' ? ` (Filtro: ${filtroValor.toUpperCase()})` : '';
    document.getElementById('detalleTitulo').innerText = `Filtrado por: ${valor}${etqFiltro}`;
    let sec = DATOS_GLOBALES[CURRENT_SECTION_KEY];
    let ordenesFiltradas = sec.ordenes.filter(o => {
        if(filtroValor !== 'todos' && o.semaforo !== filtroValor) return false;
        if (tipo === 'comentario') { let actual = o.comentario ? o.comentario.trim() : "Sin Estatus"; if (actual === "") actual = "Sin Estatus"; return actual === valor; } 
        else if (tipo === 'observaciones') { let actual = o.observaciones ? o.observaciones.trim() : "Sin Comentario"; if (actual === "") actual = "Sin Comentario"; return actual === valor; } 
        else if (tipo === 'asesor') { let actual = o.asesor ? o.asesor.trim() : "Sin Asignar"; if (actual === "") actual = "Sin Asignar"; return actual === valor; } return true;
    });
    ordenesFiltradas.sort((a, b) => b.dias - a.dias);
    let html = `<table id="tabla-detalle-copiar" class="track-table" style="width:100%;"><thead><tr><th>Orden</th><th>Cliente</th><th>Asesor</th><th>Días</th><th>Importe</th><th>Seguimiento</th><th>Comentarios</th></tr></thead><tbody>`;
    ordenesFiltradas.forEach(o => {
        let badge = o.semaforo === 'verde' ? 'badge-ok' : (o.semaforo === 'amarillo' ? 'badge-warn' : 'badge-alert');
        html += `<tr><td class="cell-orden">${o.orden}</td><td><small>${o.nombre}</small></td><td>${o.asesor}</td><td style="text-align:center"><span class="badge-dias ${badge}">${o.dias}</span></td><td class="cell-money">${moneyFormat.format(o.importe)}</td><td>${o.comentario || '-'}</td><td>${o.observaciones || '-'}</td></tr>`;
    });
    html += `</tbody></table>`; document.getElementById('detalleTablaContainer').innerHTML = html;
}

function volverVistaPrincipal() { document.getElementById('modalDetailView').style.display = "none"; if (window.innerWidth <= 900) { document.getElementById('modalMainView').style.display = "block"; } else { document.getElementById('modalMainView').style.display = "grid"; } }
function cerrarModal() { document.getElementById('kpiModal').style.display = "none"; }

// ==========================================
// EXPORTACIÓN Y PORTAPAPELES
// ==========================================
function copiarTabla() { 
    let range = document.createRange(); range.selectNode(document.getElementById('tabla-para-copiar'));
    window.getSelection().removeAllRanges(); window.getSelection().addRange(range); 
    document.execCommand("copy"); window.getSelection().removeAllRanges(); mostrarToast("¡Tabla copiada al portapapeles!");
}

function copiarTablaDetalle() { 
    let tabla = document.getElementById('tabla-detalle-copiar'); if (!tabla) return; 
    let range = document.createRange(); range.selectNode(tabla); 
    window.getSelection().removeAllRanges(); window.getSelection().addRange(range); 
    try { document.execCommand("copy"); mostrarToast("¡Lista copiada!"); } catch (err) { mostrarToast("Error al copiar."); } window.getSelection().removeAllRanges(); 
}

function exportarAExcel() {
    if (!RAW_EXCEL_DATA || RAW_EXCEL_DATA.length === 0) { mostrarToast("No hay datos cargados para exportar.", "fa-exclamation-circle"); return; }
    let dataAExportar = RAW_EXCEL_DATA.reduce((acc, fila) => {
        let orden = String(fila['Orden'] || "").trim().toUpperCase();
        if(orden.length <= 1) return acc;
        let letra = orden.charAt(0); let notas = leerDatosNota(orden); let estatus = notas.comentario ? notas.comentario.trim() : ""; if (estatus === "") estatus = "(Vacío)";
        let seccionOcultos = FILTROS_POR_SECCION[letra] || new Set();
        if (!seccionOcultos.has(estatus)) { acc.push({ ...fila, 'Seguimiento': notas.comentario || '', 'Comentarios': notas.observaciones || '', 'Fecha de Modificación': notas.fecha || '' }); }
        return acc;
    }, []);
    let wb = XLSX.utils.book_new(); let ws = XLSX.utils.json_to_sheet(dataAExportar); XLSX.utils.book_append_sheet(wb, ws, "Seguimiento Diario");
    let fechaStr = new Date().toLocaleDateString('es-MX').replace(/\//g, '-'); XLSX.writeFile(wb, "Reporte_con_Comentarios_" + fechaStr + ".xlsx");
    mostrarToast("Excel exportado exitosamente.");
}

function exportarDetalleAExcel() { 
    let tabla = document.getElementById('tabla-detalle-copiar'); if (!tabla) { mostrarToast("No hay datos para exportar."); return; } 
    let titulo = document.getElementById('detalleTitulo').innerText.replace(/[^a-zA-Z0-9]/g, '_'); 
    let fechaStr = new Date().toLocaleDateString('es-MX').replace(/\//g, '-'); 
    let wb = XLSX.utils.table_to_book(tabla, {sheet: "Detalle Filtrado"}); XLSX.writeFile(wb, titulo + "_" + fechaStr + ".xlsx"); 
}
