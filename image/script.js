// ============================================
// STATE MANAGEMENT
// ============================================
const state = {
    layers: [],
    selectedLayerId: null,
    history: [],
    historyIndex: -1,
    canvasWidth: 0,
    canvasHeight: 0,
    zoom: 1,
    panX: 0,
    panY: 0,
    originalFormat: 'png',
    originalFilename: 'image',
    cropMode: false,
    cropRect: null,
    cropAspect: null,
    customAspect: null
};

let layerIdCounter = 0;

function generateLayerId() {
    return ++layerIdCounter;
}

function createLayer(image, name = 'Layer') {
    return {
        id: generateLayerId(),
        name: name,
        image: image,
        x: 0,
        y: 0,
        width: image.width,
        height: image.height,
        scale: 1,
        rotation: 0,
        opacity: 1,
        flipH: false,
        flipV: false,
        brightness: 0,
        contrast: 0,
        saturation: 0
    };
}

function cloneState() {
    return {
        layers: state.layers.map(l => ({ ...l })),
        selectedLayerId: state.selectedLayerId,
        canvasWidth: state.canvasWidth,
        canvasHeight: state.canvasHeight
    };
}

function pushHistory() {
    // Remove any future states if we've undone
    if (state.historyIndex < state.history.length - 1) {
        state.history = state.history.slice(0, state.historyIndex + 1);
    }
    state.history.push(cloneState());
    state.historyIndex = state.history.length - 1;
    
    // Limit history size
    if (state.history.length > 50) {
        state.history.shift();
        state.historyIndex--;
    }
    
    updateUndoRedoButtons();
}

function undo() {
    if (state.historyIndex > 0) {
        state.historyIndex--;
        restoreState(state.history[state.historyIndex]);
    }
}

function redo() {
    if (state.historyIndex < state.history.length - 1) {
        state.historyIndex++;
        restoreState(state.history[state.historyIndex]);
    }
}

function restoreState(savedState) {
    state.layers = savedState.layers.map(l => ({ ...l }));
    state.selectedLayerId = savedState.selectedLayerId;
    state.canvasWidth = savedState.canvasWidth;
    state.canvasHeight = savedState.canvasHeight;
    
    updateUndoRedoButtons();
    updateLayersList();
    updatePropertiesPanel();
    render();
}

function updateUndoRedoButtons() {
    document.getElementById('btnUndo').disabled = state.historyIndex <= 0;
    document.getElementById('btnRedo').disabled = state.historyIndex >= state.history.length - 1;
}

// ============================================
// DOM ELEMENTS
// ============================================
const canvas = document.getElementById('mainCanvas');
const ctx = canvas.getContext('2d');
const canvasContainer = document.getElementById('canvasContainer');
const welcomeScreen = document.getElementById('welcomeScreen');
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const layerInput = document.getElementById('layerInput');
const sidePanel = document.getElementById('sidePanel');
const layersList = document.getElementById('layersList');
const propertiesPanel = document.getElementById('propertiesPanel');
const adjustmentsPanel = document.getElementById('adjustmentsPanel');
const transformHandles = document.getElementById('transformHandles');
const cropOverlay = document.getElementById('cropOverlay');
const cropToolbar = document.getElementById('cropToolbar');
const cropSelection = document.getElementById('cropSelection');

// ============================================
// CANVAS RENDERING
// ============================================
function render() {
    if (state.canvasWidth === 0 || state.canvasHeight === 0) return;

    canvas.width = state.canvasWidth;
    canvas.height = state.canvasHeight;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw layers from bottom to top
    for (const layer of state.layers) {
        ctx.save();
        
        // Apply opacity
        ctx.globalAlpha = layer.opacity;

        // Move to layer center
        const cx = layer.x + (layer.width * layer.scale) / 2;
        const cy = layer.y + (layer.height * layer.scale) / 2;
        ctx.translate(cx, cy);

        // Apply rotation
        ctx.rotate(layer.rotation * Math.PI / 180);

        // Apply flips
        ctx.scale(layer.flipH ? -1 : 1, layer.flipV ? -1 : 1);

        // Draw image centered
        const w = layer.width * layer.scale;
        const h = layer.height * layer.scale;

        // Apply adjustments using filter
        if (layer.brightness !== 0 || layer.contrast !== 0 || layer.saturation !== 0) {
            const brightness = 100 + layer.brightness;
            const contrast = 100 + layer.contrast;
            const saturation = 100 + layer.saturation;
            ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
        }

        ctx.drawImage(layer.image, -w / 2, -h / 2, w, h);
        
        ctx.restore();
    }

    // Update canvas position
    updateCanvasTransform();
    updateTransformHandles();
}

function updateCanvasTransform() {
    const containerRect = canvasContainer.getBoundingClientRect();
    const cw = containerRect.width;
    const ch = containerRect.height;

    const scaledW = state.canvasWidth * state.zoom;
    const scaledH = state.canvasHeight * state.zoom;

    // Center the canvas in the container
    const x = (cw - scaledW) / 2 + state.panX;
    const y = (ch - scaledH) / 2 + state.panY;

    canvas.style.left = x + 'px';
    canvas.style.top = y + 'px';
    canvas.style.transform = `scale(${state.zoom})`;
    canvas.style.transformOrigin = '0 0';
}

function fitToScreen() {
    const containerRect = canvasContainer.getBoundingClientRect();
    const padding = 40;
    const availW = containerRect.width - padding * 2;
    const availH = containerRect.height - padding * 2;

    const scaleX = availW / state.canvasWidth;
    const scaleY = availH / state.canvasHeight;
    state.zoom = Math.min(scaleX, scaleY, 1);
    state.panX = 0;
    state.panY = 0;

    document.getElementById('zoomValue').textContent = Math.round(state.zoom * 100) + '%';
    updateCanvasTransform();
    updateTransformHandles();
}

// ============================================
// LAYER MANAGEMENT
// ============================================
function addLayer(image, name, asBase = false) {
    const layer = createLayer(image, name);

    if (asBase || state.layers.length === 0) {
        // First layer becomes the canvas size
        state.canvasWidth = image.width;
        state.canvasHeight = image.height;
        state.layers = [layer];
        welcomeScreen.classList.add('hidden');
        enableControls();
    } else {
        // Center new layer on canvas
        layer.x = (state.canvasWidth - layer.width) / 2;
        layer.y = (state.canvasHeight - layer.height) / 2;
        state.layers.push(layer);
    }

    state.selectedLayerId = layer.id;
    pushHistory();
    updateLayersList();
    updatePropertiesPanel();
    render();
    fitToScreen();
}

function getSelectedLayer() {
    return state.layers.find(l => l.id === state.selectedLayerId);
}

function selectLayer(id) {
    state.selectedLayerId = id;
    updateLayersList();
    updatePropertiesPanel();
    updateTransformHandles();
}

function deleteLayer(id) {
    const index = state.layers.findIndex(l => l.id === id);
    if (index === -1) return;

    state.layers.splice(index, 1);

    if (state.layers.length === 0) {
        state.selectedLayerId = null;
        state.canvasWidth = 0;
        state.canvasHeight = 0;
        welcomeScreen.classList.remove('hidden');
        disableControls();
    } else if (state.selectedLayerId === id) {
        state.selectedLayerId = state.layers[Math.max(0, index - 1)].id;
    }

    pushHistory();
    updateLayersList();
    updatePropertiesPanel();
    render();
}

function moveLayerUp(id) {
    const index = state.layers.findIndex(l => l.id === id);
    if (index < state.layers.length - 1) {
        [state.layers[index], state.layers[index + 1]] = [state.layers[index + 1], state.layers[index]];
        pushHistory();
        updateLayersList();
        render();
    }
}

function moveLayerDown(id) {
    const index = state.layers.findIndex(l => l.id === id);
    if (index > 0) {
        [state.layers[index], state.layers[index - 1]] = [state.layers[index - 1], state.layers[index]];
        pushHistory();
        updateLayersList();
        render();
    }
}

function updateLayersList() {
    if (state.layers.length === 0) {
        layersList.innerHTML = `
            <div style="color: var(--text-secondary); font-size: 13px; text-align: center; padding: 20px;">
                No layers yet
            </div>
        `;
        return;
    }

    layersList.innerHTML = state.layers.slice().reverse().map(layer => `
        <div class="layer-item ${layer.id === state.selectedLayerId ? 'selected' : ''}" data-id="${layer.id}">
            <div class="layer-thumb">
                <img src="${getLayerThumbnail(layer)}" alt="">
            </div>
            <div class="layer-info">
                <div class="layer-name">${layer.name}</div>
                <div class="layer-dims">${Math.round(layer.width * layer.scale)} × ${Math.round(layer.height * layer.scale)}</div>
            </div>
            <div class="layer-actions">
                <button class="layer-btn" data-action="up" title="Move Up">↑</button>
                <button class="layer-btn" data-action="down" title="Move Down">↓</button>
                <button class="layer-btn" data-action="delete" title="Delete">×</button>
            </div>
        </div>
    `).join('');

    // Add click handlers
    layersList.querySelectorAll('.layer-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('.layer-btn')) return;
            selectLayer(parseInt(item.dataset.id));
        });
    });

    layersList.querySelectorAll('.layer-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = parseInt(btn.closest('.layer-item').dataset.id);
            const action = btn.dataset.action;
            if (action === 'delete') deleteLayer(id);
            else if (action === 'up') moveLayerUp(id);
            else if (action === 'down') moveLayerDown(id);
        });
    });
}

function getLayerThumbnail(layer) {
    const thumbCanvas = document.createElement('canvas');
    const size = 80;
    thumbCanvas.width = size;
    thumbCanvas.height = size;
    const thumbCtx = thumbCanvas.getContext('2d');

    const scale = Math.min(size / layer.width, size / layer.height);
    const w = layer.width * scale;
    const h = layer.height * scale;
    const x = (size - w) / 2;
    const y = (size - h) / 2;

    thumbCtx.drawImage(layer.image, x, y, w, h);
    return thumbCanvas.toDataURL();
}

// ============================================
// PROPERTIES PANEL
// ============================================
function updatePropertiesPanel() {
    const layer = getSelectedLayer();
    
    if (!layer) {
        propertiesPanel.style.display = 'none';
        adjustmentsPanel.style.display = 'none';
        return;
    }

    propertiesPanel.style.display = 'block';
    adjustmentsPanel.style.display = 'block';

    // Update property values
    document.getElementById('propOpacity').value = layer.opacity * 100;
    document.getElementById('propOpacityValue').textContent = Math.round(layer.opacity * 100);
    
    document.getElementById('propRotation').value = layer.rotation;
    document.getElementById('propRotationValue').textContent = Math.round(layer.rotation);

    document.getElementById('adjBrightness').value = layer.brightness;
    document.getElementById('adjBrightnessValue').textContent = layer.brightness;
    
    document.getElementById('adjContrast').value = layer.contrast;
    document.getElementById('adjContrastValue').textContent = layer.contrast;
    
    document.getElementById('adjSaturation').value = layer.saturation;
    document.getElementById('adjSaturationValue').textContent = layer.saturation;
}

// ============================================
// TRANSFORM HANDLES
// ============================================
function updateTransformHandles() {
    const layer = getSelectedLayer();
    
    if (!layer || state.layers.indexOf(layer) === 0 || state.cropMode) {
        transformHandles.classList.remove('active');
        return;
    }

    transformHandles.classList.add('active');

    // Get canvas element's actual position on screen
    const canvasRect = canvas.getBoundingClientRect();
    const containerRect = canvasContainer.getBoundingClientRect();

    // Layer position relative to container, accounting for canvas position and zoom
    const layerX = canvasRect.left - containerRect.left + layer.x * state.zoom;
    const layerY = canvasRect.top - containerRect.top + layer.y * state.zoom;
    const layerW = layer.width * layer.scale * state.zoom;
    const layerH = layer.height * layer.scale * state.zoom;

    transformHandles.style.left = layerX + 'px';
    transformHandles.style.top = layerY + 'px';
    transformHandles.style.width = layerW + 'px';
    transformHandles.style.height = layerH + 'px';
    transformHandles.style.transform = `rotate(${layer.rotation}deg)`;
    transformHandles.style.transformOrigin = 'center center';
    transformHandles.style.border = '2px solid var(--accent)';
}

// ============================================
// CROP MODE
// ============================================
function enterCropMode() {
    state.cropMode = true;
    state.cropRect = {
        x: 0,
        y: 0,
        width: state.canvasWidth,
        height: state.canvasHeight
    };
    state.cropAspect = null;

    document.getElementById('cropAspect').value = 'free';
    cropOverlay.classList.add('active');
    cropToolbar.classList.add('active');
    document.getElementById('btnCrop').classList.add('active');
    transformHandles.classList.remove('active');

    updateCropOverlay();
}

function exitCropMode() {
    state.cropMode = false;
    state.cropRect = null;
    state.cropAspect = null;

    cropOverlay.classList.remove('active');
    cropToolbar.classList.remove('active');
    document.getElementById('btnCrop').classList.remove('active');

    updateTransformHandles();
}

function applyCrop() {
    if (!state.cropRect) return;

    const { x, y, width, height } = state.cropRect;
    
    // Create new canvas with cropped content
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');

    // Render current canvas state
    tempCtx.drawImage(canvas, x, y, width, height, 0, 0, width, height);

    // Create new base layer from cropped content
    const img = new Image();
    img.onload = () => {
        // Update all layer positions relative to crop
        state.layers.forEach(layer => {
            layer.x -= x;
            layer.y -= y;
        });

        state.canvasWidth = width;
        state.canvasHeight = height;

        pushHistory();
        exitCropMode();
        render();
        fitToScreen();
    };
    img.src = tempCanvas.toDataURL();
}

function updateCropOverlay() {
    if (!state.cropRect) return;

    const canvasRect = canvas.getBoundingClientRect();
    const containerRect = canvasContainer.getBoundingClientRect();
    
    // Canvas position relative to container
    const canvasX = canvasRect.left - containerRect.left;
    const canvasY = canvasRect.top - containerRect.top;
    const canvasW = canvasRect.width;
    const canvasH = canvasRect.height;

    const rect = state.cropRect;
    const x = canvasX + rect.x * state.zoom;
    const y = canvasY + rect.y * state.zoom;
    const w = rect.width * state.zoom;
    const h = rect.height * state.zoom;

    // Position crop selection
    cropSelection.style.left = x + 'px';
    cropSelection.style.top = y + 'px';
    cropSelection.style.width = w + 'px';
    cropSelection.style.height = h + 'px';

    // Position dim overlays
    document.getElementById('cropDimTop').style.cssText = `
        left: ${canvasX}px; top: ${canvasY}px;
        width: ${canvasW}px; height: ${rect.y * state.zoom}px;
    `;
    document.getElementById('cropDimBottom').style.cssText = `
        left: ${canvasX}px; top: ${y + h}px;
        width: ${canvasW}px; height: ${(state.canvasHeight - rect.y - rect.height) * state.zoom}px;
    `;
    document.getElementById('cropDimLeft').style.cssText = `
        left: ${canvasX}px; top: ${y}px;
        width: ${rect.x * state.zoom}px; height: ${h}px;
    `;
    document.getElementById('cropDimRight').style.cssText = `
        left: ${x + w}px; top: ${y}px;
        width: ${(state.canvasWidth - rect.x - rect.width) * state.zoom}px; height: ${h}px;
    `;
}

function setAspectRatio(ratio) {
    if (ratio === 'free') {
        state.cropAspect = null;
        return;
    }

    if (ratio === 'custom') {
        openModal('aspectModal');
        return;
    }

    const [w, h] = ratio.split(':').map(Number);
    state.cropAspect = w / h;
    constrainCropToAspect();
}

function constrainCropToAspect() {
    if (!state.cropAspect || !state.cropRect) return;

    const rect = state.cropRect;
    const currentRatio = rect.width / rect.height;

    if (currentRatio > state.cropAspect) {
        // Too wide, reduce width
        rect.width = rect.height * state.cropAspect;
    } else {
        // Too tall, reduce height
        rect.height = rect.width / state.cropAspect;
    }

    // Keep within canvas bounds
    rect.width = Math.min(rect.width, state.canvasWidth - rect.x);
    rect.height = Math.min(rect.height, state.canvasHeight - rect.y);

    updateCropOverlay();
}

// ============================================
// RESIZE
// ============================================
function openResizeModal() {
    document.getElementById('resizeWidth').value = state.canvasWidth;
    document.getElementById('resizeHeight').value = state.canvasHeight;
    document.getElementById('resizeOriginal').textContent = `${state.canvasWidth} × ${state.canvasHeight}`;
    document.getElementById('resizeConstrain').checked = true;
    openModal('resizeModal');
}

function applyResize() {
    const newWidth = parseInt(document.getElementById('resizeWidth').value);
    const newHeight = parseInt(document.getElementById('resizeHeight').value);

    if (isNaN(newWidth) || isNaN(newHeight) || newWidth < 1 || newHeight < 1) {
        return;
    }

    const scaleX = newWidth / state.canvasWidth;
    const scaleY = newHeight / state.canvasHeight;

    // Scale all layers
    state.layers.forEach(layer => {
        layer.x *= scaleX;
        layer.y *= scaleY;
        layer.scale *= Math.min(scaleX, scaleY);
    });

    state.canvasWidth = newWidth;
    state.canvasHeight = newHeight;

    pushHistory();
    closeModal('resizeModal');
    render();
    fitToScreen();
}

// ============================================
// EXPORT
// ============================================
function openExportModal() {
    document.getElementById('exportFormat').value = state.originalFormat;
    document.getElementById('exportFilename').value = state.originalFilename;
    updateQualityVisibility();
    openModal('exportModal');
}

function updateQualityVisibility() {
    const format = document.getElementById('exportFormat').value;
    document.getElementById('qualityGroup').style.display = format === 'png' ? 'none' : 'block';
}

function exportImage() {
    const format = document.getElementById('exportFormat').value;
    const quality = parseInt(document.getElementById('exportQuality').value) / 100;
    const filename = document.getElementById('exportFilename').value || 'image';

    const mimeType = format === 'jpeg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png';
    const extension = format === 'jpeg' ? 'jpg' : format;

    const dataUrl = canvas.toDataURL(mimeType, quality);
    
    const link = document.createElement('a');
    link.download = `${filename}.${extension}`;
    link.href = dataUrl;
    link.click();

    closeModal('exportModal');
}

// ============================================
// NEW CANVAS
// ============================================
function openNewCanvasModal() {
    document.getElementById('newCanvasPreset').value = 'custom';
    document.getElementById('newCanvasWidth').value = 1080;
    document.getElementById('newCanvasHeight').value = 1080;
    document.getElementById('newCanvasColor').value = '#ffffff';
    document.getElementById('newCanvasColorHex').value = '#ffffff';
    openModal('newCanvasModal');
}

function createNewCanvas() {
    const width = parseInt(document.getElementById('newCanvasWidth').value);
    const height = parseInt(document.getElementById('newCanvasHeight').value);
    const color = document.getElementById('newCanvasColor').value;

    if (isNaN(width) || isNaN(height) || width < 1 || height < 1 || width > 10000 || height > 10000) {
        alert('Please enter valid dimensions (1-10000 pixels)');
        return;
    }

    // Create a canvas with the background color
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.fillStyle = color;
    tempCtx.fillRect(0, 0, width, height);

    // Convert to image
    const img = new Image();
    img.onload = () => {
        // Reset state for new canvas
        state.layers = [];
        state.history = [];
        state.historyIndex = -1;
        state.selectedLayerId = null;
        layerIdCounter = 0;

        addLayer(img, 'Background', true);
        state.originalFormat = 'png';
        state.originalFilename = 'untitled';
        closeModal('newCanvasModal');
    };
    img.src = tempCanvas.toDataURL();
}

// ============================================
// MODAL HELPERS
// ============================================
function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

// ============================================
// FILE HANDLING
// ============================================
function loadImageFile(file, asBase = false) {
    if (!file.type.startsWith('image/')) return;

    state.originalFormat = file.type.includes('jpeg') || file.type.includes('jpg') ? 'jpeg' :
                          file.type.includes('webp') ? 'webp' : 'png';
    state.originalFilename = file.name.replace(/\.[^.]+$/, '');

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            addLayer(img, file.name, asBase);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function handlePaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
        if (item.type.startsWith('image/')) {
            e.preventDefault();
            const file = item.getAsFile();
            loadImageFile(file, state.layers.length === 0);
            break;
        }
    }
}

// ============================================
// ENABLE/DISABLE CONTROLS
// ============================================
function enableControls() {
    document.getElementById('btnAddLayer').disabled = false;
    document.getElementById('btnLayerAdd').disabled = false;
    document.getElementById('btnCrop').disabled = false;
    document.getElementById('btnResize').disabled = false;
    document.getElementById('btnExport').disabled = false;
}

function disableControls() {
    document.getElementById('btnAddLayer').disabled = true;
    document.getElementById('btnLayerAdd').disabled = true;
    document.getElementById('btnCrop').disabled = true;
    document.getElementById('btnResize').disabled = true;
    document.getElementById('btnExport').disabled = true;
}

// ============================================
// MOUSE/TOUCH INTERACTIONS
// ============================================
let isDragging = false;
let dragType = null;
let dragStartX = 0;
let dragStartY = 0;
let dragStartLayerX = 0;
let dragStartLayerY = 0;
let dragStartLayerScale = 1;
let dragStartLayerRotation = 0;
let dragStartCropRect = null;
let initialPinchDistance = 0;
let initialPinchAngle = 0;

function getPointerPos(e) {
    if (e.touches) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
}

function screenToCanvas(screenX, screenY) {
    const canvasRect = canvas.getBoundingClientRect();
    const containerRect = canvasContainer.getBoundingClientRect();

    return {
        x: (screenX - canvasRect.left) / state.zoom,
        y: (screenY - canvasRect.top) / state.zoom
    };
}

// Canvas container interactions
canvasContainer.addEventListener('mousedown', handlePointerDown);
canvasContainer.addEventListener('touchstart', handlePointerDown, { passive: false });
document.addEventListener('mousemove', handlePointerMove);
document.addEventListener('touchmove', handlePointerMove, { passive: false });
document.addEventListener('mouseup', handlePointerUp);
document.addEventListener('touchend', handlePointerUp);

function handlePointerDown(e) {
    const pos = getPointerPos(e);
    const canvasPos = screenToCanvas(pos.x, pos.y);

    dragStartX = pos.x;
    dragStartY = pos.y;

    // Check for crop handle
    if (state.cropMode) {
        const handle = e.target.closest('.crop-handle');
        if (handle) {
            e.preventDefault();
            isDragging = true;
            dragType = 'crop-' + handle.dataset.handle;
            dragStartCropRect = { ...state.cropRect };
            return;
        }

        // Check for crop move
        if (e.target === cropSelection || e.target.closest('.crop-selection')) {
            e.preventDefault();
            isDragging = true;
            dragType = 'crop-move';
            dragStartCropRect = { ...state.cropRect };
            return;
        }
    }

    // Check for transform handle
    const transformHandle = e.target.closest('.transform-handle');
    if (transformHandle) {
        e.preventDefault();
        const layer = getSelectedLayer();
        if (layer) {
            isDragging = true;
            dragType = 'transform-' + transformHandle.dataset.handle;
            dragStartLayerX = layer.x;
            dragStartLayerY = layer.y;
            dragStartLayerScale = layer.scale;
            dragStartLayerRotation = layer.rotation;
        }
        return;
    }

    // Check for layer hit
    if (!state.cropMode) {
        // Check layers from top to bottom
        for (let i = state.layers.length - 1; i >= 0; i--) {
            const layer = state.layers[i];
            if (i === 0) continue; // Skip base layer for dragging

            const cx = layer.x + (layer.width * layer.scale) / 2;
            const cy = layer.y + (layer.height * layer.scale) / 2;
            
            // Simple bounding box check (ignoring rotation for simplicity)
            const halfW = (layer.width * layer.scale) / 2;
            const halfH = (layer.height * layer.scale) / 2;

            if (canvasPos.x >= layer.x && canvasPos.x <= layer.x + layer.width * layer.scale &&
                canvasPos.y >= layer.y && canvasPos.y <= layer.y + layer.height * layer.scale) {
                e.preventDefault();
                selectLayer(layer.id);
                isDragging = true;
                dragType = 'layer-move';
                dragStartLayerX = layer.x;
                dragStartLayerY = layer.y;
                return;
            }
        }
    }

    // Pan canvas
    if (e.button === 1 || e.button === 0 && e.target === canvas) {
        isDragging = true;
        dragType = 'pan';
    }
}

function handlePointerMove(e) {
    if (!isDragging) return;
    
    e.preventDefault();
    const pos = getPointerPos(e);
    const dx = pos.x - dragStartX;
    const dy = pos.y - dragStartY;

    if (dragType === 'pan') {
        state.panX += dx;
        state.panY += dy;
        dragStartX = pos.x;
        dragStartY = pos.y;
        updateCanvasTransform();
        if (state.cropMode) updateCropOverlay();
        updateTransformHandles();
    } else if (dragType === 'layer-move') {
        const layer = getSelectedLayer();
        if (layer) {
            layer.x = dragStartLayerX + dx / state.zoom;
            layer.y = dragStartLayerY + dy / state.zoom;
            render();
        }
    } else if (dragType.startsWith('crop-')) {
        handleCropDrag(dx / state.zoom, dy / state.zoom);
    } else if (dragType.startsWith('transform-')) {
        handleTransformDrag(pos.x, pos.y);
    }
}

function handlePointerUp(e) {
    if (isDragging) {
        if (dragType === 'layer-move' || dragType.startsWith('transform-')) {
            pushHistory();
        }
        isDragging = false;
        dragType = null;
    }
}

function handleCropDrag(dx, dy) {
    const rect = state.cropRect;
    const start = dragStartCropRect;
    const handle = dragType.replace('crop-', '');

    if (handle === 'move') {
        rect.x = Math.max(0, Math.min(state.canvasWidth - rect.width, start.x + dx));
        rect.y = Math.max(0, Math.min(state.canvasHeight - rect.height, start.y + dy));
    } else {
        // Handle resize
        let newX = start.x;
        let newY = start.y;
        let newW = start.width;
        let newH = start.height;

        if (handle.includes('l')) {
            newX = Math.max(0, Math.min(start.x + start.width - 10, start.x + dx));
            newW = start.width - (newX - start.x);
        }
        if (handle.includes('r')) {
            newW = Math.max(10, Math.min(state.canvasWidth - start.x, start.width + dx));
        }
        if (handle.includes('t')) {
            newY = Math.max(0, Math.min(start.y + start.height - 10, start.y + dy));
            newH = start.height - (newY - start.y);
        }
        if (handle.includes('b')) {
            newH = Math.max(10, Math.min(state.canvasHeight - start.y, start.height + dy));
        }

        // Apply aspect ratio constraint
        if (state.cropAspect) {
            const currentRatio = newW / newH;
            if (handle.includes('l') || handle.includes('r')) {
                newH = newW / state.cropAspect;
            } else {
                newW = newH * state.cropAspect;
            }
        }

        rect.x = newX;
        rect.y = newY;
        rect.width = Math.max(10, newW);
        rect.height = Math.max(10, newH);
    }

    updateCropOverlay();
}

function handleTransformDrag(screenX, screenY) {
    const layer = getSelectedLayer();
    if (!layer) return;

    const handle = dragType.replace('transform-', '');
    const canvasPos = screenToCanvas(screenX, screenY);

    // Calculate center of layer
    const cx = layer.x + (layer.width * layer.scale) / 2;
    const cy = layer.y + (layer.height * layer.scale) / 2;

    if (handle === 'rotate') {
        const angle = Math.atan2(canvasPos.y - cy, canvasPos.x - cx) * 180 / Math.PI + 90;
        layer.rotation = Math.round(angle);
    } else {
        // Scale handles
        const startCx = dragStartLayerX + (layer.width * dragStartLayerScale) / 2;
        const startCy = dragStartLayerY + (layer.height * dragStartLayerScale) / 2;
        
        const startDist = Math.hypot(dragStartX - (canvasContainer.getBoundingClientRect().left + canvasContainer.offsetWidth / 2), 
                                     dragStartY - (canvasContainer.getBoundingClientRect().top + canvasContainer.offsetHeight / 2));
        const currentDist = Math.hypot(screenX - (canvasContainer.getBoundingClientRect().left + canvasContainer.offsetWidth / 2),
                                       screenY - (canvasContainer.getBoundingClientRect().top + canvasContainer.offsetHeight / 2));

        const dx = canvasPos.x - startCx;
        const dy = canvasPos.y - startCy;
        const dist = Math.hypot(dx, dy);
        const startDistFromCenter = Math.hypot(layer.width * dragStartLayerScale / 2, layer.height * dragStartLayerScale / 2);
        
        layer.scale = Math.max(0.1, dragStartLayerScale * (dist / startDistFromCenter));
        
        // Keep centered
        layer.x = cx - (layer.width * layer.scale) / 2;
        layer.y = cy - (layer.height * layer.scale) / 2;
    }

    render();
}

// Pinch to zoom/rotate on layers (mobile)
canvasContainer.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
        const layer = getSelectedLayer();
        if (layer && state.layers.indexOf(layer) > 0) {
            e.preventDefault();
            isDragging = true;
            dragType = 'pinch';
            
            const t1 = e.touches[0];
            const t2 = e.touches[1];
            initialPinchDistance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
            initialPinchAngle = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * 180 / Math.PI;
            dragStartLayerScale = layer.scale;
            dragStartLayerRotation = layer.rotation;
        }
    }
}, { passive: false });

canvasContainer.addEventListener('touchmove', (e) => {
    if (dragType === 'pinch' && e.touches.length === 2) {
        e.preventDefault();
        const layer = getSelectedLayer();
        if (!layer) return;

        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const currentDistance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const currentAngle = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * 180 / Math.PI;

        const scaleFactor = currentDistance / initialPinchDistance;
        const rotationDelta = currentAngle - initialPinchAngle;

        layer.scale = Math.max(0.1, dragStartLayerScale * scaleFactor);
        layer.rotation = dragStartLayerRotation + rotationDelta;

        render();
    }
}, { passive: false });

// Mouse wheel zoom
canvasContainer.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    state.zoom = Math.max(0.1, Math.min(5, state.zoom * delta));
    document.getElementById('zoomValue').textContent = Math.round(state.zoom * 100) + '%';
    updateCanvasTransform();
    if (state.cropMode) updateCropOverlay();
    updateTransformHandles();
}, { passive: false });

// ============================================
// DRAG & DROP
// ============================================
document.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('active');
});

document.addEventListener('dragleave', (e) => {
    if (!e.relatedTarget || e.relatedTarget === document.documentElement) {
        dropZone.classList.remove('active');
    }
});

document.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('active');

    const files = e.dataTransfer?.files;
    if (files?.length > 0) {
        loadImageFile(files[0], state.layers.length === 0);
    }
});

// ============================================
// EVENT LISTENERS
// ============================================

// File inputs
fileInput.addEventListener('change', (e) => {
    if (e.target.files?.[0]) {
        loadImageFile(e.target.files[0], true);
    }
    e.target.value = '';
});

layerInput.addEventListener('change', (e) => {
    if (e.target.files?.[0]) {
        loadImageFile(e.target.files[0], false);
    }
    e.target.value = '';
});

// Toolbar buttons
document.getElementById('btnNew').addEventListener('click', openNewCanvasModal);
document.getElementById('btnWelcomeNew').addEventListener('click', openNewCanvasModal);
document.getElementById('btnOpen').addEventListener('click', () => fileInput.click());
document.getElementById('btnWelcomeOpen').addEventListener('click', () => fileInput.click());
document.getElementById('btnAddLayer').addEventListener('click', () => layerInput.click());
document.getElementById('btnLayerAdd').addEventListener('click', () => layerInput.click());

document.getElementById('btnUndo').addEventListener('click', undo);
document.getElementById('btnRedo').addEventListener('click', redo);

document.getElementById('btnCrop').addEventListener('click', () => {
    if (state.cropMode) {
        exitCropMode();
    } else {
        enterCropMode();
    }
});

document.getElementById('btnResize').addEventListener('click', openResizeModal);
document.getElementById('btnExport').addEventListener('click', openExportModal);

// Crop controls
document.getElementById('cropAspect').addEventListener('change', (e) => {
    setAspectRatio(e.target.value);
});
document.getElementById('btnCropApply').addEventListener('click', applyCrop);
document.getElementById('btnCropCancel').addEventListener('click', exitCropMode);

// Custom aspect ratio modal
document.getElementById('btnAspectConfirm').addEventListener('click', () => {
    const w = parseInt(document.getElementById('aspectWidth').value) || 1;
    const h = parseInt(document.getElementById('aspectHeight').value) || 1;
    state.cropAspect = w / h;
    state.customAspect = `${w}:${h}`;
    constrainCropToAspect();
    closeModal('aspectModal');
});
document.getElementById('btnAspectCancel').addEventListener('click', () => {
    document.getElementById('cropAspect').value = 'free';
    closeModal('aspectModal');
});

// New canvas modal
const newCanvasPreset = document.getElementById('newCanvasPreset');
const newCanvasWidth = document.getElementById('newCanvasWidth');
const newCanvasHeight = document.getElementById('newCanvasHeight');
const newCanvasColor = document.getElementById('newCanvasColor');
const newCanvasColorHex = document.getElementById('newCanvasColorHex');

newCanvasPreset.addEventListener('change', () => {
    const value = newCanvasPreset.value;
    if (value === 'custom') return;
    
    // Parse dimensions from value (format: WIDTHxHEIGHT or WIDTHxHEIGHT-suffix)
    const match = value.match(/^(\d+)x(\d+)/);
    if (match) {
        newCanvasWidth.value = match[1];
        newCanvasHeight.value = match[2];
    }
});

newCanvasWidth.addEventListener('input', () => {
    newCanvasPreset.value = 'custom';
});

newCanvasHeight.addEventListener('input', () => {
    newCanvasPreset.value = 'custom';
});

newCanvasColor.addEventListener('input', () => {
    newCanvasColorHex.value = newCanvasColor.value;
});

newCanvasColorHex.addEventListener('input', () => {
    const hex = newCanvasColorHex.value;
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
        newCanvasColor.value = hex;
    }
});

document.getElementById('btnNewCanvasConfirm').addEventListener('click', createNewCanvas);
document.getElementById('btnNewCanvasCancel').addEventListener('click', () => closeModal('newCanvasModal'));

// Zoom controls
document.getElementById('btnZoomIn').addEventListener('click', () => {
    state.zoom = Math.min(5, state.zoom * 1.25);
    document.getElementById('zoomValue').textContent = Math.round(state.zoom * 100) + '%';
    updateCanvasTransform();
    if (state.cropMode) updateCropOverlay();
    updateTransformHandles();
});
document.getElementById('btnZoomOut').addEventListener('click', () => {
    state.zoom = Math.max(0.1, state.zoom / 1.25);
    document.getElementById('zoomValue').textContent = Math.round(state.zoom * 100) + '%';
    updateCanvasTransform();
    if (state.cropMode) updateCropOverlay();
    updateTransformHandles();
});
document.getElementById('btnZoomFit').addEventListener('click', fitToScreen);

// Properties panel
document.getElementById('propOpacity').addEventListener('input', (e) => {
    const layer = getSelectedLayer();
    if (layer) {
        layer.opacity = e.target.value / 100;
        document.getElementById('propOpacityValue').textContent = e.target.value;
        render();
    }
});
document.getElementById('propOpacity').addEventListener('change', pushHistory);

document.getElementById('propRotation').addEventListener('input', (e) => {
    const layer = getSelectedLayer();
    if (layer) {
        layer.rotation = parseInt(e.target.value);
        document.getElementById('propRotationValue').textContent = e.target.value;
        render();
    }
});
document.getElementById('propRotation').addEventListener('change', pushHistory);

document.getElementById('btnFlipH').addEventListener('click', () => {
    const layer = getSelectedLayer();
    if (layer) {
        layer.flipH = !layer.flipH;
        pushHistory();
        render();
    }
});

document.getElementById('btnFlipV').addEventListener('click', () => {
    const layer = getSelectedLayer();
    if (layer) {
        layer.flipV = !layer.flipV;
        pushHistory();
        render();
    }
});

// Adjustments
['Brightness', 'Contrast', 'Saturation'].forEach(name => {
    const lower = name.toLowerCase();
    document.getElementById('adj' + name).addEventListener('input', (e) => {
        const layer = getSelectedLayer();
        if (layer) {
            layer[lower] = parseInt(e.target.value);
            document.getElementById('adj' + name + 'Value').textContent = e.target.value;
            render();
        }
    });
    document.getElementById('adj' + name).addEventListener('change', pushHistory);
});

document.getElementById('btnResetAdjustments').addEventListener('click', () => {
    const layer = getSelectedLayer();
    if (layer) {
        layer.brightness = 0;
        layer.contrast = 0;
        layer.saturation = 0;
        pushHistory();
        updatePropertiesPanel();
        render();
    }
});

// Resize modal
const resizeWidth = document.getElementById('resizeWidth');
const resizeHeight = document.getElementById('resizeHeight');
const resizeConstrain = document.getElementById('resizeConstrain');

resizeWidth.addEventListener('input', () => {
    if (resizeConstrain.checked && state.canvasWidth > 0) {
        const ratio = state.canvasHeight / state.canvasWidth;
        resizeHeight.value = Math.round(parseInt(resizeWidth.value) * ratio);
    }
});

resizeHeight.addEventListener('input', () => {
    if (resizeConstrain.checked && state.canvasHeight > 0) {
        const ratio = state.canvasWidth / state.canvasHeight;
        resizeWidth.value = Math.round(parseInt(resizeHeight.value) * ratio);
    }
});

document.getElementById('btnResizeConfirm').addEventListener('click', applyResize);
document.getElementById('btnResizeCancel').addEventListener('click', () => closeModal('resizeModal'));

// Export modal
document.getElementById('exportFormat').addEventListener('change', updateQualityVisibility);
document.getElementById('exportQuality').addEventListener('input', (e) => {
    document.getElementById('qualityValue').textContent = e.target.value;
});
document.getElementById('btnExportConfirm').addEventListener('click', exportImage);
document.getElementById('btnExportCancel').addEventListener('click', () => closeModal('exportModal'));

// Panel toggle (mobile)
document.getElementById('btnPanelToggle').addEventListener('click', () => {
    sidePanel.classList.toggle('open');
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modifier = isMac ? e.metaKey : e.ctrlKey;

    if (modifier && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
    } else if (modifier && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
    } else if (modifier && e.key === 'y') {
        e.preventDefault();
        redo();
    } else if (modifier && e.key === 'o') {
        e.preventDefault();
        fileInput.click();
    } else if (e.key === 'Escape') {
        if (state.cropMode) exitCropMode();
        closeModal('exportModal');
        closeModal('resizeModal');
        closeModal('aspectModal');
        closeModal('newCanvasModal');
    } else if (e.key === 'Enter' && state.cropMode) {
        applyCrop();
    }
});

// Paste handler
document.addEventListener('paste', handlePaste);

// Window resize
window.addEventListener('resize', () => {
    if (state.canvasWidth > 0) {
        updateCanvasTransform();
        if (state.cropMode) updateCropOverlay();
        updateTransformHandles();
    }
});

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.classList.remove('active');
        }
    });
});

// Initialize
updateUndoRedoButtons();
