// ==========================================
// SECCIÓN 1: CONFIGURACIÓN FIREBASE Y ESTADO
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyCNnyVRFkdclX8SFTbilAmC05cXy63Me64",
    authDomain: "tablero-servicio-hyundai.firebaseapp.com",
    databaseURL: "https://tablero-servicio-hyundai-default-rtdb.firebaseio.com",
    projectId: "tablero-servicio-hyundai",
    storageBucket: "tablero-servicio-hyundai.firebasestorage.app",
    messagingSenderId: "455631253850",
    appId: "1:455631253850:web:f9385b23ebb6c333a14363"
};

if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
const database = firebase.database();

let USER_ROLE = null, USER_NAME = null, IS_ADMIN = false, ALLOWED_SECTIONS = []; 
let DB_NOTAS_COMPARTIDAS = {}, DB_USUARIOS = {}, DATOS_GLOBALES = null, RAW_EXCEL_DATA = null;
let CURRENT_SECTION_KEY = null, SORT_STATE = {}, FILTROS_POR_SECCION = {}, ACTIVE_FILTER_SECTION = null; 

const moneyFormat = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });

// ==========================================
// SECCIÓN 2: EVENTOS DOM Y UI
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    // GENERADOR INTELIGENTE DE FONDO MATRIX
    const matrixBg = document.getElementById('matrix-bg');
    if (matrixBg) {
        const columns = Math.ceil(window.innerWidth / 40);
        const rows = Math.ceil(window.innerHeight / 40);
        const totalChars = (columns * rows) + 150; 
        const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポ';
        let fragments = document.createDocumentFragment(); 
        for (let i = 0; i < totalChars; i++) {
            let span = document.createElement('span');
            span.innerText = chars.charAt(Math.floor(Math.random() * chars.length));
            fragments.appendChild(span);
        }
        matrixBg.appendChild(fragments);
    }

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

// ==========================================
// SECCIÓN 3: AUTENTICACIÓN
// ==========================================
function verificarPassword() {
    let input = document.getElementById('pass-input').value.trim();
    if(input === "") return;
    
    IS_ADMIN = false; ALLOWED_SECTIONS = []; USER_NAME = '';
    
    if (input === '2099') {
        USER_ROLE = 'Administrador'; IS_ADMIN = true; USER_NAME = 'Súper Administrador (2099)'; ALLOWED_SECTIONS = ['A', 'S', 'N', 'V', 'G', 'I']; 
        iniciarApp(); return;
    } 
    
    database.ref('usuarios/' + input).once('value').then((snapshot) => {
        if (snapshot.exists()) {
            let u = snapshot.val(); 
            USER_ROLE = u.rol; 
            USER_NAME = u.nombre; 
            IS_ADMIN = (u.rol === 'Administrador'); 
            ALLOWED_SECTIONS = u.secciones || [];
            
            // NUEVO: Registrar la fecha y hora del inicio de sesión
            let fechaAcceso = new Date().toLocaleString('es-MX', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
            database.ref('usuarios/' + input).update({ ultimo_acceso: fechaAcceso });

            iniciarApp();
        } else {
            document.getElementById('login-error').style.display = 'block';
            setTimeout(() => document.getElementById('login-error').style.display = 'none', 3000);
        }
    }).catch(err => alert("Error de red: " + err.message));
}

function iniciarApp() {
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('main-app').style.display = 'block';
    document.getElementById('usuario-activo').innerText = USER_NAME;
    
    if (IS_ADMIN) {
        document.getElementById('caja-cargar-excel').style.display = 'flex'; document.getElementById('btn-settings').style.display = 'block';
        mostrarToast(`Sesión iniciada: Modo Administrador`, "fa-user-shield");
    } else {
        document.getElementById('caja-cargar-excel').style.display = 'none'; document.getElementById('btn-settings').style.display = 'none';
        mostrarToast(`Sesión iniciada: ${USER_NAME}`, "fa-user-edit");
    }

    try { let fg = localStorage.getItem('hyundai_filtros_seccion'); if (fg) { let p = JSON.parse(fg); for (let k in p) { FILTROS_POR_SECCION[k] = new Set(p[k]); } } } catch (e) {}
    iniciarConexionNube();
}

// ==========================================
// SECCIÓN 4: CONEXIÓN FIREBASE
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
            } catch(e) { console.error("Error al procesar Excel", e); }
        } else {
            document.getElementById('empty-state').style.display = 'block'; document.getElementById('summary-panel').style.display = 'none';
            document.getElementById('email-section').style.display = 'none'; document.getElementById('dashboard').style.display = 'none';
            if(IS_ADMIN) document.getElementById('ultima-carga-fecha').innerText = "Esperando Excel";
        }
    });

    database.ref('notas').on('value', (snapshot) => {
        DB_NOTAS_COMPARTIDAS = snapshot.val() || {}; actualizarListasDesplegables();
        if (DATOS_GLOBALES) {
            for (let orden in DB_NOTAS_COMPARTIDAS) {
                let n = DB_NOTAS_COMPARTIDAS[orden];
                let inCom = document.getElementById('comentario-' + orden), inObs = document.getElementById('obs-' + orden);
                let tdAutor = document.getElementById('autor-' + orden), tdFecha = document.getElementById('date-' + orden), trRow = document.getElementById('row-' + orden);
                if (inCom && document.activeElement !== inCom) inCom.value = n.comentario || '';
                if (inObs && document.activeElement !== inObs) inObs.value = n.observaciones || '';
                if (tdAutor) tdAutor.innerHTML = `<small style="font-weight: bold; color: var(--h-blue);">${n.modificado_por || '-'}</small>`;
                if (tdFecha) tdFecha.innerText = n.fecha || '';
                if (trRow && n.comentario) trRow.style.backgroundColor = getPastelColor(n.comentario);
            }
        }
    });

    database.ref('usuarios').on('value', (snapshot) => { DB_USUARIOS = snapshot.val() || {}; renderizarTablaUsuarios(); });
}

function cargarExcelNube(e) {
    let archivo = e.target.files[0]; if(!archivo) return;
    let reader = new FileReader();
    reader.onload = function(e) {
        let data = new Uint8Array(e.target.result), workbook = XLSX.read(data, {type: 'array'});
        let json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {defval:""});
        let dateStr = new Date().toLocaleDateString('es-MX') + ' ' + new Date().toLocaleTimeString('es-MX', {hour: '2-digit', minute:'2-digit'});
        document.getElementById('ultima-carga-fecha').innerText = "Subiendo archivo...";
        database.ref('excel_compartido').set({ fecha_subida: dateStr, datos_json: JSON.stringify(json) }).then(() => mostrarToast("Archivo cargado.", "fa-cloud-upload-alt")).catch(err => alert("Fallo al subir: " + err.message));
    }; reader.readAsArrayBuffer(archivo);
}

// ==========================================
// SECCIÓN 5: LÓGICA DE TABLEROS Y EXPORTACIÓN
// ==========================================
window.guardarDatosNota = function(orden, campo, valor) {
    orden = orden.toUpperCase().trim(); let letraOrden = orden.charAt(0);
    if (campo === 'comentario' && !IS_ADMIN) { mostrarToast("Solo Admin edita Seguimiento.", "fa-lock"); renderizarTablaSeccion(letraOrden); return; }
    if (campo === 'observaciones' && !IS_ADMIN && !ALLOWED_SECTIONS.includes(letraOrden)) { mostrarToast("Sin permisos aquí.", "fa-lock"); renderizarTablaSeccion(letraOrden); return; }

    let updates = {}; updates['notas/' + orden + '/' + campo] = valor;
    updates['notas/' + orden + '/fecha'] = new Date().toLocaleString('es-MX', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    if (campo === 'observaciones') { updates['notas/' + orden + '/modificado_por'] = USER_NAME; }
    database.ref().update(updates).then(() => mostrarToast("Guardado", "fa-check"));
};

function leerDatosNota(orden) {
    if (DB_NOTAS_COMPARTIDAS && DB_NOTAS_COMPARTIDAS[orden]) { let n = DB_NOTAS_COMPARTIDAS[orden]; return { comentario: n.comentario || '', observaciones: n.observaciones || '', fecha: n.fecha || '', modificado_por: n.modificado_por || '' }; }
    return { comentario: '', observaciones: '', fecha: '', modificado_por: '' };
}

function analizarDatos(datos) {
    let secciones = { 'S': { titulo: 'Siniestros (S)', ordenes: [], total: 0, countOk: 0, countWarn: 0, countAlert: 0 }, 'A': { titulo: 'Siniestros (A)', ordenes: [], total: 0, countOk: 0, countWarn: 0, countAlert: 0 }, 'N': { titulo: 'Normales', ordenes: [], total: 0, countOk: 0, countWarn: 0, countAlert: 0 }, 'V': { titulo: 'Ventas', ordenes: [], total: 0, countOk: 0, countWarn: 0, countAlert: 0 }, 'I': { titulo: 'Internas', ordenes: [], total: 0, countOk: 0, countWarn: 0, countAlert: 0 }, 'G': { titulo: 'Garantías', ordenes: [], total: 0, countOk: 0, countWarn: 0, countAlert: 0 } };
    let global = { total: 0, ok: 0, warn: 0, alert: 0, dinero: 0, dineroAlert: 0 };
    actualizarBannerFiltros(); 

    datos.forEach(fila => {
        let orden = String(fila['Orden'] || "").trim().toUpperCase(); if (orden.length <= 1) return;
        let letra = orden.charAt(0); let sec = secciones[letra]; if (!sec) return;
        let notas = leerDatosNota(orden); let estatusFiltro = notas.comentario ? notas.comentario.trim() : ""; if (estatusFiltro === "") estatusFiltro = "(Vacío)";
        if ((FILTROS_POR_SECCION[letra] || new Set()).has(estatusFiltro)) return; 

        let dias = parseFloat(fila['Dias']) || 0; let importe = parseFloat(String(fila['Importe  S/iva '] || "0").replace(/[^0-9.-]+/g,"")) || 0;
        let semaforo = dias >= 30 ? 'rojo' : (dias >= 15 ? 'amarillo' : 'verde');

        sec.ordenes.push({ orden, nombre: String(fila['Nombre'] || "Sin Nombre"), asesor: String(fila['Asesor'] || "No Asignado").replace(/^\d+\s*ASE-\s*/i, '').substring(0, 20), dias, importe, semaforo, comentario: notas.comentario, observaciones: notas.observaciones, autor: notas.modificado_por, fecha_mod: notas.fecha });
        sec.total += importe; global.total++; global.dinero += importe;
        if (semaforo === 'rojo') { sec.countAlert++; global.alert++; global.dineroAlert += importe; } else if (semaforo === 'amarillo') { sec.countWarn++; global.warn++; } else { sec.countOk++; global.ok++; }
    });

    DATOS_GLOBALES = secciones;
    document.getElementById('kpi-total-ops').innerText = global.total; document.getElementById('kpi-ok-ops').innerText = global.ok; document.getElementById('kpi-warn-ops').innerText = global.warn; document.getElementById('kpi-alert-ops').innerText = global.alert;
    document.getElementById('kpi-money').innerText = moneyFormat.format(global.dinero); document.getElementById('kpi-money-sub').innerHTML = `<span style="color:var(--red); font-weight:bold;">${moneyFormat.format(global.dineroAlert)}</span> crítico (≥ 30d)`;
    generarTablaEmail(secciones); renderizarTablero(secciones);
}

function generarTablaEmail(secciones) {
    let html = `<table class="mini-summary-table" id="tabla-para-copiar"><thead><tr><th style="width:25%">Departamento</th><th>< 15 Días (Verde)</th><th>15-29 Días (Ama)</th><th>≥ 30 Días (Rojo)</th><th>Monto Total</th></tr></thead><tbody>`;
    ['A', 'S', 'N', 'V', 'G', 'I'].forEach(k => { if (secciones[k].ordenes.length > 0) { html += `<tr><td>${secciones[k].titulo}</td><td class="bg-ok-light">${secciones[k].countOk}</td><td class="${secciones[k].countWarn > 0 ? 'bg-warn-light' : ''}">${secciones[k].countWarn}</td><td class="${secciones[k].countAlert > 0 ? 'bg-alert-light' : ''}">${secciones[k].countAlert}</td><td style="text-align:right; font-weight:bold;">${moneyFormat.format(secciones[k].total)}</td></tr>`; } });
    document.getElementById('tabla-resumen-container').innerHTML = html + `</tbody></table>`;
}

window.cambiarOrden = function(key, modo) { SORT_STATE[key] = modo; renderizarTablaSeccion(key); };
window.toggleCard = function(id, event) { if (event.target.tagName === 'TH' || event.target.tagName === 'I' || event.target.tagName === 'INPUT' || event.target.tagName === 'BUTTON') return; document.getElementById(id).classList.toggle('collapsed'); };

function renderizarTablero(secciones) {
    let container = document.getElementById('dashboard'); container.innerHTML = "";
    ['A', 'S', 'N', 'V', 'G', 'I'].forEach(key => {
        let sec = secciones[key]; if (sec.ordenes.length === 0) return; let cardId = `card-${key}`;
        container.innerHTML += `<div class="card" id="${cardId}"><div class="card-header" onclick="toggleCard('${cardId}', event)"><div class="card-title">${sec.titulo} <small>(${sec.ordenes.length})</small></div><div style="font-weight:bold; color:var(--dark-grey);">${moneyFormat.format(sec.total)} <i class="fas fa-chevron-down chevron"></i></div></div><div class="card-content"><div class="breakdown-bar"><div class="bd-stats"><span class="bd-ok">Verde: ${sec.countOk}</span> <span class="bd-warn">Amarillo: ${sec.countWarn}</span> <span class="bd-alert">Rojo: ${sec.countAlert}</span></div><button class="btn-chart" onclick="abrirGraficas('${key}', '${sec.titulo}')"><i class="fas fa-list"></i> Ver Desglose</button></div><div class="table-responsive" id="table-container-${key}"></div></div></div>`;
    });
    ['A', 'S', 'N', 'V', 'G', 'I'].forEach(key => { if (secciones[key] && secciones[key].ordenes.length > 0) renderizarTablaSeccion(key); });
}

function renderizarTablaSeccion(key) {
    let sec = DATOS_GLOBALES[key], sortMode = SORT_STATE[key] || 'dias'; 
    if (sortMode === 'asesor') { sec.ordenes.sort((a, b) => { let cmp = a.asesor.localeCompare(b.asesor); return cmp !== 0 ? cmp : b.dias - a.dias; }); } else { sec.ordenes.sort((a, b) => b.dias - a.dias); }

    let styleFiltro = (FILTROS_POR_SECCION[key] || new Set()).size > 0 ? "color: var(--yellow); font-size: 1.2em; transform: scale(1.1);" : "";
    let inSeg = IS_ADMIN ? '' : 'readonly disabled style="background:var(--bg); cursor:not-allowed;" title="Solo Administrador"';
    let inObs = (IS_ADMIN || ALLOWED_SECTIONS.includes(key)) ? '' : 'readonly disabled style="background:var(--bg); cursor:not-allowed;" title="Sin permisos"';

    let html = `<table class="track-table"><thead><tr><th>Orden</th><th>Cliente</th><th class="th-sortable ${sortMode === 'asesor' ? 'active' : ''}" onclick="cambiarOrden('${key}', 'asesor')">Asesor <i class="fas fa-sort-alpha-down"></i></th><th class="th-sortable ${sortMode === 'dias' ? 'active' : ''}" style="text-align:center;" onclick="cambiarOrden('${key}', 'dias')">Días <i class="fas fa-sort-numeric-down"></i></th><th style="text-align:right;">Importe</th><th style="width: 15%; background-color:var(--bg);">Seguimiento <i class="fas fa-filter icon-filter" onclick="abrirMenuFiltroColumna(event, '${key}')" style="float:right; ${styleFiltro}"></i></th><th style="width: 20%;">Comentarios</th><th style="width: 15%;">Autor Comentario</th><th>Fecha Mod.</th></tr></thead><tbody>`;

    sec.ordenes.forEach((item) => {
        let badgeClass = item.semaforo === 'verde' ? 'badge-ok' : (item.semaforo === 'amarillo' ? 'badge-warn' : 'badge-alert');
        html += `<tr id="row-${item.orden}" style="background-color:${getPastelColor(item.comentario)}"><td class="cell-orden">${item.orden}</td><td><span style="font-weight:normal; color:var(--grey); font-size:0.9em;">${item.nombre}</span></td><td><span class="asesor-name">${item.asesor}</span></td><td class="cell-dias" style="text-align:center;"><span class="badge-dias ${badgeClass}">${item.dias}</span></td><td class="cell-money">${moneyFormat.format(item.importe)}</td><td><input type="text" id="comentario-${item.orden}" class="comment-box" list="list-comentarios" placeholder="..." value="${item.comentario || ''}" onchange="guardarDatosNota('${item.orden}', 'comentario', this.value)" ${inSeg}></td><td><input type="text" id="obs-${item.orden}" class="comment-box" list="list-observaciones" placeholder="Añadir comentario..." value="${item.observaciones || ''}" onchange="guardarDatosNota('${item.orden}', 'observaciones', this.value)" ${inObs}></td><td id="autor-${item.orden}"><small style="font-weight: bold; color: var(--h-blue);">${item.autor || '-'}</small></td><td class="date-cell" id="date-${item.orden}">${item.fecha_mod || ''}</td></tr>`;
    });
    document.getElementById(`table-container-${key}`).innerHTML = html + `</tbody></table>`;
}

// ==========================================
// SECCIÓN 6: MODALES Y CONFIGURACIONES VARIAS
// ==========================================
function abrirAjustes() { let pwd = prompt("Acceso Restringido (Súper Administrador):"); if(pwd === '2099') { document.getElementById('settingsModal').style.display = 'block'; } else { alert("Acceso denegado."); } }
function guardarUsuario() {
    let pass = document.getElementById('set-pass').value.trim(), nombre = document.getElementById('set-nombre').value.trim(), rol = document.getElementById('set-rol').value, secciones = Array.from(document.querySelectorAll('.chk-sec:checked')).map(cb => cb.value);
    if(!pass || !nombre) return;
    database.ref('usuarios/' + pass).set({ nombre: nombre, rol: rol, secciones: secciones }).then(() => { mostrarToast("Usuario guardado"); document.getElementById('set-pass').value = ''; document.getElementById('set-nombre').value = ''; document.querySelectorAll('.chk-sec').forEach(cb => cb.checked = false); });
}
window.eliminarUsuario = function(pwd) { if(confirm("¿Eliminar usuario?")) { database.ref('usuarios/' + pwd).remove().then(() => mostrarToast("Usuario eliminado")); } };
function renderizarTablaUsuarios() { 
    let tbody = document.getElementById('tabla-usuarios-body'); 
    if(!tbody) return; 
    tbody.innerHTML = ''; 
    
    for (let pwd in DB_USUARIOS) { 
        let u = DB_USUARIOS[pwd]; 
        let secStr = (u.secciones && u.secciones.length > 0) ? u.secciones.join(", ") : "Ninguna";
        let ultimoAcceso = u.ultimo_acceso ? u.ultimo_acceso : "Nunca";

        tbody.innerHTML += `<tr>
            <td><strong>${pwd}</strong></td>
            <td>${u.nombre}</td>
            <td>${u.rol}</td>
            <td>${secStr}</td>
            <td style="font-weight: bold; color: var(--grey); font-size: 0.9em;">${ultimoAcceso}</td>
            <td style="text-align:center;"><button class="btn-delete" onclick="eliminarUsuario('${pwd}')" title="Eliminar"><i class="fas fa-trash"></i></button></td>
        </tr>`; 
    } 
}

window.abrirMenuFiltroColumna = function(event, sectionKey) { event.stopPropagation(); ACTIVE_FILTER_SECTION = sectionKey; document.getElementById('filter-section-title').innerText = DATOS_GLOBALES[sectionKey] ? DATOS_GLOBALES[sectionKey].titulo : sectionKey; let estatusSet = new Set(); RAW_EXCEL_DATA.forEach(fila => { let orden = String(fila['Orden'] || "").trim().toUpperCase(); if(orden.length > 1 && orden.charAt(0) === sectionKey) { estatusSet.add(leerDatosNota(orden).comentario ? leerDatosNota(orden).comentario.trim() : "(Vacío)"); } }); let contenedor = document.getElementById('floatingFilterList'); contenedor.innerHTML = `<label class="filter-item" style="border-bottom:1px solid var(--border-color); padding-bottom:8px; margin-bottom:8px;"><input type="checkbox" id="chkAllFiltro" onchange="window.toggleAllFiltros(this)"><strong>(Seleccionar Todo)</strong></label>`; let seccionOcultos = FILTROS_POR_SECCION[sectionKey] || new Set(); Array.from(estatusSet).sort().forEach(est => { contenedor.innerHTML += `<label class="filter-item"><input type="checkbox" class="chk-filtro-item" value="${est}" ${seccionOcultos.has(est) ? "" : "checked"} onchange="window.updateChkAll()"><span>${est}</span></label>`; }); let menu = document.getElementById('floatingFilter'); menu.style.display = 'block'; menu.style.left = Math.max(10, event.pageX - 150) + "px"; menu.style.top = (event.pageY + 15) + "px"; window.updateChkAll(); }
window.toggleAllFiltros = function(source) { document.querySelectorAll('.chk-filtro-item').forEach(chk => chk.checked = source.checked); }
window.updateChkAll = function() { let chkAll = document.getElementById('chkAllFiltro'); if(chkAll) chkAll.checked = Array.from(document.querySelectorAll('.chk-filtro-item')).every(chk => chk.checked); }
function cerrarMenuFiltro() { document.getElementById('floatingFilter').style.display = 'none'; ACTIVE_FILTER_SECTION = null; }
function actualizarBannerFiltros() { let banner = document.getElementById('active-filters-banner'), total = 0, secs = []; for (let k in FILTROS_POR_SECCION) { if (FILTROS_POR_SECCION[k].size > 0) { total += FILTROS_POR_SECCION[k].size; secs.push(DATOS_GLOBALES[k] ? DATOS_GLOBALES[k].titulo : k); } } if (total > 0) { banner.style.display = 'flex'; document.getElementById('filtros-count').innerText = total; document.getElementById('filtros-seccion').innerText = secs.join(", "); } else { banner.style.display = 'none'; } }
function aplicarFiltroFlotante() { if (!ACTIVE_FILTER_SECTION) return; FILTROS_POR_SECCION[ACTIVE_FILTER_SECTION] = new Set(); document.querySelectorAll('.chk-filtro-item').forEach(chk => { if (!chk.checked) FILTROS_POR_SECCION[ACTIVE_FILTER_SECTION].add(chk.value); }); localStorage.setItem('hyundai_filtros_seccion', JSON.stringify(Object.fromEntries(Object.entries(FILTROS_POR_SECCION).map(([k,v]) => [k, Array.from(v)])))); cerrarMenuFiltro(); if (RAW_EXCEL_DATA) analizarDatos(RAW_EXCEL_DATA); }
function limpiarFiltrosFlotantes() { FILTROS_POR_SECCION = {}; localStorage.removeItem('hyundai_filtros_seccion'); if (RAW_EXCEL_DATA) analizarDatos(RAW_EXCEL_DATA); }

window.abrirGraficas = function(key, titulo) { CURRENT_SECTION_KEY = key; document.getElementById('modalTitle').innerText = "Análisis: " + titulo; document.getElementById('kpiModal').style.display = "block"; document.getElementById('modalMainView').style.display = "block"; document.getElementById('modalDetailView').style.display = "none"; document.getElementById('modalFiltroSemaforo').value = 'todos'; aplicarFiltroModal(); }
function aplicarFiltroModal() { let filtro = document.getElementById('modalFiltroSemaforo').value, ordenes = DATOS_GLOBALES[CURRENT_SECTION_KEY].ordenes.filter(o => filtro === 'todos' || o.semaforo === filtro), cs = {}, co = {}, ca = {}; ordenes.forEach(o => { let s1 = o.comentario ? o.comentario.trim() : "Sin Estatus", s2 = o.observaciones ? o.observaciones.trim() : "Sin Comentario", s3 = o.asesor || "Sin Asignar"; cs[s1===""?"Sin Estatus":s1] = (cs[s1===""?"Sin Estatus":s1] || 0) + 1; co[s2===""?"Sin Comentario":s2] = (co[s2===""?"Sin Comentario":s2] || 0) + 1; ca[s3] = (ca[s3] || 0) + 1; }); const gh = (obj, t, clr) => { let r = `<table class="modal-table"><thead><tr><th>Categoría</th><th>Cantidad</th></tr></thead><tbody>`; Object.entries(obj).sort((a,b)=>b[1]-a[1]).forEach(([s,c]) => r += `<tr onclick="window.verDetalleFiltrado('${t}', '${s}')"><td>${s}</td><td><span class="count-badge" style="background:${clr};">${c}</span></td></tr>`); return Object.keys(obj).length ? r + `</tbody></table>` : "<p>No hay datos.</p>"; }; document.getElementById('tableEstatusContainer').innerHTML = gh(cs, 'comentario', 'var(--grey)'); document.getElementById('tableObservacionesContainer').innerHTML = gh(co, 'observaciones', 'var(--green)'); document.getElementById('tableAsesorContainer').innerHTML = gh(ca, 'asesor', 'var(--h-blue)'); }
window.verDetalleFiltrado = function(tipo, valor) { document.getElementById('modalMainView').style.display = "none"; document.getElementById('modalDetailView').style.display = "block"; let filtro = document.getElementById('modalFiltroSemaforo').value; document.getElementById('detalleTitulo').innerText = `Filtrado por: ${valor}`; let html = `<table id="tabla-detalle-copiar" class="track-table"><thead><tr><th>Orden</th><th>Cliente</th><th>Asesor</th><th>Días</th><th>Importe</th><th>Seguimiento</th><th>Comentarios</th></tr></thead><tbody>`; DATOS_GLOBALES[CURRENT_SECTION_KEY].ordenes.filter(o => { if(filtro !== 'todos' && o.semaforo !== filtro) return false; let val = tipo === 'asesor' ? (o.asesor||"Sin") : (tipo === 'comentario' ? (o.comentario||"Sin") : (o.observaciones||"Sin")); return val.trim() === valor || (val.trim()==="" && valor.startsWith("Sin")); }).sort((a, b) => b.dias - a.dias).forEach(o => { html += `<tr style="background-color:${getPastelColor(o.comentario)}"><td>${o.orden}</td><td>${o.nombre}</td><td>${o.asesor}</td><td>${o.dias}</td><td>${moneyFormat.format(o.importe)}</td><td>${o.comentario || '-'}</td><td>${o.observaciones || '-'}</td></tr>`; }); document.getElementById('detalleTablaContainer').innerHTML = html + `</tbody></table>`; }

function volverVistaPrincipal() { document.getElementById('modalDetailView').style.display = "none"; document.getElementById('modalMainView').style.display = "block"; }
function cerrarModal() { document.getElementById('kpiModal').style.display = "none"; }
function actualizarListasDesplegables() { let com = new Set(), obs = new Set(); Object.values(DB_NOTAS_COMPARTIDAS || {}).forEach(i => { if(i.comentario) com.add(i.comentario); if(i.observaciones) obs.add(i.observaciones); }); let dlC = document.getElementById('list-comentarios'), dlO = document.getElementById('list-observaciones'); if(dlC) { dlC.innerHTML = ''; com.forEach(c => dlC.innerHTML += `<option value="${c}">`); } if(dlO) { dlO.innerHTML = ''; obs.forEach(c => dlO.innerHTML += `<option value="${c}">`); } }
function copiarTabla() { let range = document.createRange(); range.selectNode(document.getElementById('tabla-para-copiar')); window.getSelection().removeAllRanges(); window.getSelection().addRange(range); document.execCommand("copy"); window.getSelection().removeAllRanges(); mostrarToast("Copiado al portapapeles"); }
function copiarTablaDetalle() { let tabla = document.getElementById('tabla-detalle-copiar'); if (!tabla) return; let range = document.createRange(); range.selectNode(tabla); window.getSelection().removeAllRanges(); window.getSelection().addRange(range); document.execCommand("copy"); window.getSelection().removeAllRanges(); }
function exportarAExcel() { if (!RAW_EXCEL_DATA || RAW_EXCEL_DATA.length === 0) return; let dataAExportar = RAW_EXCEL_DATA.reduce((acc, fila) => { let orden = String(fila['Orden'] || "").trim().toUpperCase(); if(orden.length > 1) { let notas = leerDatosNota(orden); let estatus = notas.comentario ? notas.comentario.trim() : "(Vacío)"; if (!(FILTROS_POR_SECCION[orden.charAt(0)] || new Set()).has(estatus)) acc.push({ ...fila, 'Seguimiento': notas.comentario || '', 'Comentarios': notas.observaciones || '', 'Autor Comentario': notas.modificado_por || '', 'Fecha Mod.': notas.fecha || '' }); } return acc; }, []); let wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataAExportar), "Seguimiento"); XLSX.writeFile(wb, "Reporte_" + new Date().toLocaleDateString('es-MX').replace(/\//g, '-') + ".xlsx"); }
function exportarDetalleAExcel() { let tabla = document.getElementById('tabla-detalle-copiar'); if (!tabla) return; XLSX.writeFile(XLSX.utils.table_to_book(tabla, {sheet: "Detalle"}), "Detalle_" + new Date().toLocaleDateString('es-MX').replace(/\//g, '-') + ".xlsx"); }
