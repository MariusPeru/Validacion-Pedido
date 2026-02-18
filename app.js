// DOM Elements
const loginSection = document.getElementById('login-section');
const appSection = document.getElementById('app-section');
const loginForm = document.getElementById('login-form');
const apiUrlInput = document.getElementById('api-url');
const ordersTableBody = document.getElementById('orders-table-body');
const searchInput = document.getElementById('search-input');
const refreshBtn = document.getElementById('refresh-btn');
const newOrderBtn = document.getElementById('new-order-btn');
const newOrderForm = document.getElementById('new-order-form');
const validateForm = document.getElementById('validate-form');
const photoInput = document.getElementById('photo-input');
const photoPreview = document.getElementById('photo-preview');
const uploadPlaceholder = document.getElementById('upload-placeholder');
const ocrOverlay = document.getElementById('ocr-overlay');
const validationStatusBox = document.getElementById('validation-status-box');
const valPhotoAmountInput = document.getElementById('val-photo-amount');

// State
let currentUser = null;
let orders = [];
let API_URL = localStorage.getItem('api_url') || '';
let currentFilter = 'all';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    if (API_URL) apiUrlInput.value = API_URL;

    // Set Date Filter to Today
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    document.getElementById('date-filter').value = `${yyyy}-${mm}-${dd}`;

    checkSession();
});

// --- Authentication ---

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = document.getElementById('username').value;
    const pass = document.getElementById('password').value;
    const url = apiUrlInput.value.trim();

    if (!url) {
        Swal.fire('Error', 'Debes ingresar la URL del Script de Google', 'error');
        return;
    }

    localStorage.setItem('api_url', url);
    API_URL = url;

    setLoading(true);
    try {
        const response = await fetchAPI('login', { user, pass });
        if (response.success) {
            currentUser = response.user;
            sessionStorage.setItem('user', JSON.stringify(currentUser));
            showApp();
        } else {
            Swal.fire('Error', 'Credenciales incorrectas', 'error');
        }
    } catch (error) {
        console.error(error);
        Swal.fire('Error', 'No se pudo conectar con el servidor', 'error');
    }
    setLoading(false);
});

function checkSession() {
    const savedUser = sessionStorage.getItem('user');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        showApp();
    }
}

function showApp() {
    loginSection.classList.add('hidden');
    appSection.style.display = 'grid'; // Grid layout
    document.getElementById('user-name-display').textContent = currentUser.nombre;

    // Role based UI
    if (currentUser.rol !== 'Admin') {
        newOrderBtn.style.display = 'none';
    } else {
        newOrderBtn.style.display = 'flex';
    }

    loadOrders();
}

document.getElementById('logout-btn').addEventListener('click', () => {
    sessionStorage.removeItem('user');
    location.reload();
});

// --- Orders Management ---

async function loadOrders() {
    document.getElementById('loading-indicator').classList.remove('hidden');
    try {
        const response = await fetchAPI('listarPedidos');
        if (response.success) {
            orders = response.data;
            renderOrders(orders);
            updateStats();
        }
    } catch (error) {
        Swal.fire('Error', 'Error cargando pedidos', 'error');
    }
    document.getElementById('loading-indicator').classList.add('hidden');
}

function renderOrders(data) {
    ordersTableBody.innerHTML = '';
    data.forEach(order => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>#${order.nro}</td>
            <td>${formatDate(order.fecha)}</td>
            <td>${order.llave}</td>
            <td>S/ ${formatMoney(order.monto)}</td>
            <td><span class="badge ${order.estado.replace(' ', '-')}">${order.estado}</span></td>
            <td>${order.foto === 'PAGO-EFECTIVO' ?
                '<span class="badge" style="background:rgba(16, 185, 129, 0.2); color:#4ade80; border:1px solid rgba(74, 222, 128, 0.3); cursor:default"><i class="fa-solid fa-money-bill-wave"></i> Efectivo</span>' :
                (order.foto === 'PAGO-ONLINE' ? '<span class="badge" style="background:rgba(59, 130, 246, 0.2); color:#60a5fa; border:1px solid rgba(96, 165, 250, 0.3); cursor:default"><i class="fa-solid fa-globe"></i> Online</span>' :
                    (order.foto ? '<a href="' + order.foto + '" target="_blank" class="btn-icon-small"><i class="fa-solid fa-image"></i></a>' : '<span class="text-muted">-</span>'))}
            </td>
            <td>
                ${order.estado === 'Rechazado' ? '<span class="text-muted" title="Pedido Rechazado"><i class="fa-solid fa-lock"></i></span>' : `
                <button class="btn-secondary small" onclick="openValidateModal(${order.nro})" title="${currentUser.rol === 'Admin' ? 'Validar/Ver' : 'Solo Lectura'}">
                    ${currentUser.rol === 'Admin' ?
                    `<i class="fa-solid ${order.estado === 'Validado' ? 'fa-eye' : 'fa-pen-to-square'}"></i>` :
                    `<i class="fa-solid fa-eye"></i> <i class="fa-solid fa-lock" style="font-size:0.7em"></i>`}
                </button>
                ${currentUser.rol === 'Admin' && order.estado !== 'Validado' ? `
                <button class="btn-icon-small danger" onclick="rejectOrder(${order.nro})" title="Rechazar">
                    <i class="fa-solid fa-ban"></i>
                </button>` : ''}`}
            </td>
        `;
        ordersTableBody.appendChild(tr);
    });
}

// --- Modals & Forms ---

newOrderBtn.addEventListener('click', () => {
    // Auto-increment Number
    const maxNro = orders.reduce((max, o) => Math.max(max, parseInt(o.nro) || 0), 0);
    document.getElementById('new-nro').value = maxNro + 1;

    // Default Date: Today
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    document.getElementById('new-date').value = `${yyyy}-${mm}-${dd}`;

    document.getElementById('modal-new-order').classList.add('active');
});

document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('active'));
    });
});

// Force Uppercase Key
document.getElementById('new-key').addEventListener('input', function () {
    this.value = this.value.toUpperCase();
});

newOrderForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        nro: document.getElementById('new-nro').value,
        fecha: document.getElementById('new-date').value,
        llave: document.getElementById('new-key').value,
        monto: document.getElementById('new-amount').value,
        usuario: currentUser.usuario
    };

    // Check availability locally first (optional UI enhancement)
    const exists = orders.find(o => o.nro == data.nro);
    if (exists && exists.estado !== 'Reservado') {
        Swal.fire('Atención', `El pedido #${data.nro} ya existe.`, 'warning');
        return;
    }

    Swal.showLoading();
    try {
        const res = await fetchAPI('crearPedido', data);
        if (res.success) {
            Swal.fire('Éxito', 'Pedido registrado correctamente', 'success');
            document.getElementById('modal-new-order').classList.remove('active');
            newOrderForm.reset();
            loadOrders();
        } else {
            Swal.fire('Error', res.message, 'error');
        }
    } catch (err) {
        Swal.fire('Error', 'Falló el registro', 'error');
    }
});

// --- Validation & OCR ---

let currentOrderForValidation = null;

window.openValidateModal = (nro) => {
    const order = orders.find(o => o.nro == nro);
    if (!order) return;

    currentOrderForValidation = order;
    document.getElementById('val-nro-display').textContent = order.nro;
    document.getElementById('val-key-display').textContent = order.llave;
    document.getElementById('val-amount-display').textContent = formatMoney(order.monto);
    document.getElementById('val-id').value = order.nro;

    // Reset photo inputs
    photoInput.value = '';
    photoPreview.classList.add('hidden');
    uploadPlaceholder.classList.remove('hidden');
    document.getElementById('photo-actions').classList.add('hidden');
    valPhotoAmountInput.value = '';

    // Reset Validation Mode Default
    document.querySelector('input[name="valType"][value="foto"]').checked = true;
    updateValidationMode('foto');

    // If order already has photo/validation
    if (order.foto === 'PAGO-EFECTIVO') {
        document.querySelector('input[name="valType"][value="efectivo"]').checked = true;
        updateValidationMode('efectivo');
    } else if (order.foto === 'PAGO-ONLINE') {
        document.querySelector('input[name="valType"][value="online"]').checked = true;
        updateValidationMode('online');
    } else if (order.foto) {
        photoPreview.src = order.foto;
        photoPreview.classList.remove('hidden');
        uploadPlaceholder.classList.add('hidden');
        document.getElementById('photo-actions').classList.remove('hidden');
        document.getElementById('view-full-photo').href = order.foto;
    }

    // Set status
    updateValidationUI(order.monto_foto, order.monto);

    // Read Only Mode for Non-Admins
    const saveBtn = document.getElementById('btn-save-validation');
    const dropZone = document.getElementById('photo-drop-zone');

    if (currentUser.rol !== 'Admin') {
        saveBtn.style.display = 'none';
        dropZone.style.pointerEvents = 'none';
        dropZone.style.opacity = '0.7';
        valPhotoAmountInput.disabled = true;
        document.querySelectorAll('input[name="valType"]').forEach(r => r.disabled = true);

        // Show Read Only Badge
        const title = document.querySelector('#modal-validate h3');
        if (!document.getElementById('readonly-badge')) {
            const badge = document.createElement('span');
            badge.id = 'readonly-badge';
            badge.className = 'badge';
            badge.style.background = '#94a3b8';
            badge.style.color = 'white';
            badge.textContent = 'Solo Lectura';
            badge.style.fontSize = '0.6em';
            badge.style.verticalAlign = 'middle';
            badge.style.marginLeft = '10px';
            title.appendChild(badge);
        }

        // Hide Change Photo
        const removeBtn = document.getElementById('remove-photo-btn');
        if (removeBtn) removeBtn.style.display = 'none';
    } else {
        saveBtn.style.display = 'block';
        dropZone.style.pointerEvents = 'auto';
        dropZone.style.opacity = '1';
        valPhotoAmountInput.disabled = false;
        document.querySelectorAll('input[name="valType"]').forEach(r => r.disabled = false);
        const badge = document.getElementById('readonly-badge');
        if (badge) badge.remove();

        // Show Change Photo
        const removeBtn = document.getElementById('remove-photo-btn');
        if (removeBtn) removeBtn.style.display = 'inline-block';
    }

    document.getElementById('modal-validate').classList.add('active');
};

const valTypeRadios = document.querySelectorAll('input[name="valType"]');
valTypeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
        updateValidationMode(e.target.value);
    });
});

function updateValidationMode(mode) {
    const photoColumn = document.querySelector('.photo-column');
    const label = document.querySelector('#validate-form label:first-of-type'); // Or better selector
    const ocrBtn = document.getElementById('ocr-trigger-btn');
    const helperParams = document.getElementById('ocr-helper-text');

    // Suggest amount if switching to cash/online
    if (mode === 'efectivo' || mode === 'online') {
        photoColumn.style.display = 'none';
        ocrBtn.style.display = 'none';
        helperParams.textContent = mode === 'efectivo' ? 'Ingrese monto recibido (Efectivo)' : 'Ingrese monto validado (Online)';

        if (!valPhotoAmountInput.value && currentOrderForValidation) {
            valPhotoAmountInput.value = parseFloat(currentOrderForValidation.monto).toFixed(2);
            validateAmounts();
        }
    } else {
        photoColumn.style.display = 'block';
        ocrBtn.style.display = 'inline-block';
        helperParams.textContent = 'Sube una foto para detectar.';

        if (currentOrderForValidation && valPhotoAmountInput.value === parseFloat(currentOrderForValidation.monto).toFixed(2)) {
            valPhotoAmountInput.value = ''; // clear auto suggestion
            validateAmounts();
        }
    }
}

// Enable zoom on click
photoPreview.addEventListener('click', () => {
    if (photoPreview.src && !photoPreview.classList.contains('hidden')) {
        window.open(photoPreview.src, '_blank');
    }
});

// Handle Photo Upload
const dropZone = document.getElementById('photo-drop-zone');

// Reset value when clicking input directly to allow selecting same file
photoInput.addEventListener('click', () => {
    photoInput.value = '';
});

photoInput.addEventListener('change', handleFileSelect);

dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--primary)'; });
dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); dropZone.style.borderColor = 'var(--glass-border)'; });
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--glass-border)';
    if (e.dataTransfer.files.length) {
        photoInput.files = e.dataTransfer.files;
        handleFileSelect();
    }
});

async function handleFileSelect() {
    const file = photoInput.files[0];
    if (!file) return;

    if (!file.type.match('image.*')) {
        Swal.fire('Error', 'Solo se permiten archivos de imagen (JPG, PNG)', 'error');
        return;
    }

    // Use Blob URL for preview (allows opening in new tab)
    const blobUrl = URL.createObjectURL(file);
    photoPreview.src = blobUrl;
    photoPreview.classList.remove('hidden');
    uploadPlaceholder.classList.add('hidden');
    document.getElementById('photo-actions').classList.remove('hidden');

    // Update "Ver Original" button
    document.getElementById('view-full-photo').href = blobUrl;

    // Start OCR
    runOCR(file);
}

document.getElementById('remove-photo-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    photoInput.click();
});

// OCR Logic with Preprocessing
async function runOCR(file) {
    ocrOverlay.classList.remove('hidden');
    valPhotoAmountInput.value = '';
    valPhotoAmountInput.placeholder = 'Escaneando...';

    try {
        // Pre-process
        const processedImage = await preprocessImage(file);

        const worker = await Tesseract.createWorker('eng');
        const ret = await worker.recognize(processedImage);
        console.log("OCR Text:", ret.data.text);

        const extractedAmount = extractAmountFromText(ret.data.text);

        if (extractedAmount > 0) {
            valPhotoAmountInput.value = extractedAmount.toFixed(2);
            itemDetected(extractedAmount);
            Swal.fire({
                title: 'Detectado',
                text: `S/ ${extractedAmount.toFixed(2)}`,
                icon: 'success',
                toast: true,
                position: 'top-end',
                timer: 3000,
                showConfirmButton: false
            });
        } else {
            Swal.fire({
                title: 'Info',
                text: 'No se detectó el monto automáticamente. Ingréselo manual.',
                icon: 'info',
                toast: true,
                position: 'top-end'
            });
            valPhotoAmountInput.placeholder = '0.00';
            valPhotoAmountInput.focus();
        }

        await worker.terminate();
    } catch (err) {
        console.error(err);
        Swal.fire('Error OCR', 'No se pudo leer la imagen.', 'warning');
    }

    ocrOverlay.classList.add('hidden');
    validateAmounts();
}

function preprocessImage(file) {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;

            // Grayscale & High Contrast
            for (let i = 0; i < data.length; i += 4) {
                const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
                const contrast = avg > 140 ? 255 : 0; // Simple binarization threshold
                data[i] = contrast;
                data[i + 1] = contrast;
                data[i + 2] = contrast;
            }
            ctx.putImageData(imageData, 0, 0);
            resolve(canvas.toDataURL('image/jpeg'));
        };
    });
}

function extractAmountFromText(text) {
    // Clean common OCR mistakes
    let cleanText = text.replace(/S\//gi, '')
        .replace(/[^\d.,\n]/g, ' ');

    const tokens = cleanText.split(/\s+/);
    const candidates = [];

    tokens.forEach(token => {
        if (token.includes('.') || token.includes(',')) {
            let numStr = token.replace(/,/g, '.');
            // Fix multiple dots: 1.200.50 -> 1200.50
            const parts = numStr.split('.');
            if (parts.length > 2) {
                numStr = parts.slice(0, -1).join('') + '.' + parts[parts.length - 1];
            }

            const num = parseFloat(numStr);
            if (!isNaN(num) && num > 0 && num < 100000) {
                // Ignore likely dates (e.g. 20.24) or tiny numbers
                if (numStr.includes('.')) {
                    candidates.push(num);
                }
            }
        }
    });

    if (candidates.length > 0) {
        // Return largest plausible number (Total amount is usually the largest figure)
        candidates.sort((a, b) => b - a);
        return candidates[0];
    }
    return 0;
}

valPhotoAmountInput.addEventListener('input', validateAmounts);

function validateAmounts() {
    const entered = parseFloat(valPhotoAmountInput.value) || 0;
    const registered = parseFloat(currentOrderForValidation.monto) || 0;
    updateValidationUI(entered, registered);
}

function updateValidationUI(photoAmount, registeredAmount) {
    if (!photoAmount) {
        validationStatusBox.className = 'validation-status-box';
        document.getElementById('status-icon').className = 'fa-solid fa-circle-question';
        document.getElementById('status-text').textContent = 'Pendiente de Validar';
        return;
    }

    const diff = Math.abs(photoAmount - registeredAmount);
    if (diff < 0.05) {
        validationStatusBox.className = 'validation-status-box valid';
        document.getElementById('status-icon').className = 'fa-solid fa-circle-check';
        document.getElementById('status-text').textContent = 'Monto Coincide: VALIDADO';
    } else {
        validationStatusBox.className = 'validation-status-box invalid';
        document.getElementById('status-icon').className = 'fa-solid fa-triangle-exclamation';
        document.getElementById('status-text').textContent = 'Monto Difiere: RECHAZAR';
    }
}

function itemDetected(amount) {
    const registered = parseFloat(currentOrderForValidation.monto);
    if (Math.abs(amount - registered) > 0.5) {
        // Optional noise if mismatch
    }
}

// Save Validation
validateForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const valType = document.querySelector('input[name="valType"]:checked').value;
    const file = photoInput.files[0];
    let fileData = null;

    if (valType === 'foto') {
        if (file) {
            fileData = await toBase64(file);
        } else if (!currentOrderForValidation.foto) {
            Swal.fire('Error', 'Debe subir una foto para validar.', 'warning');
            return;
        }
    }

    const startUpload = async () => {
        Swal.fire({ title: 'Guardando...', didOpen: () => Swal.showLoading() });
        const montoFoto = parseFloat(valPhotoAmountInput.value);

        const payload = {
            nro: currentOrderForValidation.nro,
            montoFoto: montoFoto,
            usuario: currentUser.usuario,
            nro: currentOrderForValidation.nro,
            montoFoto: montoFoto,
            usuario: currentUser.usuario,
            tipo: valType === 'foto' ? 'FOTO' : (valType === 'online' ? 'ONLINE' : 'EFECTIVO'),
            archivo: fileData ? {
                name: `pedido_${currentOrderForValidation.nro}_${Date.now()}.jpg`,
                type: file ? file.type : 'image/jpeg',
                data: fileData
            } : null
        };

        try {
            const res = await fetchAPI('validarPedido', payload);
            if (res.success) {
                Swal.fire('Éxito', 'Validación registrada', 'success');
                document.getElementById('modal-validate').classList.remove('active');
                loadOrders();
            } else {
                Swal.fire('Error', res.message, 'error');
            }
        } catch (err) {
            Swal.fire('Error', 'Falló la conexión', 'error');
        }
    };

    startUpload();
});

// --- Utilities ---

async function fetchAPI(action, data = {}) {
    const response = await fetch(API_URL, {
        method: 'POST',
        mode: 'cors', // Important for GAS
        body: JSON.stringify({ action, ...data })
    });
    return await response.json();
}

const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]); // Remove header
    reader.onerror = error => reject(error);
});

function setLoading(active) {
    document.getElementById('login-loading').style.display = active ? 'flex' : 'none';
}

function formatMoney(amount) {
    return parseFloat(amount).toFixed(2);
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    // dateStr comes as ISO or local from GAS
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-PE');
}

function updateStats() {
    const total = orders.filter(o => o.estado !== 'Reservado').length;
    const validated = orders.filter(o => o.estado === 'Validado').length;
    const pending = orders.filter(o => o.estado === 'Pendiente').length;
    const rejected = orders.filter(o => o.estado === 'Rechazado' || o.estado === 'No Validado').length;

    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-validated').textContent = validated;
    document.getElementById('stat-pending').textContent = pending;
    if (document.getElementById('stat-rejected')) {
        document.getElementById('stat-rejected').textContent = rejected;
    }
}

// Search
// Search & Filter
function applyFilters() {
    const term = searchInput.value.toLowerCase();
    const filterDate = document.getElementById('date-filter').value;

    const filtered = orders.filter(o => {
        let statusMatch = currentFilter === 'all' || o.estado === currentFilter;
        if (currentFilter === 'Rechazado') {
            statusMatch = o.estado === 'Rechazado' || o.estado === 'No Validado';
        }

        const searchMatch = o.llave.toLowerCase().includes(term) ||
            o.nro.toString().includes(term) ||
            o.estado.toLowerCase().includes(term);

        let dateMatch = true;
        if (filterDate && o.fecha) {
            // Robust date comparison handling timezone
            const d = new Date(o.fecha);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const oDateStr = `${year}-${month}-${day}`;
            dateMatch = oDateStr === filterDate;
        }

        return statusMatch && searchMatch && dateMatch;
    });
    renderOrders(filtered);
}

searchInput.addEventListener('input', applyFilters);
document.getElementById('date-filter').addEventListener('change', applyFilters);

document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentFilter = tab.getAttribute('data-filter');
        applyFilters();
    });
});

refreshBtn.addEventListener('click', loadOrders);

window.rejectOrder = async (nro) => {
    const result = await Swal.fire({
        title: '¿Rechazar Pedido?',
        text: "Esta acción no se puede deshacer.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sí, rechazar',
        cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
        Swal.showLoading();
        try {
            const res = await fetchAPI('rechazarPedido', { nro, usuario: currentUser.usuario });
            if (res.success) {
                Swal.fire('Rechazado', 'El pedido ha sido marcado como rechazado.', 'success');
                loadOrders();
            } else {
                Swal.fire('Error', res.message, 'error');
            }
        } catch (e) {
            Swal.fire('Error', 'Error de conexión', 'error');
        }
    }
}
