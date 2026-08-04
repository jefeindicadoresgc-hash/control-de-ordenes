// ... existing code ...
// ==========================================
// VARIABLES GLOBALES
// ==========================================
let USER_ROLE = null; 
let IS_ADMIN = false;
let ALLOWED_SECTIONS = [];
let DB_NOTAS_COMPARTIDAS = {}; 
let DATOS_GLOBALES = null; 
// ... existing code ...
// ==========================================
// LOGIN Y ARRANQUE
// ==========================================
function verificarPassword() {
    let input = document.getElementById('pass-input').value.trim().toUpperCase();
    
    // Reiniciar variables por seguridad en cada intento
    IS_ADMIN = false;
    ALLOWED_SECTIONS = [];
    
    if (input === 'YCA0') {
        USER_ROLE = 'Administrador';
        IS_ADMIN = true;
        ALLOWED_SECTIONS = ['A', 'S', 'N', 'V', 'G', 'I']; // Puede editar todo
    } 
    else if (input === 'YCD3') {
        USER_ROLE = 'Siniestros';
        ALLOWED_SECTIONS = ['A', 'S']; // Modifica Siniestros
    } 
    else if (input === 'YCR0' || input === 'YCR') {
        USER_ROLE = 'Normales';
        ALLOWED_SECTIONS = ['N']; // Modifica Normales
    } 
    else if (input === 'YCD2') {
        USER_ROLE = 'Garantías';
        ALLOWED_SECTIONS = ['G']; // Modifica Garantías
    } 
    else if (input === 'YCD0') {
        USER_ROLE = 'Visor';
        ALLOWED_SECTIONS = []; // No modifica nada
    } 
    else {
        document.getElementById('login-error').style.display = 'block';
        return;
    }
    
    iniciarApp();
}

function iniciarApp() {
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('main-app').style.display = 'block';
    
    // Solo el administrador ve el botón de cargar Excel
    if (!IS_ADMIN) {
        document.getElementById('caja-cargar-excel').style.display = 'none';
    }

    if (USER_ROLE === 'Visor') {
        mostrarToast("Sesión iniciada como Visor (Lectura)", "fa-eye");
    } else {
        mostrarToast(`Sesión iniciada: ${USER_ROLE}`, "fa-user-edit");
    }

    try {
// ... existing code ...
            // ESTADO VACÍO
            document.getElementById('empty-state').style.display = 'block';
            document.getElementById('summary-panel').style.display = 'none';
            document.getElementById('email-section').style.display = 'none';
            document.getElementById('dashboard').style.display = 'none';

            if(IS_ADMIN) {
                document.getElementById('ultima-carga-fecha').innerText = "Esperando primer archivo";
            } else {
                mostrarToast("Esperando a que el Administrador suba el Excel del día", "fa-clock");
            }
        }
    });
// ... existing code ...
window.guardarDatosNota = function(orden, campo, valor) {
    let letraOrden = orden.charAt(0).toUpperCase();
    let canEdit = IS_ADMIN || ALLOWED_SECTIONS.includes(letraOrden);

    if (!canEdit) {
        mostrarToast("No tienes permisos para modificar este departamento.", "fa-lock");
        renderizarTablaSeccion(letraOrden); // Refresca para borrar lo que el usuario intentó escribir
        return;
    }

    let fechaActual = new Date().toLocaleString('es-MX', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    database.ref('notas/' + orden + '/' + campo).set(valor);
    database.ref('notas/' + orden + '/fecha').set(fechaActual);
};

function leerDatosNota(orden) {
// ... existing code ...
    let iconAsesor = sortMode === 'asesor' ? '<i class="fas fa-sort-alpha-down"></i>' : '<i class="fas fa-sort" style="opacity:0.3"></i>';
    let iconDias = sortMode === 'dias' ? '<i class="fas fa-sort-numeric-down"></i>' : '<i class="fas fa-sort" style="opacity:0.3"></i>';
    let seccionFiltros = FILTROS_POR_SECCION[key] || new Set();
    let styleFiltro = seccionFiltros.size > 0 ? "color: var(--yellow); font-size: 1.2em; transform: scale(1.1);" : "";

    // Bloquear input visualmente si el usuario no tiene permiso para esta sección
    let canEdit = IS_ADMIN || ALLOWED_SECTIONS.includes(key);
    let inputState = canEdit ? '' : 'readonly disabled style="background:var(--bg); cursor:not-allowed;" title="Sin permisos para esta sección"';

    let html = `<table class="track-table"><thead><tr>
                    <th>Orden</th><th>Cliente</th>
// ... existing code ...
