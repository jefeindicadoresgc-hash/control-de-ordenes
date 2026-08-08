// ==========================================
// CONFIGURACIÓN DE FIREBASE (PRODUCCIÓN - HYUNDAI COATZA)
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

// Inicialización segura
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();

// Variables Globales de Estado
let USER_ROLE = null; 
let USER_NAME = null;
let IS_ADMIN = false;
let ALLOWED_SECTIONS = []; 
let DB_NOTAS_COMPARTIDAS = {}; 
let DB_USUARIOS = {};
let DATOS_GLOBALES = null; 
let RAW_EXCEL_DATA = null;
let CURRENT_SECTION_KEY = null; 
let SORT_STATE = {}; 
let FILTROS_POR_SECCION = {}; 
let ACTIVE_FILTER_SECTION = null; 

const moneyFormat = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });

// ==========================================
// INICIALIZACIÓN Y EVENTOS DEL DOM
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById('fecha-hoy').innerText = new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Login
    document.getElementById('btn-login').addEventListener('click', verificarPassword);
    document.getElementById('pass-input').addEventListener("keypress", function(event) {
        if (event.key === "Enter") { event.preventDefault(); verificarPassword(); }
    });

    // Botones Header
    document.getElementById('btn-sync').addEventListener('click', () => mostrarToast("Datos sincronizados en tiempo real.", "fa-cloud"));
    document.getElementById('btn-export').addEventListener('click', exportarAExcel);
    document.getElementById('input-excel').addEventListener('change', cargarExcelNube);

    // Filtros
    document.getElementById('btn-clear-filters').addEventListener('click', limpiarFiltrosFlotantes);
    document.getElementById('btn-copy-summary').addEventListener('click', copiarTabla);
    document.getElementById('btn-close-filter').addEventListener('click', cerrarMenuFiltro);
    document.getElementById('btn-apply-filter').addEventListener('click', aplicarFiltroFlotante);

    // Modal KPI
    document.getElementById('btn-close-modal').addEventListener('click', cerrarModal);
    document.getElementById('btn-back-modal').addEventListener('click', volverVistaPrincipal);
    document.getElementById('btn-copy-detail').addEventListener('click', copiarTablaDetalle);
    document.getElementById('btn-export-detail').addEventListener('click', exportarDetalleAExcel);
    document.getElementById('modalFiltroSemaforo').addEventListener('change', aplicarFiltroModal);

    // Panel de Ajustes
    document.getElementById('btn-settings').addEventListener('click', abrirAjustes);
    document.getElementById('btn-close-settings').addEventListener('click', () => document.getElementById('settingsModal').style.display = 'none');
    document.getElementById('btn-save-user').addEventListener('click', guardarUsuario);

    // Cierre de menús al hacer clic fuera
    window.onclick = function(e) { 
        if (e.target == document.getElementById('kpiModal')) cerrarModal(); 
        if (e.target == document.getElementById('settingsModal')) document.getElementById('settingsModal').style.display = 'none';
        let menu = document.getElementById('floatingFilter'); 
        if (menu.style.display === 'block' && !menu.contains(e.target) && !e.target.classList.contains('fa-filter')) { cerrarMenuFiltro(); }
    };
});

// UI: Toasts y Colores
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

function getPastelColor(texto) {
    if (!texto || texto.trim() === "") return ''; 
    texto = texto.toLowerCase().trim();
    let hash = 0;
    for (let i = 0; i < texto.length; i++) { hash = texto.charCodeAt(i) + ((hash << 5) - hash); }
    let h = Math.abs(hash) % 360; return `hsl(${h}, 40%, 97%)`; 
}

// ==========================================
// SEGURIDAD Y LOGIN
// ==========================================
function verificarPassword() {
    let input = document.getElementById('pass-input').value.trim();
    if(input === "") return;
    
    IS_ADMIN = false; ALLOWED_SECTIONS = []; USER_NAME = '';
    
    // Cuenta Maestra (Hardcoded de seguridad)
    if (input === '2099') {
        USER_ROLE = 'Administrador';
        IS_ADMIN = true;
        USER_NAME = 'Súper Administrador (2099)';
        ALLOWED_SECTIONS = ['A', 'S', 'N', 'V', 'G', 'I']; 
        iniciarApp();
        return;
    } 
    
    // Validación Dinámica de Usuarios
    database.ref('usuarios/' + input).once('value').then((snapshot) => {
        if (snapshot.exists()) {
            let u = snapshot.val();
            USER_ROLE = u.rol;
            USER_NAME = u.nombre;
            IS_ADMIN = (u.rol === 'Administrador');
            ALLOWED_SECTIONS = u.secciones || [];
            iniciarApp();
        } else {
            document.getElementById('login-error').style.display = 'block';
            setTimeout(() => document.getElementById('login-error').style.display = 'none', 3000);
        }
    }).catch(error => {
        alert("Error de conexión. Verifica tu internet: " + error.message);
    });
}

function iniciarApp() {
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('main-app').style.display = 'block';
    document.getElementById('usuario-activo').innerText = USER_NAME;
    
    if (IS_ADMIN) {
        document.getElementById('caja-cargar-excel').style.display = 'flex';
        document.getElementById('btn-settings').style.display = 'block';
        mostrarToast(`Sesión iniciada: Modo Administrador`, "fa-user-shield");
    } else {
        document.getElementById('caja-cargar-excel').style.display = 'none';
        document.getElementById('btn-settings').style.display = 'none';
        mostrarToast(`Sesión iniciada: ${USER_NAME}`, "fa-user-edit");
    }

    try {
        let filtrosGuardados = localStorage.getItem('hyundai_filtros_seccion');
        if (filtrosGuardados) {
            let parsed = JSON.parse(filtrosGuardados);
            for (let key in parsed) { FILTROS_POR_SECCION[key] = new Set(parsed[key]); }
        }
    } catch (e) {}

    iniciarConexionNube();
}

// ==========================================
// SINCRONIZACIÓN FIREBASE (PRODUCCIÓN)
// ==========================================
function iniciarConexionNube() {
    // 1. Escuchar el Excel
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
            } catch(e) {
                console.error("Error al procesar el Excel en la nube", e);
            }
        } else {
            document.getElementById('empty-state').style.display = 'block';
            document.getElementById('summary-panel').style.display = 'none';
            document.getElementById('email-section').style.display = 'none';
            document.getElementById('dashboard').style.display = 'none';
            if(IS_ADMIN) document.getElementById('ultima-carga-fecha').innerText = "Esperando Excel";
        }
    });

    // 2. Escuchar Comentarios y Seguimientos (Alta Eficiencia)
    database.ref('notas').on('value', (snapshot) => {
        DB_NOTAS_COMPARTIDAS = snapshot.val() || {};
        actualizarListasDesplegables();
        
        // Inyecta el texto sin recargar toda la tabla para evitar cortes de escritura
        if (DATOS_GLOBALES) {
            for (let orden in DB_NOTAS_COMPARTIDAS) {
                let n = DB_NOTAS_COMPARTIDAS[orden];
                let inCom = document.getElementById('comentario-' + orden);
                let inObs = document.getElementById('obs-' + orden);
                let tdAutor = document.getElementById('autor-' + orden);
                let tdFecha = document.getElementById('date-' + orden);
                let trRow = document.getElementById('row-' + orden);

                if (inCom && document.activeElement !== inCom) inCom.value = n.comentario || '';
                if (inObs && document.activeElement !== inObs) inObs.value = n.observaciones || '';
                if (tdAutor) tdAutor.innerHTML = `<small style="font-weight: bold; color: var(--h-blue);">${n.modificado_por || '-'}</small>`;
                if (tdFecha) tdFecha.innerText = n.fecha || '';
                if (trRow && n.comentario) trRow.style.backgroundColor = getPastelColor(n.comentario);
            }
        }
    });

    // 3. Escuchar Usuarios
    database.ref('usuarios').on('value', (snapshot) => {
        DB_USUARIOS = snapshot.val() || {};
        renderizarTablaUsuarios();
    });
}

function cargarExcelNube(e) {
    let archivo = e.target.files[0];
    if(!archivo) return;
    
    let reader = new FileReader();
    reader.onload = function(e) {
        let data = new Uint8Array(e.target.result);
        let workbook = XLSX.read(data, {type: 'array'});
        let json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {defval:""});
        let dateStr = new Date().toLocaleDateString('es-MX') + ' ' + new Date().toLocaleTimeString('es-MX', {hour: '2-digit', minute:'2-digit'});
        
        document.getElementById('ultima-carga-fecha').innerText = "Subiendo archivo...";
        database.ref('excel_compartido').set({ fecha_subida: dateStr, datos_json: JSON.stringify(json) })
            .then(() => mostrarToast("Archivo cargado y distribuido exitosamente.", "fa-cloud-upload-alt"))
            .catch(error => alert("Fallo al subir archivo: " + error.message));
    };
    reader.readAsArrayBuffer(archivo);
}

// ==========================================
// GESTIÓN DE USUARIOS
// ==========================================
function abrirAjustes() {
    let pwd = prompt("Acceso Restringido. Ingrese la contraseña maestra (Súper Administrador):");
    if(pwd === '2099') {
        document.getElementById('settingsModal').style.display = 'block';
    } else {
        alert("Contraseña incorrecta. Acceso denegado.");
    }
}

function guardarUsuario() {
    let pass = document.getElementById('set-pass').value.trim();
    let nombre = document.getElementById('set-nombre').value.trim();
    let rol = document.getElementById('set-rol').value;
    let secciones = Array.from(document.querySelectorAll('.chk-sec:checked')).map(cb => cb.value);

    if(!pass || !nombre) { alert("La contraseña y el nombre son obligatorios."); return; }
    
    let btn = document.getElementById('btn-save-user');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
    
    database.ref('usuarios/' + pass).set({
        nombre: nombre, rol: rol, secciones: secciones
    }).then(() => {
        mostrarToast("Usuario registrado exitosamente");
        document.getElementById('set-pass').value = '';
        document.getElementById('set-nombre').value = '';
        document.querySelectorAll('.chk-sec').forEach(cb => cb.checked = false);
    }).catch(error => {
        alert("Error de guardado en la nube. Detalles: " + error.message);
    }).finally(() => {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Guardar Usuario en la Nube';
    });
}

window.eliminarUsuario = function(pwd) {
    if(confirm("¿Seguro que deseas dar de baja este usuario? Ya no podrá acceder al tablero.")) {
        database.ref('usuarios/' + pwd).remove()
            .then(() => mostrarToast("Usuario eliminado correctamente"))
            .catch(err => alert("Error al eliminar: " + err.message));
    }
};

function renderizarTablaUsuarios() {
    let tbody = document.getElementById('tabla-usuarios-body');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    for (let pwd in DB_USUARIOS) {
        let u = DB_USUARIOS[pwd];
        let secStr = (u.secciones && u.secciones.length > 0) ? u.secciones.join(", ") : "Ninguna";
        tbody.innerHTML += `<tr>
            <td><strong>${pwd}</strong></td>
            <td>${u.nombre}</td>
            <td>${u.rol}</td>
            <td>${secStr}</td>
            <td style="text-align:center;"><button class="btn-delete" onclick="eliminarUsuario('${pwd}')" title="Eliminar"><i class="fas fa-trash"></i></button></td>
        </tr>`;
    }
}

// ==========================================
// MÓDULO DE EDICIÓN DE NOTAS (PRODUCCIÓN)
// ==========================================
window.guardarDatosNota = function(orden, campo, valor) {
    orden = orden.toUpperCase().trim();
    let letraOrden = orden.charAt(0);

    // Validación estricta de permisos
    if (campo === 'comentario') {
        if (!IS_ADMIN) {
            mostrarToast("Solo el Administrador puede modificar el Seguimiento.", "fa-lock");
            renderizarTablaSeccion(letraOrden); return;
        }
    } else if (campo === 'observaciones') {
        let canEdit = IS_ADMIN || ALLOWED_SECTIONS.includes(letraOrden);
        if (!canEdit) {
            mostrarToast("No tienes permisos para comentar en este departamento.", "fa-lock");
            renderizarTablaSeccion(letraOrden); return;
        }
    }

    let fechaActual = new Date().toLocaleString('es-MX', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    let updates = {};
    updates['notas/' + orden + '/' + campo] = valor;
    updates['notas/' + orden + '/fecha'] = fechaActual;
    
    if (campo === 'observaciones') {
        updates['notas/' + orden + '/modificado_por'] = USER_NAME;
    }
    
    // Método UPDATE para fusionar datos sin borrar el campo contrario
    database.ref().update(updates).then(() => {
        mostrarToast("Guardado", "fa-check");
    }).catch(err => alert("Revisa tu conexión a internet. Error al guardar: " + err.message));
};

function leerDatosNota(orden) {
    if (DB_NOTAS_COMPARTIDAS && DB_NOTAS_COMPARTIDAS[orden]) {
        let n = DB_NOTAS_COMPARTIDAS[orden];
        return { 
            comentario: n.comentario || '', 
            observaciones: n.observaciones || '', 
            fecha: n.fecha || '',
            modificado_por: n.modificado_por || '' 
        };
    }
    return { comentario: '', observaciones: '', fecha: '', modificado_por: '' };
}

function actualizarListasDesplegables() {
    let db = DB_NOTAS_COMPARTIDAS || {};
    let com = new Set(); let obs = new Set(); 
    Object.values(db).forEach(i => { 
        if(i.comentario) com.add(i.comentario); 
        if(i.observaciones) obs.add(i.observaciones);
    });
    
    let dlCom = document.getElementById('list-comentarios');
    if(dlCom) { dlCom.innerHTML = ''; com.forEach(c => dlCom.innerHTML += `<option value="${c}">`); }
    
    let dlObs = document.getElementById('list-observaciones');
    if(dlObs) { dlObs.innerHTML = ''; obs.forEach(c => dlObs.innerHTML += `<option value="${c}">`); }
}

// ==========================================
// CORE DE PROCESAMIENTO
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
        
        let letra = orden.charAt(0);
        let sec = secciones[letra];
        if (!sec) return;

        let notas = leerDatosNota(orden);
        let estatusFiltro = notas.comentario ? notas.comentario.trim() : "";
        if (estatusFiltro === "") estatusFiltro = "(Vacío)";

        if ((FILTROS_POR_SECCION[letra] || new Set()).has(estatusFiltro)) return; 

        let dias = parseFloat(fila['Dias']) || 0;
        let importe = parseFloat(String(fila['Importe  S/iva '] || "0").replace(/[^0-9.-]+/g,"")) || 0;
        let nombre = String(fila['Nombre'] || "Sin Nombre"); 
        let asesor = String(fila['Asesor'] || "No Asignado").replace(/^\d+\s*ASE-\s*/i, '').substring(0, 20);
        
        let semaforo = 'verde';
        if (dias >= 30) semaforo = 'rojo';
        else if (dias >= 15) semaforo = 'amarillo';

        sec.ordenes.push({ orden, nombre, asesor, dias, importe, semaforo, comentario: notas.comentario, observaciones: notas.observaciones, autor: notas.modificado_por, fecha_mod: notas.fecha });
        sec.total += importe;
        
        if (semaforo === 'rojo') sec.countAlert++; else if (semaforo === 'amarillo') sec.countWarn++; else sec.countOk++;
        global.total++; global.dinero += importe;
        if (semaforo === 'rojo') { global.alert++; global.dineroAlert += importe; } else if (semaforo === 'amarillo') { global.warn++; } else { global.ok++; }
    });

    DATOS_GLOBALES = secciones;
    document.getElementById('kpi-total-ops').innerText = global.total;
    document.getElementById('kpi-ok-ops').innerText = global.ok;
    document.getElementById('kpi-warn-ops').innerText = global.warn;
    document.getElementById('kpi-alert-ops').innerText = global.alert;
    document.getElementById('kpi-money').innerText = moneyFormat.format(global.dinero);
    document.getElementById('kpi-money-sub').innerHTML = `<span style="color:var(--red); font-weight:bold;">${moneyFormat.format(global.dineroAlert)}</span> crítico (≥ 30d)`;
    
    generarTablaEmail(secciones);
    renderizarTablero(secciones);
}

function generarTablaEmail(secciones) {
    let container = document.getElementById('tabla-resumen-container');
    let html = `<table class="mini-summary-table" id="tabla-para-copiar"><thead><tr><th style="width:25%">Departamento</th><th>< 15 Días (Verde)</th><th>15-29 Días (Ama)</th><th>≥ 30 Días (Rojo)</th><th>Monto Total</th></tr></thead><tbody>`;
    ['A', 'S', 'N', 'V', 'G', 'I'].forEach(key => {
        let sec = secciones[key];
        if (sec.ordenes.length > 0) {
            html += `<tr><td>${sec.titulo}</td><td class="bg-ok-light">${sec.countOk}</td><td class="${sec.countWarn > 0 ? 'bg-warn-light' : ''}">${sec.countWarn}</td><td class="${sec.countAlert > 0 ? 'bg-alert-light' : ''}">${sec.countAlert}</td><td style="text-align:right; font-weight:bold;">${moneyFormat.format(sec.total)}</td></tr>`;
        }
    });
    container.innerHTML = html + `</tbody></table>`;
}

window.cambiarOrden = function(key, modo) { SORT_STATE[key] = modo; renderizarTablaSeccion(key); };
window.toggleCard = function(id, event) { if (event.target.tagName === 'TH' || event.target.tagName === 'I' || event.target.tagName === 'INPUT' || event.target.tagName === 'BUTTON') return; document.getElementById(id).classList.toggle('collapsed'); };

function renderizarTablero(secciones) {
    let container = document.getElementById('dashboard'); container.innerHTML = "";
    ['A', 'S', 'N', 'V', 'G', 'I'].forEach(key => {
        let sec = secciones[key];
        if (sec.ordenes.length === 0) return;
        let cardId = `card-${key}`;
        container.innerHTML += `<div class="card" id="${cardId}"><div class="card-header" onclick="toggleCard('${cardId}', event)"><div class="card-title">${sec.titulo} <small>(${sec.ordenes.length})</small></div><div style="font-weight:bold; color:var(--dark-grey);">${moneyFormat.format(sec.total)} <i class="fas fa-chevron-down chevron"></i></div></div><div class="card-content"><div class="breakdown-bar"><div class="bd-stats"><span class="bd-ok">Verde: ${sec.countOk}</span> <span class="bd-warn">Amarillo: ${sec.countWarn}</span> <span class="bd-alert">Rojo: ${sec.countAlert}</span></div><button class="btn-chart" onclick="abrirGraficas('${key}', '${sec.titulo}')"><i class="fas fa-list"></i> Ver Desglose</button></div><div class="table-responsive" id="table-container-${key}"></div></div></div>`;
    });
    ['A', 'S', 'N', 'V', 'G', 'I'].forEach(key => { if (secciones[key] && secciones[key].ordenes.length > 0) renderizarTablaSeccion(key); });
}

function renderizarTablaSeccion(key) {
    let sec = DATOS_GLOBALES[key];
    let sortMode = SORT_STATE[key] || 'dias'; 
    if (sortMode === 'asesor') { sec.ordenes.sort((a, b) => { let cmp = a.asesor.localeCompare(b.asesor); return cmp !== 0 ? cmp : b.dias - a.dias; }); } 
    else { sec.ordenes.sort((a, b) => b.dias - a.dias); }

    let styleFiltro = (FILTROS_POR_SECCION[key] || new Set()).size > 0 ? "color: var(--yellow); font-size: 1.2em; transform: scale(1.1);" : "";

    let inputStateSeguimiento = IS_ADMIN ? '' : 'readonly disabled style="background:var(--bg); cursor:not-allowed;" title="Solo Administrador"';
    let inputStateComentarios = (IS_ADMIN || ALLOWED_SECTIONS.includes(key)) ? '' : 'readonly disabled style="background:var(--bg); cursor:not-allowed;" title="Sin permisos"';

    let html = `<table class="track-table"><thead><tr>
        <th>Orden</th><th>Cliente</th>
        <th class="th-sortable ${sortMode === 'asesor' ? 'active' : ''}" onclick="cambiarOrden('${key}', 'asesor')">Asesor <i class="fas fa-sort-alpha-down"></i></th>
        <th class="th-sortable ${sortMode === 'dias' ? 'active' : ''}" style="text-align:center;" onclick="cambiarOrden('${key}', 'dias')">Días <i class="fas fa-sort-numeric-down"></i></th>
        <th style="text-align:right;">Importe</th>
        <th style="width: 15%; background-color:var(--bg);">Seguimiento <i class="fas fa-filter icon-filter" onclick="abrirMenuFiltroColumna(event, '${key}')" style="float:right; ${styleFiltro}"></i></th>
        <th style="width: 20%;">Comentarios</th>
        <th style="width: 15%;">Autor Comentario</th>
        <th>Fecha Mod.</th>
    </tr></thead><tbody>`;

    sec.ordenes.forEach((item) => {
        let badgeClass = item.semaforo === 'verde' ? 'badge-ok' : (item.semaforo === 'amarillo' ? 'badge-warn' : 'badge-alert');
        html += `<tr id="row-${item.orden}" style="background-color:${getPastelColor(item.comentario)}">
            <td class="cell-orden">${item.orden}</td>
            <td><span style="font-weight:normal; color:var(--grey); font-size:0.9em;">${item.nombre}</span></td>
            <td><span class="asesor-name">${item.asesor}</span></td>
            <td class="cell-dias" style="text-align:center;"><span class="badge-dias ${badgeClass}">${item.dias}</span></td>
            <td class="cell-money">${moneyFormat.format(item.importe)}</td>
            <td><input type="text" id="comentario-${item.orden}" class="comment-box" list="list-comentarios" placeholder="..." value="${item.comentario || ''}" onchange="guardarDatosNota('${item.orden}', 'comentario', this.value)" ${inputStateSeguimiento}></td>
            <td><input type="text" id="obs-${item.orden}" class="comment-box" list="list-observaciones" placeholder="Añadir comentario..." value="${item.observaciones || ''}" onchange="guardarDatosNota('${item.orden}', 'observaciones', this.value)" ${inputStateComentarios}></td>
            <td id="autor-${item.orden}"><small style="font-weight: bold; color: var(--h-blue);">${item.autor || '-'}</small></td>
            <td class="date-cell" id="date-${item.orden}">${item.fecha_mod || ''}</td>
        </tr>`;
    });
    document.getElementById(`table-container-${key}`).innerHTML = html + `</tbody></table>`;
}

// ==========================================
// FILTROS FLOTANTES Y MODALES
// ==========================================
window.abrirMenuFiltroColumna = function(event, sectionKey) {
    event.stopPropagation(); ACTIVE_FILTER_SECTION = sectionKey;
    document.getElementById('filter-section-title').innerText = DATOS_GLOBALES[sectionKey] ? DATOS_GLOBALES[sectionKey].titulo : sectionKey;
    let estatusSet = new Set();
    RAW_EXCEL_DATA.forEach(fila => {
        let orden = String(fila['Orden'] || "").trim().toUpperCase();
        if(orden.length > 1 && orden.charAt(0) === sectionKey) {
            let notas = leerDatosNota(orden);
            estatusSet.add(notas.comentario ? notas.comentario.trim() : "(Vacío)");
        }
    });

    let contenedor = document.getElementById('floatingFilterList'); contenedor.innerHTML = `<label class="filter-item" style="border-bottom:1px solid var(--border-color); padding-bottom:8px; margin-bottom:8px;"><input type="checkbox" id="chkAllFiltro" onchange="window.toggleAllFiltros(this)"><strong>(Seleccionar Todo)</strong></label>`;
    let seccionOcultos = FILTROS_POR_SECCION[sectionKey] || new Set();
    Array.from(estatusSet).sort().forEach(est => {
        contenedor.innerHTML += `<label class="filter-item"><input type="checkbox" class="chk-filtro-item" value="${est}" ${seccionOcultos.has(est) ? "" : "checked"} onchange="window.updateChkAll()"><span>${est}</span></label>`;
    });
    let menu = document.getElementById('floatingFilter'); menu.style.display = 'block';
    menu.style.left = Math.max(10, event.pageX - 150) + "px"; menu.style.top = (event.pageY + 15) + "px"; window.updateChkAll();
}

window.toggleAllFiltros = function(source) { document.querySelectorAll('.chk-filtro-item').forEach(chk => chk.checked = source.checked); }
window.updateChkAll = function() { let chkAll = document.getElementById('chkAllFiltro'); if(chkAll) chkAll.checked = Array.from(document.querySelectorAll('.chk-filtro-item')).every(chk => chk.checked); }
function cerrarMenuFiltro() { document.getElementById('floatingFilter').style.display = 'none'; ACTIVE_FILTER_SECTION = null; }

function actualizarBannerFiltros() {
    let banner = document.getElementById('active-filters-banner');
    let totalFiltros = 0; let seccionesConFiltro = [];
    for (let key in FILTROS_POR_SECCION) {
        if (FILTROS_POR_SECCION[key].size > 0) { totalFiltros += FILTROS_POR_SECCION[key].size; seccionesConFiltro.push(DATOS_GLOBALES[key] ? DATOS_GLOBALES[key].titulo : key); }
    }
    if (totalFiltros > 0) { banner.style.display = 'flex'; document.getElementById('filtros-count').innerText = totalFiltros; document.getElementById('filtros-seccion').innerText = seccionesConFiltro.join(", "); } else { banner.style.display = 'none'; }
}

function aplicarFiltroFlotante() {
    if (!ACTIVE_FILTER_SECTION) return;
    FILTROS_POR_SECCION[ACTIVE_FILTER_SECTION] = new Set();
    document.querySelectorAll('.chk-filtro-item').forEach(chk => { if (!chk.checked) FILTROS_POR_SECCION[ACTIVE_FILTER_SECTION].add(chk.value); });
    localStorage.setItem('hyundai_filtros_seccion', JSON.stringify(Object.fromEntries(Object.entries(FILTROS_POR_SECCION).map(([k,v]) => [k, Array.from(v)]))));
    cerrarMenuFiltro(); mostrarToast(`Filtros aplicados.`, "fa-filter");
    if (RAW_EXCEL_DATA) analizarDatos(RAW_EXCEL_DATA);
}

function limpiarFiltrosFlotantes() { FILTROS_POR_SECCION = {}; localStorage.removeItem('hyundai_filtros_seccion'); mostrarToast("Filtros removidos.", "fa-eye"); if (RAW_EXCEL_DATA) analizarDatos(RAW_EXCEL_DATA); }

window.abrirGraficas = function(key, titulo) {
    CURRENT_SECTION_KEY = key; document.getElementById('modalTitle').innerText = "Análisis: " + titulo;
    document.getElementById('kpiModal').style.display = "block"; document.getElementById('modalMainView').style.display = "block";
    document.getElementById('modalDetailView').style.display = "none"; document.getElementById('modalFiltroSemaforo').value = 'todos'; aplicarFiltroModal();
}

function aplicarFiltroModal() {
    let filtroValor = document.getElementById('modalFiltroSemaforo').value; 
    let sec = DATOS_GLOBALES[CURRENT_SECTION_KEY];
    let ordenesAAnalizar = sec.ordenes.filter(o => filtroValor === 'todos' || o.semaforo === filtroValor);
    
    let conteoStat = {}; let conteoObs = {}; let conteoAsesor = {};
    ordenesAAnalizar.forEach(o => {
        let s1 = o.comentario ? o.comentario.trim() : "Sin Estatus"; conteoStat[s1===""?"Sin Estatus":s1] = (conteoStat[s1===""?"Sin Estatus":s1] || 0) + 1;
        let s2 = o.observaciones ? o.observaciones.trim() : "Sin Comentario"; conteoObs[s2===""?"Sin Comentario":s2] = (conteoObs[s2===""?"Sin Comentario":s2] || 0) + 1;
        let s3 = o.asesor || "Sin Asignar"; conteoAsesor[s3] = (conteoAsesor[s3] || 0) + 1;
    });

    const genHtml = (obj, tipo, color) => {
        let res = `<table class="modal-table"><thead><tr><th>Categoría</th><th>Cantidad</th></tr></thead><tbody>`;
        Object.entries(obj).sort((a,b)=>b[1]-a[1]).forEach(([s,c]) => res += `<tr onclick="window.verDetalleFiltrado('${tipo}', '${s}')"><td>${s}</td><td><span class="count-badge" style="background:${color};">${c}</span></td></tr>`);
        return Object.keys(obj).length ? res + `</tbody></table>` : "<p style='color:var(--grey); text-align:center;'>No hay datos.</p>";
    };
    document.getElementById('tableEstatusContainer').innerHTML = genHtml(conteoStat, 'comentario', 'var(--grey)');
    document.getElementById('tableObservacionesContainer').innerHTML = genHtml(conteoObs, 'observaciones', 'var(--green)');
    document.getElementById('tableAsesorContainer').innerHTML = genHtml(conteoAsesor, 'asesor', 'var(--h-blue)');
}

window.verDetalleFiltrado = function(tipo, valor) {
    document.getElementById('modalMainView').style.display = "none"; document.getElementById('modalDetailView').style.display = "block";
    let filtroValor = document.getElementById('modalFiltroSemaforo').value; 
    document.getElementById('detalleTitulo').innerText = `Filtrado por: ${valor}${filtroValor !== 'todos' ? ` (Filtro: ${filtroValor.toUpperCase()})` : ''}`;
    let sec = DATOS_GLOBALES[CURRENT_SECTION_KEY];
    let html = `<table id="tabla-detalle-copiar" class="track-table" style="width:100%;"><thead><tr><th>Orden</th><th>Cliente</th><th>Asesor</th><th>Días</th><th>Importe</th><th>Seguimiento</th><th>Comentarios</th></tr></thead><tbody>`;
    sec.ordenes.filter(o => {
        if(filtroValor !== 'todos' && o.semaforo !== filtroValor) return false;
        let valAct = tipo === 'asesor' ? (o.asesor||"Sin Asignar") : (tipo === 'comentario' ? (o.comentario||"Sin Estatus") : (o.observaciones||"Sin Comentario"));
        return valAct.trim() === valor || (valAct.trim()==="" && valor.startsWith("Sin"));
    }).sort((a, b) => b.dias - a.dias).forEach(o => {
        let badge = o.semaforo === 'verde' ? 'badge-ok' : (o.semaforo === 'amarillo' ? 'badge-warn' : 'badge-alert');
        html += `<tr style="background-color:${getPastelColor(o.comentario)}"><td class="cell-orden">${o.orden}</td><td><small>${o.nombre}</small></td><td>${o.asesor}</td><td style="text-align:center"><span class="badge-dias ${badge}">${o.dias}</span></td><td class="cell-money">${moneyFormat.format(o.importe)}</td><td>${o.comentario || '-'}</td><td>${o.observaciones || '-'}</td></tr>`;
    });
    document.getElementById('detalleTablaContainer').innerHTML = html + `</tbody></table>`;
}

function volverVistaPrincipal() { document.getElementById('modalDetailView').style.display = "none"; document.getElementById('modalMainView').style.display = "block"; }
function cerrarModal() { document.getElementById('kpiModal').style.display = "none"; }
function copiarTabla() { let range = document.createRange(); range.selectNode(document.getElementById('tabla-para-copiar')); window.getSelection().removeAllRanges(); window.getSelection().addRange(range); document.execCommand("copy"); window.getSelection().removeAllRanges(); mostrarToast("¡Tabla copiada al portapapeles!"); }
function copiarTablaDetalle() { let tabla = document.getElementById('tabla-detalle-copiar'); if (!tabla) return; let range = document.createRange(); range.selectNode(tabla); window.getSelection().removeAllRanges(); window.getSelection().addRange(range); try { document.execCommand("copy"); mostrarToast("¡Lista copiada!"); } catch (err) {} window.getSelection().removeAllRanges(); }

function exportarAExcel() {
    if (!RAW_EXCEL_DATA || RAW_EXCEL_DATA.length === 0) { mostrarToast("No hay datos cargados para exportar.", "fa-exclamation-circle"); return; }
    let dataAExportar = RAW_EXCEL_DATA.reduce((acc, fila) => {
        let orden = String(fila['Orden'] || "").trim().toUpperCase();
        if(orden.length > 1) {
            let notas = leerDatosNota(orden);
            let estatus = notas.comentario ? notas.comentario.trim() : "(Vacío)";
            if (!(FILTROS_POR_SECCION[orden.charAt(0)] || new Set()).has(estatus)) acc.push({ ...fila, 'Seguimiento': notas.comentario || '', 'Comentarios': notas.observaciones || '', 'Autor Comentario': notas.modificado_por || '', 'Fecha Mod.': notas.fecha || '' });
        }
        return acc;
    }, []);
    let wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataAExportar), "Seguimiento Diario");
    XLSX.writeFile(wb, "Reporte_con_Comentarios_" + new Date().toLocaleDateString('es-MX').replace(/\//g, '-') + ".xlsx");
    mostrarToast("Excel exportado exitosamente.");
}
function exportarDetalleAExcel() { let tabla = document.getElementById('tabla-detalle-copiar'); if (!tabla) return; XLSX.writeFile(XLSX.utils.table_to_book(tabla, {sheet: "Detalle Filtrado"}), document.getElementById('detalleTitulo').innerText.replace(/[^a-zA-Z0-9]/g, '_') + "_" + new Date().toLocaleDateString('es-MX').replace(/\//g, '-') + ".xlsx"); }

// ==========================================
// GENERADOR DE FONDO MATRIX
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    const matrixBg = document.getElementById('matrix-bg');
    if (matrixBg) {
        const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポ';
        for (let i = 0; i < 200; i++) {
            let span = document.createElement('span');
            span.innerText = chars.charAt(Math.floor(Math.random() * chars.length));
            matrixBg.appendChild(span);
        }
    }
});
