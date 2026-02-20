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
let currentFilteredOrders = [];
let dateRange = { start: null, end: null };

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
        document.getElementById('import-btn').style.display = 'none';
        document.getElementById('import-text-btn').style.display = 'none';
    } else {
        newOrderBtn.style.display = 'flex';
        document.getElementById('import-btn').style.display = 'flex';
        document.getElementById('import-text-btn').style.display = 'flex';
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
            applyFilters();
        }
    } catch (error) {
        Swal.fire('Error', 'Error cargando pedidos', 'error');
    }
    document.getElementById('loading-indicator').classList.add('hidden');
}

function renderOrders(data) {
    ordersTableBody.innerHTML = '';
    const totalOrders = data.length; // Total de registros filtrados

    data.forEach((order, index) => {
        // Correlativo Dinámico Descendente: Total, Total-1, ..., 1
        const dynamicCorrelative = totalOrders - index;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>#${dynamicCorrelative}</td>
            <td>${formatDate(order.fecha)}</td>
            <td>${order.llave}</td>
            <td>S/ ${formatMoney(order.monto)}</td>
            <td><span class="badge ${order.estado.replace(' ', '-')}">${order.estado}</span></td>
            <td style="font-size:0.9em;">${order.envio || '<span class="text-muted">-</span>'}</td>
            <td>
                ${order.foto === 'PAGO-EFECTIVO' ?
                '<span class="badge" style="background:rgba(16, 185, 129, 0.2); color:#4ade80; border:1px solid rgba(74, 222, 128, 0.3); cursor:default"><i class="fa-solid fa-money-bill-wave"></i> Efectivo</span>' :
                (order.foto === 'PAGO-ONLINE' ? '<span class="badge" style="background:rgba(59, 130, 246, 0.2); color:#60a5fa; border:1px solid rgba(96, 165, 250, 0.3); cursor:default"><i class="fa-solid fa-globe"></i> Online</span>' :
                    (order.foto ? '<a href="' + order.foto + '" target="_blank" class="btn-icon-small"><i class="fa-solid fa-image"></i></a>' : '<span class="text-muted">-</span>'))}
            </td>
            <td style="font-size: 0.85em; color: rgba(255,255,255,0.8);">
                ${order.validado_por || '<span class="text-muted">-</span>'}
            </td>
            <td>
                ${(order.estado === 'Cancelado' || order.estado === 'Rechazado') ? '<span class="text-muted" title="Pedido Cancelado"><i class="fa-solid fa-lock"></i></span>' : `
                <button class="btn-secondary small" onclick="openValidateModal(${order.nro})" title="${currentUser.rol === 'Admin' ? 'Validar/Ver' : 'Solo Lectura'}">
                    ${currentUser.rol === 'Admin' ?
                    `<i class="fa-solid ${order.estado === 'Validado' ? 'fa-eye' : 'fa-pen-to-square'}"></i>` :
                    `<i class="fa-solid fa-eye"></i> <i class="fa-solid fa-lock" style="font-size:0.7em"></i>`}
                </button>
                ${currentUser.rol === 'Admin' && order.estado !== 'Validado' ? `
                <button class="btn-icon-small danger" onclick="rejectOrder(${order.nro})" title="Cancelar">
                    <i class="fa-solid fa-ban"></i>
                </button>` : ''}`}
            </td>
        `;
        ordersTableBody.appendChild(tr);
    });
}

// --- Modals & Forms ---

newOrderBtn.addEventListener('click', () => {
    // 1. Correlativo Historial (Máximo ID + 1)
    let maxNro = 0;
    if (orders && orders.length > 0) {
        maxNro = orders.reduce((max, o) => {
            const val = parseInt(o.nro);
            return (!isNaN(val)) ? Math.max(max, val) : max;
        }, 0);
    }

    // Safety fallback: si hay pedidos pero max es 0 (ej. error de parsing), usar la longitud total
    if (orders.length > 0 && maxNro === 0) {
        console.warn("MaxNro falló. Usando longitud del array.", orders);
        maxNro = orders.length;
    }

    document.getElementById('new-nro').value = maxNro + 1;

    // 2. Correlativo Visual (Filtro Activo + 1)
    const currentCount = currentFilteredOrders ? currentFilteredOrders.length : 0;
    document.getElementById('new-correlative-display').value = `# ${currentCount + 1}`;

    // --- DETALLE DEL FILTRO ACTIVO ---
    let dateText = '';
    // Helper simple para fecha (reutilizando fmt si es visible o redefiniendo)
    const fmtLocal = (s) => s.split('-').reverse().join('/');

    if (dateRange.start && dateRange.end) {
        dateText = `${fmtLocal(dateRange.start)} - ${fmtLocal(dateRange.end)}`;
    } else {
        const singleDate = document.getElementById('date-filter').value;
        dateText = singleDate ? fmtLocal(singleDate) : 'Todas las fechas';
    }

    // Obtener texto del botón de estado activo
    const activeTabObj = document.querySelector('.filter-tab.active');
    const statusText = activeTabObj ? activeTabObj.textContent.trim() : 'Todos';

    document.getElementById('active-filter-details').textContent = `(${dateText} | ${statusText})`;
    // ---------------------------------

    // 3. Fecha Hoy (Bloqueada)
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    document.getElementById('new-date').value = `${yyyy}-${mm}-${dd}`;

    // Limpiar campo hora para mostrar placeholder
    document.getElementById('new-time').value = '';

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

    // Separate Date + Time
    const datePart = document.getElementById('new-date').value;
    const timePart = document.getElementById('new-time').value;

    const data = {
        nro: document.getElementById('new-nro').value,
        fecha: datePart, // Send YYYY-MM-DD cleanly
        hora: timePart,  // Send HH:mm separately
        llave: document.getElementById('new-key').value,
        envio: document.getElementById('new-envio').value,
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
        const worker = await Tesseract.createWorker();
        await worker.loadLanguage('eng');
        await worker.initialize('eng');

        // Pre-process (Scale Up 2x for better OCR)
        const processedImage = await preprocessImage(file);

        const ret = await worker.recognize(processedImage);
        console.log("OCR Text:", ret.data.text);

        const extractedAmount = extractAmountFromText(ret.data.text);

        if (extractedAmount > 0) {
            valPhotoAmountInput.value = extractedAmount.toFixed(2);
            itemDetected(extractedAmount);
            // ... (rest of UI logic)
            const Toast = Swal.mixin({
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 3000,
                timerProgressBar: true,
            });
            Toast.fire({
                icon: 'success',
                title: `Detectado: S/ ${extractedAmount.toFixed(2)}`
            });
        } else {
            // ... (rest of UI logic)
            const Toast = Swal.mixin({
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 3000
            });
            Toast.fire({
                icon: 'info',
                title: 'No se detectó el monto. Ingrese manual.'
            });
            valPhotoAmountInput.placeholder = '0.00';
            valPhotoAmountInput.focus();
        }

        await worker.terminate();
    } catch (err) {
        console.error(err);
        Swal.fire('Error OCR', 'No se pudo leer la imagen.', 'error');
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

            // Layout Analysis: "Total" is usually in the bottom half.
            // Crop top 35% to remove logos/headers interference
            const sourceY = img.height * 0.35;
            const sourceHeight = img.height * 0.65;

            // Scale up 2x
            const scale = 2;
            canvas.width = img.width * scale;
            canvas.height = sourceHeight * scale;

            // Draw Cropped Image Scaled
            ctx.drawImage(img, 0, sourceY, img.width, sourceHeight, 0, 0, canvas.width, canvas.height);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;

            // Increase Contrast and Grayscale
            const contrastFactor = 1.5; // Increase contrast amount
            const intercept = 128 * (1 - contrastFactor);

            for (let i = 0; i < data.length; i += 4) {
                // Grayscale
                let avg = (data[i] + data[i + 1] + data[i + 2]) / 3;

                // Contrast
                avg = avg * contrastFactor + intercept;

                // Clamp
                if (avg > 255) avg = 255;
                if (avg < 0) avg = 0;

                data[i] = avg;     // R
                data[i + 1] = avg; // G
                data[i + 2] = avg; // B
            }

            ctx.putImageData(imageData, 0, 0);
            resolve(canvas.toDataURL('image/jpeg', 0.9));
        };
    });
}

function extractAmountFromText(text) {
    console.log("Raw OCR:", text);

    // 1. Look for 'Total' keyword
    const lines = text.split('\n');
    let totalAmount = 0;

    // Regex for Amount: "S/ 143.86", "143.86", "S/. 143.86"
    // Handles dots and commas
    const amountRegex = /S\/?\.?\s?(\d+[.,]\d{2})|(\d+[.,]\d{2})/i;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].toLowerCase();
        if (line.includes('total')) {
            // Look in this line
            let match = line.match(/(\d+[.,]\d{2})/); // Simple Match number
            if (match) {
                totalAmount = parseFloat(match[0].replace(',', '.'));
                break;
            }
            // Or next line
            if (i + 1 < lines.length) {
                match = lines[i + 1].match(/(\d+[.,]\d{2})/);
                if (match) {
                    totalAmount = parseFloat(match[0].replace(',', '.'));
                    break;
                }
            }
        }
    }

    if (totalAmount > 0) return totalAmount;

    // 2. Fallback: Find largest number that looks like money
    const cleanText = text.replace(/S\//gi, '').replace(/[^\d.,\n]/g, ' ');
    const tokens = cleanText.split(/\s+/);
    const candidates = [];

    tokens.forEach(token => {
        if (token.length < 3) return; // Skip small noise
        // Normalize 1,200.50 -> 1200.50
        // Or 143,86 -> 143.86
        let numStr = token;

        // Count dots and commas
        const dots = (token.match(/\./g) || []).length;
        const commas = (token.match(/,/g) || []).length;

        if (dots === 0 && commas === 1) {
            // 143,86 -> 143.86
            numStr = token.replace(',', '.');
        } else if (dots === 1 && commas === 0) {
            // 143.86 -> 143.86
        } else if (dots > 0 || commas > 0) {
            // Mixed... try to keep last separator as decimal
            numStr = token.replace(/[,.]/g, (m, offset) => {
                return offset === token.lastIndexOf(',') || offset === token.lastIndexOf('.') ? '.' : '';
            });
        }

        const val = parseFloat(numStr);
        if (!isNaN(val) && val > 0 && val < 10000) {
            // Look for decimal part presence
            if (numStr.includes('.')) candidates.push(val);
        }
    });

    if (candidates.length > 0) {
        // Return largest
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

    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return String(dateStr); // Si falla, devuelve el original

        // Fecha: DD/MM/YYYY
        const datePart = d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });

        // Hora: HH:mm am/pm
        const timePart = d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });

        return `<div>${datePart}</div><div style="font-size:0.75em; color:rgba(255,255,255,0.6);">${timePart}</div>`;
    } catch (e) {
        return String(dateStr);
    }
}

function updateStats(data = orders) {
    let totalCount = 0, totalAmount = 0;
    let validCount = 0, validAmount = 0;
    let pendingCount = 0, pendingAmount = 0;
    let rejectedCount = 0, rejectedAmount = 0;

    data.forEach(o => {
        if (o.estado === 'Reservado') return;

        const monto = parseFloat(o.monto) || 0;

        // Total
        totalCount++;
        totalAmount += monto;

        // By Status
        if (o.estado === 'Validado') {
            validCount++;
            validAmount += monto;
        } else if (o.estado === 'Pendiente') {
            pendingCount++;
            pendingAmount += monto;
        } else if (o.estado === 'Cancelado' || o.estado === 'Rechazado') {
            rejectedCount++;
            rejectedAmount += monto;
        }
    });

    // Update UI
    document.getElementById('stat-total-amount').textContent = `S/ ${formatMoney(totalAmount)}`;
    document.getElementById('stat-total-count').textContent = `${totalCount} pedidos`;

    document.getElementById('stat-pending-amount').textContent = `S/ ${formatMoney(pendingAmount)}`;
    document.getElementById('stat-pending-count').textContent = `${pendingCount} pedidos`;

    document.getElementById('stat-validated-amount').textContent = `S/ ${formatMoney(validAmount)}`;
    document.getElementById('stat-validated-count').textContent = `${validCount} pedidos`;

    document.getElementById('stat-rejected-amount').textContent = `S/ ${formatMoney(rejectedAmount)}`;
    document.getElementById('stat-rejected-count').textContent = `${rejectedCount} pedidos`;
}

// Search
// Search & Filter
function applyFilters() {
    const term = searchInput.value.toLowerCase();
    const filterDate = document.getElementById('date-filter').value;

    // Validar si existe rango activo
    const hasRange = dateRange.start && dateRange.end;

    const filtered = orders.filter(o => {
        let statusMatch = currentFilter === 'all' || o.estado === currentFilter;
        if (currentFilter === 'Cancelado') {
            statusMatch = o.estado === 'Cancelado' || o.estado === 'Rechazado';
        }

        const searchMatch = o.llave.toLowerCase().includes(term) ||
            o.nro.toString().includes(term) ||
            o.estado.toLowerCase().includes(term);

        let dateMatch = true;

        if (o.fecha) {
            const d = new Date(o.fecha);
            // Normalizar a medianoche para comparar solo fecha
            d.setHours(0, 0, 0, 0);

            if (hasRange) {
                // Lógica de rango
                const start = new Date(dateRange.start + 'T00:00:00'); // Asegurar local time
                const end = new Date(dateRange.end + 'T00:00:00');
                dateMatch = d >= start && d <= end;
            } else if (filterDate) {
                // Lógica de fecha única
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                const oDateStr = `${year}-${month}-${day}`;
                dateMatch = oDateStr === filterDate;
            }
        }

        return statusMatch && searchMatch && dateMatch;
    });
    currentFilteredOrders = filtered;
    renderOrders(filtered);
    updateStats(filtered);
}

searchInput.addEventListener('input', applyFilters);
// Limpiar rango si se usa el selector individual
document.getElementById('date-filter').addEventListener('change', () => {
    dateRange = { start: null, end: null };
    document.getElementById('range-display-text').textContent = '';
    applyFilters();
});

// Range Modal Logic
const modalRange = document.getElementById('modal-date-range');
const btnDateRange = document.getElementById('btn-date-range');

btnDateRange.addEventListener('click', () => {
    modalRange.classList.add('active');
});

// Forzar apertura de calendario al hacer click en el input
['range-start', 'range-end'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('click', () => {
        if ('showPicker' in HTMLInputElement.prototype) {
            el.showPicker();
        }
    });
});

document.getElementById('range-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const start = document.getElementById('range-start').value;
    const end = document.getElementById('range-end').value;

    if (start && end) {
        dateRange = { start, end };
        // Limpiar visualmente el date-picker simple para indicar que manda el rango
        document.getElementById('date-filter').value = '';

        // Función auxiliar local para formatear YYYY-MM-DD -> DD/MM/YYYY sin UTC
        const fmt = (s) => {
            if (!s) return '';
            const [y, m, d] = s.split('-');
            return `${d}/${m}/${y}`;
        };

        document.getElementById('range-display-text').textContent = `${fmt(start)} - ${fmt(end)}`;
        modalRange.classList.remove('active');
        applyFilters();
    }
});

document.getElementById('btn-clear-range').addEventListener('click', () => {
    dateRange = { start: null, end: null };
    document.getElementById('range-form').reset();

    // Restaurar fecha hoy por defecto
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    document.getElementById('date-filter').value = `${yyyy}-${mm}-${dd}`;
    document.getElementById('range-display-text').textContent = '';

    modalRange.classList.remove('active');
    applyFilters();
});

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
        title: '¿Cancelar Pedido?',
        text: "Esta acción no se puede deshacer.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sí, cancelar',
        cancelButtonText: 'No'
    });

    if (result.isConfirmed) {
        Swal.showLoading();
        try {
            const res = await fetchAPI('rechazarPedido', { nro, usuario: currentUser.usuario });
            if (res.success) {
                Swal.fire('Cancelado', 'El pedido ha sido marcado como cancelado.', 'success');
                loadOrders();
            } else {
                Swal.fire('Error', res.message, 'error');
            }
        } catch (e) {
            Swal.fire('Error', 'Error de conexión', 'error');
        }
    }
}
// --- Bulk Import Logic ---

let allParsedOrders = [];

document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('modal-import').classList.add('active');

    document.getElementById('import-file').value = '';
    document.getElementById('import-preview-container').classList.add('hidden');
    document.getElementById('import-drop-zone').querySelector('.upload-placeholder').classList.remove('hidden');
    document.getElementById('btn-confirm-import').disabled = true;
    allParsedOrders = [];
});

// Make sure input is clickable without double trigger
document.getElementById('import-file').addEventListener('click', (e) => e.stopPropagation());

document.getElementById('import-drop-zone').addEventListener('click', () => document.getElementById('import-file').click());
document.getElementById('import-file').addEventListener('change', handleImportFileSelect);

async function handleImportFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Show Loading
    document.getElementById('import-preview-container').classList.remove('hidden');
    document.getElementById('import-table-body').innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">Leyendo archivo CSV...</td></tr>';

    try {
        const text = await file.text();
        const extractedOrders = parseCSV(text);
        allParsedOrders = extractedOrders;
        renderImportTable(extractedOrders);
    } catch (err) {
        console.error(err);
        Swal.fire('Error', 'No se pudo leer el archivo: ' + err.message, 'error');
        document.getElementById('import-preview-container').classList.add('hidden');
    }
    // Clear value to allow re-upload same file
    e.target.value = '';
}

function parseCSV(csvText) {
    const lines = csvText.split(/\r?\n/);
    const ordersFound = [];

    // Expected Format: "Fecha Registro,Llave,Monto"
    // "17/02/2026,F2FQSKVDG,S/46.90"

    lines.forEach((line, index) => {
        if (!line.trim()) return;

        // Simple CSV Split
        const parts = line.split(',');

        if (parts.length < 3) return;

        // Skip Header
        if (parts[0].toLowerCase().includes('fecha') && parts[1].toLowerCase().includes('llave')) return;

        const rawDate = parts[0].trim(); // "17/02/2026"
        const key = parts[1].trim().toUpperCase();
        let amountStr = parts[2].trim(); // "S/46.90"
        let envio = parts[3] ? parts[3].trim().replace(/\r/g, '') : ""; // "Yeiser G."

        // Clean Amount (remove S/, space)
        amountStr = amountStr.replace(/S\//gi, '').replace(/\s/g, '');

        // Validate Amount
        const amount = parseFloat(amountStr);
        if (isNaN(amount)) return;

        // Parse Date
        const isoDate = parseSpanishDate(rawDate);
        const finalDate = isoDate || rawDate;

        ordersFound.push({
            llave: key,
            fecha: finalDate,
            monto: amount,
            envio: envio,
            raw: line
        });
    });

    // Importante: Invertimos el orden aquí para que al enviarse a BD:
    // 1. El último del archivo (más antiguo) se procese primero -> ID menor
    // 2. El primero del archivo (más reciente) se procese al final -> ID mayor
    // Resultado visual final (DESC): ID mayor (Reciente) queda ARRIBA.
    return ordersFound.reverse();
}

// Helper function for parseCSV to convert Spanish date strings to ISO format
function parseSpanishDate(dateString) {
    const months = {
        'ene': '01', 'feb': '02', 'mar': '03', 'abr': '04', 'may': '05', 'jun': '06',
        'jul': '07', 'ago': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dic': '12'
    };

    // Format "19/02/2026 10:08" (Prioridad para tu nuevo formato)
    const dateTimeMatch = dateString.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
    if (dateTimeMatch) {
        // Return as is, Google Script will parse it with the new logic
        return dateString;
    }

    // Format "18 feb. 2026" or "18 feb 2026"
    const match = dateString.match(/(\d{1,2})\s+([a-zA-Z]{3})\.?\s+(\d{4})/i);
    if (match) {
        const day = match[1].padStart(2, '0');
        const monthAbbr = match[2].toLowerCase();
        const year = match[3];
        const month = months[monthAbbr];
        if (month) {
            return `${year}-${month}-${day}`;
        }
    }

    // Format "17/02/2026" (Sin hora)
    const slashMatch = dateString.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (slashMatch) {
        const day = slashMatch[1].padStart(2, '0');
        const month = slashMatch[2].padStart(2, '0');
        const year = slashMatch[3];
        return `${year}-${month}-${day}`;
    }

    return null; // Return null if format is not recognized
}

function renderImportTable(importedOrders) {
    const tbody = document.getElementById('import-table-body');
    tbody.innerHTML = '';

    // Feedback Logic
    if (importedOrders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No se encontraron pedidos legibles en el PDF.</td></tr>';
        document.getElementById('btn-confirm-import').disabled = true;
        document.getElementById('import-count').textContent = '0';
        return;
    }

    document.getElementById('import-count').textContent = importedOrders.length;
    document.getElementById('btn-confirm-import').disabled = false;

    importedOrders.forEach((order, index) => {
        // Check duplicate local
        const isDupe = orders.some(o => o.llave === order.llave);
        const status = isDupe ? '<span class="badge Rechazado">Duplicado</span>' : '<span class="badge Pendiente">Nuevo</span>';

        const tr = document.createElement('tr');

        tr.innerHTML = `
            <td><input type="checkbox" class="import-check" data-llave="${order.llave}" ${isDupe ? '' : 'checked'}></td>
            <td>${order.llave}</td>
            <td>${order.fecha}</td>
            <td>S/ ${order.monto}</td>
            <td>${order.envio || ''}</td>
            <td>${status}</td>
        `;
        tbody.appendChild(tr);
        tr.querySelector('.import-check').orderData = order;
    });
}

document.getElementById('btn-confirm-import').addEventListener('click', async () => {
    const checkboxes = document.querySelectorAll('.import-check:checked');
    if (checkboxes.length === 0) {
        Swal.fire('Error', 'Selecciona al menos un pedido', 'warning');
        return;
    }

    const selectedOrders = [];

    checkboxes.forEach(cb => {
        if (cb.orderData) {
            selectedOrders.push(cb.orderData);
        }
    });

    Swal.fire({
        title: 'Importando...',
        text: `Enviando ${selectedOrders.length} pedidos`,
        didOpen: () => Swal.showLoading()
    });

    try {
        const res = await fetchAPI('crearPedidosMasivos', {
            orders: selectedOrders,
            usuario: currentUser.usuario
        });

        if (res.success) {
            Swal.fire('Éxito', res.message, 'success');
            document.getElementById('modal-import').classList.remove('active');
            loadOrders();
        } else {
            Swal.fire('Error', res.message, 'error');
        }
    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'Falló la conexión o el procesamiento', 'error');
    }
});

// --- Bulk Import Text (Paste) Logic ---

let allParsedTextOrders = [];
const importTextModal = document.getElementById('modal-import-text');
const importTextBtn = document.getElementById('import-text-btn');
const importTextDropZone = document.getElementById('import-text-drop-zone');
const importTextPreviewContainer = document.getElementById('import-text-preview-container');
const importTextTableBody = document.getElementById('import-text-table-body');
const btnConfirmImportText = document.getElementById('btn-confirm-import-text');
const importTextPlaceholder = document.getElementById('import-text-placeholder');

importTextBtn.addEventListener('click', () => {
    importTextModal.classList.add('active');
    resetImportTextModal();
});

function resetImportTextModal() {
    importTextPreviewContainer.classList.add('hidden');
    importTextPlaceholder.style.display = 'block';
    btnConfirmImportText.disabled = true;
    allParsedTextOrders = [];

    // Enfocar el drop zone para que pueda capturar el evento de pegar (Ctrl+V)
    setTimeout(() => {
        importTextDropZone.focus();
    }, 100);
}

// Interceptar el Ctrl+V en la zona designada
importTextDropZone.addEventListener('paste', (e) => {
    e.preventDefault();
    const pastedText = (e.clipboardData || window.clipboardData).getData('text');

    if (pastedText) {
        processPastedText(pastedText);
    }
});

function processPastedText(text) {
    const extractedOrders = parseRawCopiedText(text);
    allParsedTextOrders = extractedOrders;

    // Ocultar placeholder y mostrar tabla
    importTextPlaceholder.style.display = 'none';
    renderImportTextTable(extractedOrders);
}

function parseRawCopiedText(text) {
    const ordersFound = [];

    // Separar por líneas y eliminar las que están 100% vacías
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l !== '');

    // La llave tiene 9 caracteres (alfanuméricos)
    const keyRegex = /^[A-Z0-9]{9}$/;

    // Expresión para Fecha: "20 feb. 2026"
    const dateRegex = /(\d{1,2})\s+([a-zA-Z]{3})\.?\s+(\d{4})/;
    // Expresión para Hora: "11:20 a. m." o "9:47 a. m."
    const timeRegex = /(\d{1,2}):(\d{2})\s+([ap]\.?\s*m\.?)/i;

    let i = 0;
    while (i < lines.length) {
        let line = lines[i];

        // 1. Encontrar el inicio de un bloque: La Llave
        if (keyRegex.test(line)) {
            const llave = line;

            // Hemos encontrado el inicio de un pedido.
            // Según el bloque de ejemplo proporcionado:
            // Línea actual (i): Llave (Ej: G7N4S4TIC)
            // Línea i+1: Consumidor (ignoramos)
            // Línea i+2 (a veces, tras saltos vacíos filtrados): Fecha (Ej: 20 feb. 2026)
            // Línea i+3: Hora (Ej: 11:20 a. m.)
            // Línea i+4: Estado (Terminado o Cancelado...)
            // Línea i+5: Nombre de Envío (Ej: Yeiser G. o Ivan n.)
            // Línea i+6: Monto (Ej: S/ 56.29)
            // Línea i+7: Método de pago (ignoramos)

            let fechaStr = '';
            let horaStr = '';
            let status = '';
            let envio = '';
            let monto = 0;

            // Avanzar cursor para buscar los datos secuencialmente
            i++;

            // Buscar fecha
            while (i < lines.length && !dateRegex.test(lines[i])) { i++; }
            if (i < lines.length && dateRegex.test(lines[i])) {
                const dMatch = lines[i].match(dateRegex);
                const dtIso = parseSpanishDate(dMatch[0]);
                if (dtIso) {
                    const [y, m, d] = dtIso.split('-');
                    fechaStr = `${d}/${m}/${y}`;
                }
                i++; // Avanzar a hora
            }

            // Conseguir hora
            if (i < lines.length && timeRegex.test(lines[i])) {
                const tMatch = lines[i].match(timeRegex);
                let hour = parseInt(tMatch[1]);
                const min = tMatch[2];
                const ampm = tMatch[3].toLowerCase();
                if (ampm.includes('p') && hour < 12) hour += 12;
                if (ampm.includes('a') && hour === 12) hour = 0;
                horaStr = `${String(hour).padStart(2, '0')}:${min}`;
                i++; // Avanzar a estado
            }

            // Estado (ej. Terminado)
            if (i < lines.length) {
                status = lines[i];
                i++;
            }

            // Nombre del Repartidor (Envío)
            if (i < lines.length) {
                envio = lines[i];
                i++;
            }

            // Monto (Ej. S/ 56.29)
            if (i < lines.length && lines[i].startsWith('S/')) {
                const amountClean = lines[i].replace(/[^\d.,]/g, '').replace(',', '.');
                monto = parseFloat(amountClean).toFixed(2);
                i++;
            }

            // Re-armar Fecha y Hora
            let finalDate = fechaStr;
            if (fechaStr && horaStr) finalDate = `${fechaStr} ${horaStr}`;

            ordersFound.push({
                llave: llave,
                fecha: finalDate,
                monto: monto,
                envio: envio,
                originalStatus: status // Útil para la vista previa
            });

        } else {
            // No es llave, seguimos buscando
            i++;
        }
    }

    // Mantener el mismo orden en que fueron copiados de la web superior a inferior (Más recientes primero)
    return ordersFound;
}

function renderImportTextTable(importedOrders) {
    importTextPreviewContainer.classList.remove('hidden');
    importTextTableBody.innerHTML = '';

    if (importedOrders.length === 0) {
        importTextTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No se encontró texto compatible. Asegúrese de copiar las filas directamente desde el origen web.</td></tr>';
        btnConfirmImportText.disabled = true;
        document.getElementById('import-text-count').textContent = '0';
        return;
    }

    document.getElementById('import-text-count').textContent = importedOrders.length;
    btnConfirmImportText.disabled = false;

    // Check All handler
    const checkAllBox = document.getElementById('import-text-check-all');
    checkAllBox.checked = true;
    checkAllBox.onchange = (e) => {
        const cbs = document.querySelectorAll('.import-text-check');
        cbs.forEach(cb => {
            if (!cb.disabled) cb.checked = e.target.checked;
        });
    };

    importedOrders.forEach((order) => {
        const isDupe = orders.some(o => o.llave === order.llave);
        const statusHTML = isDupe ? '<span class="badge Rechazado">Duplicado en Sistema</span>' : `<span class="badge" style="background: rgba(255,255,255,0.1)">${order.originalStatus}</span>`;

        const tr = document.createElement('tr');

        tr.innerHTML = `
            <td><input type="checkbox" class="import-text-check" data-llave="${order.llave}" ${isDupe ? '' : 'checked'} ${isDupe ? 'disabled' : ''}></td>
            <td style="font-weight: bold;">${order.llave}</td>
            <td>${order.fecha}</td>
            <td style="color:var(--success);">S/ ${order.monto}</td>
            <td>${order.envio}</td>
            <td>${statusHTML}</td>
        `;
        importTextTableBody.appendChild(tr);
        // Save order data attached to checkbox for import
        tr.querySelector('.import-text-check').orderData = order;
    });
}

btnConfirmImportText.addEventListener('click', async () => {
    const checkboxes = document.querySelectorAll('.import-text-check:checked');
    if (checkboxes.length === 0) {
        Swal.fire('Error', 'Selecciona al menos un pedido nuevo para importar', 'warning');
        return;
    }

    const selectedOrders = [];
    checkboxes.forEach(cb => {
        if (cb.orderData) {
            selectedOrders.push({
                llave: cb.orderData.llave,
                fecha: cb.orderData.fecha,
                monto: cb.orderData.monto,
                envio: cb.orderData.envio,
                nro: null // Correlativo generado por BD
            });
        }
    });

    Swal.fire({
        title: 'Importando...',
        text: `Enviando ${selectedOrders.length} pedidos a BD`,
        didOpen: () => Swal.showLoading()
    });

    try {
        const res = await fetchAPI('crearPedidosMasivos', {
            orders: selectedOrders,
            usuario: currentUser.usuario
        });

        if (res.success) {
            Swal.fire('Éxito', res.message, 'success');
            importTextModal.classList.remove('active');
            loadOrders();
        } else {
            Swal.fire('Error', res.message, 'error');
        }
    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'Falló la conexión masiva', 'error');
    }
});



// Validated Card Breakdown Interaction
document.getElementById('card-validated')?.addEventListener('click', () => {
    let cash = 0, cashCount = 0;
    let online = 0, onlineCount = 0;
    let voucher = 0, voucherCount = 0;

    // Safety check just in case orders is not loaded
    if (!currentFilteredOrders) return;

    currentFilteredOrders.forEach(o => {
        if (o.estado === 'Validado') {
            const m = parseFloat(o.monto) || 0;
            if (o.foto === 'PAGO-EFECTIVO') {
                cash += m;
                cashCount++;
            } else if (o.foto === 'PAGO-ONLINE') {
                online += m;
                onlineCount++;
            } else {
                voucher += m;
                voucherCount++;
            }
        }
    });

    Swal.fire({
        title: 'Detalle de Validados',
        html: `
            <div style="text-align: left; padding: 10px; font-size: 1.1rem;">
                <div style="margin-bottom: 15px; text-align: center; color: var(--success); font-weight: bold;">
                    Total: S/ ${formatMoney(cash + online + voucher)}
                </div>
                
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 8px;">
                     <span><i class="fa-solid fa-camera"></i> Voucher</span>
                     <span>S/ ${formatMoney(voucher)} <small>(${voucherCount})</small></span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 8px;">
                     <span><i class="fa-solid fa-money-bill-wave"></i> Efectivo</span>
                     <span>S/ ${formatMoney(cash)} <small>(${cashCount})</small></span>
                </div>
                <div style="display: flex; justify-content: space-between; padding: 8px; background: rgba(255,255,255,0.05); border-radius: 8px;">
                     <span><i class="fa-solid fa-cloud"></i> Online</span>
                     <span>S/ ${formatMoney(online)} <small>(${onlineCount})</small></span>
                </div>
            </div>
        `,
        background: '#1e1b4b',
        color: '#fff',
        showCloseButton: true,
        focusConfirm: false,
        confirmButtonText: 'Cerrar',
        customClass: {
            popup: 'glass-panel'
        }
    });
});
