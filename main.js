// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

// Global variables
let pdfDoc = null;
let currentPage = 1;
let pageRendering = false;
let pageNumPending = null;
let scale = 1.5;
let canvas = null;
let ctx = null;
let pdfBytes = null;
let totalPages = 0;
let zoomLevel = 1;
let initialHistoryState = false;
const MIN_ZOOM = 1.0;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 0.1;
const PREVIEW_SCALE = 0.2;

// Page-specific annotation storage
let pageAnnotations = {};
let pageTextElements = {};
let pageHistory = {};
let currentHistoryIndex = {};

// Annotation variables
let annotationCanvas = null;
let annotationCtx = null;
let currentTool = null;  // Changed to null for no default tool
let currentColor = 'green';
let isDrawing = false;
let startX, startY;
let annotations = [];
let textElements = [];
let history = [];
let draggedElement = null;
let dragOffsetX = 0;
let dragOffsetY = 0;
let selectedAnnotation = null;
let magnifierActive = false;
let magnifierSize = 150;
let magnifierZoom = 2;

// Global history tracking
let globalHistory = [];
let globalHistoryIndex = -1; // Start at -1 to indicate no history yet

// Elements
const uploadContainer = document.getElementById('upload-container');
const editorPage = document.getElementById('editor-page');
const fileInput = document.getElementById('file-input');
const dropArea = document.getElementById('drop-area');
const pdfContainer = document.getElementById('pdf-container');
const pagePreviews = document.getElementById('page-previews');
const loadingElement = document.getElementById('loading');

// Tool buttons
const circleTool = document.getElementById('circle-tool');
const squareTool = document.getElementById('square-tool');
const arrowTool = document.getElementById('arrow-tool');
const lineTool = document.getElementById('line-tool');
const textTool = document.getElementById('text-tool');
const downloadBtn = document.getElementById('download-btn');
const colorOptions = document.querySelectorAll('.color-option');

// File input event handlers
fileInput.addEventListener('change', handleFileSelect);
dropArea.addEventListener('click', () => fileInput.click());

// Drag and drop handlers
dropArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropArea.style.borderColor = '#2196F3';
});

dropArea.addEventListener('dragleave', () => {
    dropArea.style.borderColor = '#ccc';
});

dropArea.addEventListener('drop', (e) => {
    e.preventDefault();
    dropArea.style.borderColor = '#ccc';
    if (e.dataTransfer.files.length) {
        fileInput.files = e.dataTransfer.files;
        handleFileSelect(e);
    }
});

// Tool selection
circleTool.addEventListener('click', () => setActiveTool('circle'));
squareTool.addEventListener('click', () => setActiveTool('square'));
arrowTool.addEventListener('click', () => setActiveTool('arrow'));
lineTool.addEventListener('click', () => setActiveTool('line'));
textTool.addEventListener('click', () => setActiveTool('text'));

// Color selection
colorOptions.forEach(option => {
    option.addEventListener('click', () => {
        colorOptions.forEach(opt => opt.classList.remove('active'));
        option.classList.add('active');
        currentColor = option.getAttribute('data-color');
    });
});

// Download button
downloadBtn.addEventListener('click', downloadPDF);

// Zoom controls
const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');
const zoomLevelDisplay = document.querySelector('.zoom-level');
const undoBtn = document.getElementById('undo-btn');

zoomInBtn.addEventListener('click', () => {
    if (zoomLevel < MAX_ZOOM) {
        adjustZoom(ZOOM_STEP, window.innerWidth / 2, window.innerHeight / 2);
    }
});

zoomOutBtn.addEventListener('click', () => {
    if (zoomLevel > MIN_ZOOM) {
        adjustZoom(-ZOOM_STEP, window.innerWidth / 2, window.innerHeight / 2);
    }
});
undoBtn.addEventListener('click', undoLastAction);

// Handle mouse wheel for zoom
document.querySelector('.pdf-container').addEventListener('wheel', function (e) {
    if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        adjustZoom(delta, e.clientX, e.clientY);
    }
});

// Adjust zoom level
function adjustZoom(delta, mouseX, mouseY) {
    const oldZoom = zoomLevel;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomLevel + delta));

    if (newZoom !== oldZoom) {
        const container = document.querySelector('.pdf-container');
        const zoomWrapper = document.querySelector('.zoom-wrapper');

        if (!container || !zoomWrapper) return;

        // Get the current scroll position and container dimensions
        const containerRect = container.getBoundingClientRect();
        const oldScrollLeft = container.scrollLeft;
        const oldScrollTop = container.scrollTop;

        // Calculate the point relative to the document that we want to keep stable
        const viewportX = mouseX ? mouseX : containerRect.width / 2;
        const viewportY = mouseY ? mouseY : containerRect.height / 2;

        // Calculate the point in the content that we're zooming around
        const contentX = (viewportX + oldScrollLeft) / oldZoom;
        const contentY = (viewportY + oldScrollTop) / oldZoom;

        // Update zoom level
        zoomLevel = newZoom;
        zoomLevelDisplay.textContent = Math.round(zoomLevel * 100) + '%';

        // Apply zoom to all page containers
        const pageContainers = document.querySelectorAll('.page-container');
        let currentTop = 0;
        const PAGE_GAP = 80; // Same fixed gap as in renderAllPages

        pageContainers.forEach((container, index) => {
            container.style.transform = `scale(${zoomLevel})`;
            const wrapper = container.closest('.page-wrapper');
            if (wrapper) {
                wrapper.style.top = `${currentTop}px`;
                currentTop += container.offsetHeight * zoomLevel + PAGE_GAP;
            }
        });

        // Update wrapper height
        zoomWrapper.style.height = `${currentTop}px`;

        // Calculate new scroll position
        requestAnimationFrame(() => {
            // Calculate new scroll position to maintain zoom point
            const newScrollLeft = (contentX * newZoom) - viewportX;
            const newScrollTop = (contentY * newZoom) - viewportY;

            // Apply new scroll position
            container.scrollLeft = newScrollLeft;
            container.scrollTop = newScrollTop;
        });

        zoomInBtn.disabled = zoomLevel >= MAX_ZOOM;
        zoomOutBtn.disabled = zoomLevel <= MIN_ZOOM;
    }
}

// Set active tool
function setActiveTool(tool) {
    currentTool = tool;

    // Remove active class from all tools
    const toolButtons = document.querySelectorAll('.toolbar button');
    toolButtons.forEach(button => button.classList.remove('active'));

    // Add active class to current tool
    switch (tool) {
        case 'circle':
            circleTool.classList.add('active');
            break;
        case 'square':
            squareTool.classList.add('active');
            break;
        case 'arrow':
            arrowTool.classList.add('active');
            break;
        case 'line':
            lineTool.classList.add('active');
            break;
        case 'text':
            textTool.classList.add('active');
            break;
    }
}

// Check if point is inside shape
function isPointInShape(x, y, annotation) {
    switch (annotation.tool) {
        case 'circle':
            const radius = Math.sqrt(Math.pow(annotation.endX - annotation.startX, 2) + Math.pow(annotation.endY - annotation.startY, 2));
            const distance = Math.sqrt(Math.pow(x - annotation.startX, 2) + Math.pow(y - annotation.startY, 2));
            return distance <= radius;
        case 'square':
            return x >= Math.min(annotation.startX, annotation.endX) &&
                x <= Math.max(annotation.startX, annotation.endX) &&
                y >= Math.min(annotation.startY, annotation.endY) &&
                y <= Math.max(annotation.startY, annotation.endY);
        case 'line':
            const lineLength = Math.sqrt(Math.pow(annotation.endX - annotation.startX, 2) + Math.pow(annotation.endY - annotation.startY, 2));
            const pointDistance = Math.abs((annotation.endY - annotation.startY) * x -
                (annotation.endX - annotation.startX) * y +
                annotation.endX * annotation.startY -
                annotation.endY * annotation.startX) / lineLength;
            return pointDistance < 5; // 5 pixels tolerance
        case 'arrow':
            return isPointInShape(x, y, { ...annotation, tool: 'line' });
    }
    return false;
}

// Start drawing or dragging
function startDrawing(e) {
    if (!currentTool) return;

    const rect = annotationCanvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoomLevel;
    const y = (e.clientY - rect.top) / zoomLevel;

    // Check if we're clicking on an existing shape
    if (currentTool === null) {
        for (let i = annotations.length - 1; i >= 0; i--) {
            if (isPointInShape(x, y, annotations[i])) {
                selectedAnnotation = annotations[i];
                dragOffsetX = x - selectedAnnotation.startX;
                dragOffsetY = y - selectedAnnotation.startY;
                return;
            }
        }
    }

    if (currentTool === 'text') return;

    isDrawing = true;
    startX = x;
    startY = y;

    if (currentTool === 'circle') {
        annotationCtx.beginPath();
        annotationCtx.arc(startX, startY, 1, 0, 2 * Math.PI);
        annotationCtx.stroke();
    }
}

// Draw or drag
function draw(e) {
    if (!currentTool && !selectedAnnotation) return;

    const rect = annotationCanvas.getBoundingClientRect();
    const currentX = (e.clientX - rect.left) / zoomLevel;
    const currentY = (e.clientY - rect.top) / zoomLevel;

    // Clear canvas and redraw all annotations
    annotationCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);
    redrawAnnotations();

    if (selectedAnnotation) {
        // Update selected annotation position
        const dx = currentX - (selectedAnnotation.startX + dragOffsetX);
        const dy = currentY - (selectedAnnotation.startY + dragOffsetY);

        selectedAnnotation.startX += dx;
        selectedAnnotation.startY += dy;
        selectedAnnotation.endX += dx;
        selectedAnnotation.endY += dy;

        dragOffsetX = currentX - selectedAnnotation.startX;
        dragOffsetY = currentY - selectedAnnotation.startY;

        redrawAnnotations();
        return;
    }

    if (!isDrawing || currentTool === 'text') return;

    annotationCtx.strokeStyle = currentColor;
    annotationCtx.lineWidth = 2;

    switch (currentTool) {
        case 'circle':
            const radius = Math.sqrt(Math.pow(currentX - startX, 2) + Math.pow(currentY - startY, 2));
            annotationCtx.beginPath();
            annotationCtx.arc(startX, startY, radius, 0, 2 * Math.PI);
            annotationCtx.stroke();
            break;
        case 'square':
            const width = currentX - startX;
            const height = currentY - startY;
            annotationCtx.strokeRect(startX, startY, width, height);
            break;
        case 'line':
            annotationCtx.beginPath();
            annotationCtx.moveTo(startX, startY);
            annotationCtx.lineTo(currentX, currentY);
            annotationCtx.stroke();
            break;
        case 'arrow':
            drawArrow(annotationCtx, startX, startY, currentX, currentY);
            break;
    }
}

// Stop drawing or dragging
function stopDrawing(e) {
    if (selectedAnnotation) {
        selectedAnnotation = null;
        saveToHistory();
        return;
    }

    if (!isDrawing || currentTool === 'text') return;

    const rect = annotationCanvas.getBoundingClientRect();
    const endX = (e.clientX - rect.left) / zoomLevel;
    const endY = (e.clientY - rect.top) / zoomLevel;

    annotations.push({
        tool: currentTool,
        color: currentColor,
        startX: startX,
        startY: startY,
        endX: endX,
        endY: endY
    });

    // Update page-specific annotations
    pageAnnotations[currentPage] = [...annotations];

    isDrawing = false;
    saveToHistory();
}

// Handle canvas click for text tool
function handleCanvasClick(e) {
    if (currentTool !== 'text') return;

    try {
        const pageContainer = e.target.closest('.page-container');
        if (!pageContainer) return;

        const pageNum = parseInt(pageContainer.dataset.pageNumber);
        const rect = e.target.getBoundingClientRect();
        const x = (e.clientX - rect.left) / zoomLevel;
        const y = (e.clientY - rect.top) / zoomLevel;

        // Create temporary textarea field
        const tempTextarea = document.createElement('textarea');
        tempTextarea.className = 'temp-input';
        tempTextarea.style.position = 'absolute';
        tempTextarea.style.left = (e.clientX - rect.left + pageContainer.scrollLeft) + 'px';
        tempTextarea.style.top = (e.clientY - rect.top + pageContainer.scrollTop - 8) + 'px';
        tempTextarea.style.color = currentColor;
        tempTextarea.style.transform = `scale(${zoomLevel})`;
        tempTextarea.style.transformOrigin = 'left top';
        tempTextarea.style.width = '300px';
        tempTextarea.style.height = 'auto';
        tempTextarea.style.minHeight = '24px';
        tempTextarea.style.maxHeight = '200px';
        tempTextarea.style.resize = 'none';
        tempTextarea.style.overflow = 'auto';
        tempTextarea.style.fontFamily = 'Arial, sans-serif';
        tempTextarea.style.fontSize = '16px';
        tempTextarea.style.lineHeight = '1.2';
        tempTextarea.style.padding = '2px';
        tempTextarea.style.border = '1px solid #ccc';
        tempTextarea.style.background = 'rgba(255, 255, 255, 0.8)';
        tempTextarea.style.zIndex = '1000';

        // Create Save and Discard buttons
        const btnContainer = document.createElement('div');
        btnContainer.style.position = 'absolute';
        btnContainer.style.left = (e.clientX - rect.left + pageContainer.scrollLeft + 310) + 'px';
        btnContainer.style.top = (e.clientY - rect.top + pageContainer.scrollTop - 8) + 'px';
        btnContainer.style.zIndex = '1001';
        btnContainer.style.display = 'flex';
        btnContainer.style.gap = '4px';

        const saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.title = 'Save';
        saveBtn.innerHTML = '💾';
        saveBtn.style.fontSize = '18px';
        saveBtn.style.cursor = 'pointer';
        saveBtn.style.background = '#e0ffe0';
        saveBtn.style.border = '1px solid #ccc';
        saveBtn.style.borderRadius = '3px';
        saveBtn.style.padding = '2px 6px';

        const discardBtn = document.createElement('button');
        discardBtn.type = 'button';
        discardBtn.title = 'Discard';
        discardBtn.innerHTML = '❌';
        discardBtn.style.fontSize = '18px';
        discardBtn.style.cursor = 'pointer';
        discardBtn.style.background = '#ffe0e0';
        discardBtn.style.border = '1px solid #ccc';
        discardBtn.style.borderRadius = '3px';
        discardBtn.style.padding = '2px 6px';

        btnContainer.appendChild(saveBtn);
        btnContainer.appendChild(discardBtn);

        pageContainer.appendChild(tempTextarea);
        pageContainer.appendChild(btnContainer);
        tempTextarea.focus();

        // Auto-resize textarea as content grows
        function autoResize() {
            tempTextarea.style.height = 'auto';
            tempTextarea.style.height = (tempTextarea.scrollHeight) + 'px';
        }
        tempTextarea.addEventListener('input', autoResize);

        // Save action
        function saveText() {
            const text = tempTextarea.value.trim();
            if (text) {
                // Get the annotation canvas for this page
                const annotCanvas = pageContainer.querySelector('.annotation-canvas');
                if (!annotCanvas) return;
                const ctx = annotCanvas.getContext('2d');
                ctx.font = '16px Arial';
                ctx.fillStyle = currentColor;
                // Draw multi-line text
                const lines = text.split('\n');
                let lineHeight = 18;
                lines.forEach((line, i) => {
                    ctx.fillText(line, x, y + i * lineHeight);
                });
                // Save text annotation
                if (!pageAnnotations[pageNum]) {
                    pageAnnotations[pageNum] = [];
                }
                pageAnnotations[pageNum].push({
                    tool: 'text',
                    color: currentColor,
                    text: text,
                    x: x,
                    y: y,
                    font: '16px Arial'
                });
                saveToHistory();
            }
            tempTextarea.remove();
            btnContainer.remove();
        }

        // Discard action
        function discardText() {
            tempTextarea.remove();
            btnContainer.remove();
        }
        saveBtn.addEventListener('click', saveText);
        discardBtn.addEventListener('click', discardText);
        tempTextarea.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                discardText();
            }
        });
        tempTextarea.addEventListener('blur', function (e) {
            // Only remove if neither button is focused
            setTimeout(() => {
                if (document.activeElement !== saveBtn && document.activeElement !== discardBtn) {
                    discardText();
                }
            }, 100);
        });
    } catch (error) {
        console.error('Error handling text input:', error);
    }
}

// Redraw all annotations
function redrawAnnotations() {
    annotationCtx.clearRect(0, 0, annotationCanvas.width, annotationCanvas.height);

    annotations.forEach(annotation => {
        annotationCtx.strokeStyle = annotation.color;
        annotationCtx.fillStyle = annotation.color;
        annotationCtx.lineWidth = 2;

        switch (annotation.tool) {
            case 'circle':
                const radius = Math.sqrt(Math.pow(annotation.endX - annotation.startX, 2) +
                    Math.pow(annotation.endY - annotation.startY, 2));
                annotationCtx.beginPath();
                annotationCtx.arc(annotation.startX, annotation.startY, radius, 0, 2 * Math.PI);
                annotationCtx.stroke();
                break;
            case 'square':
                const width = annotation.endX - annotation.startX;
                const height = annotation.endY - annotation.startY;
                annotationCtx.strokeRect(annotation.startX, annotation.startY, width, height);
                break;
            case 'line':
                annotationCtx.beginPath();
                annotationCtx.moveTo(annotation.startX, annotation.startY);
                annotationCtx.lineTo(annotation.endX, annotation.endY);
                annotationCtx.stroke();
                break;
            case 'arrow':
                drawArrow(annotationCtx, annotation.startX, annotation.startY,
                    annotation.endX, annotation.endY);
                break;
            case 'text':
                annotationCtx.font = annotation.font || '16px Arial';
                annotationCtx.fillStyle = annotation.color;
                annotationCtx.fillText(annotation.text, annotation.x, annotation.y);
                break;
        }
    });
}

// Draw arrow function
function drawArrow(ctx, fromX, fromY, toX, toY) {
    const headLength = 15;
    const dx = toX - fromX;
    const dy = toY - fromY;
    const angle = Math.atan2(dy, dx);
    const length = Math.sqrt(dx * dx + dy * dy);

    // Ensure minimum length of 4 characters (approximately 32 pixels)
    if (length < 32) {
        const scale = 32 / length;
        toX = fromX + dx * scale;
        toY = fromY + dy * scale;
    }

    // Line
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    // Arrowhead
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headLength * Math.cos(angle - Math.PI / 6), toY - headLength * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toX - headLength * Math.cos(angle + Math.PI / 6), toY - headLength * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fillStyle = ctx.strokeStyle;
    ctx.fill();
}

// Initialize history when loading PDF
function initializeHistory() {
    globalHistory = [];
    globalHistoryIndex = -1;

    // Create initial state for all pages
    const initialState = {
        pageAnnotations: {},
        pageTextElements: {},
        currentPage: 1
    };

    // Initialize empty arrays for each page
    for (let i = 1; i <= totalPages; i++) {
        initialState.pageAnnotations[i] = [];
        initialState.pageTextElements[i] = [];
    }

    globalHistory.push(initialState);
    globalHistoryIndex = 0;
    updateUndoButton();
}

// Save current state to history
function saveToHistory() {
    // Create a deep copy of the current state for all pages
    const currentState = {
        pageAnnotations: JSON.parse(JSON.stringify(pageAnnotations)),
        pageTextElements: JSON.parse(JSON.stringify(pageTextElements)),
        currentPage: currentPage
    };

    // Remove any future states if we're not at the end of history
    if (globalHistoryIndex < globalHistory.length - 1) {
        globalHistory = globalHistory.slice(0, globalHistoryIndex + 1);
    }

    // Only save if the state is different from the last saved state
    const lastState = globalHistory[globalHistory.length - 1];
    if (!lastState || JSON.stringify(currentState) !== JSON.stringify(lastState)) {
        globalHistory.push(currentState);
        globalHistoryIndex = globalHistory.length - 1;
    }

    updateUndoButton();
}

// Undo last action
function undoLastAction() {
    if (globalHistoryIndex > 0) { // Changed from >= 0 to > 0 to keep initial state
        // Decrement history index
        globalHistoryIndex--;

        // Get the previous state
        const state = globalHistory[globalHistoryIndex];

        // Update all pages' annotations and text elements
        pageAnnotations = JSON.parse(JSON.stringify(state.pageAnnotations));
        pageTextElements = JSON.parse(JSON.stringify(state.pageTextElements));

        // Update current page's annotations and textElements
        annotations = pageAnnotations[currentPage] || [];
        textElements = pageTextElements[currentPage] || [];

        // Redraw annotations for all pages
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const pageContainer = document.querySelector(`.page-container[data-page-number="${pageNum}"]`);
            if (pageContainer) {
                const annotCanvas = pageContainer.querySelector('.annotation-canvas');
                if (annotCanvas) {
                    const ctx = annotCanvas.getContext('2d');
                    ctx.clearRect(0, 0, annotCanvas.width, annotCanvas.height);
                    if (pageAnnotations[pageNum]) {
                        drawAnnotationsOnCanvas(ctx, pageAnnotations[pageNum]);
                    }
                }
            }
        }

        updateUndoButton();
    }
}

// Update undo button state
function updateUndoButton() {
    undoBtn.disabled = globalHistoryIndex <= 0; // Changed from < 0 to <= 0 to keep initial state
}

// Handle file selection
function handleFileSelect(e) {
    const file = e.target.files[0] || e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
        loadingElement.style.display = 'block';
        const reader = new FileReader();
        reader.onload = function (e) {
            const typedArray = new Uint8Array(e.target.result);
            pdfBytes = typedArray;
            loadPdf(typedArray);
            uploadContainer.style.display = 'none';
            editorPage.style.display = 'block';
        };
        reader.readAsArrayBuffer(file);
    } else {
        alert('Please select a valid PDF file.');
    }
}

// Create page preview
async function createPagePreview(pageNum) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: PREVIEW_SCALE });

    const previewDiv = document.createElement('div');
    previewDiv.className = 'page-preview';

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const pageNumber = document.createElement('div');
    pageNumber.className = 'page-number';
    pageNumber.textContent = pageNum;

    previewDiv.appendChild(canvas);
    previewDiv.appendChild(pageNumber);
    pagePreviews.appendChild(previewDiv);

    const context = canvas.getContext('2d');
    await page.render({
        canvasContext: context,
        viewport: viewport
    }).promise;
}

// Update preview selection
function updatePreviewSelection() {
    const previews = pagePreviews.querySelectorAll('.page-preview');
    previews.forEach((preview, index) => {
        preview.classList.toggle('active', index + 1 === currentPage);
    });
}

// Load PDF file
function loadPdf(data) {
    pdfjsLib.getDocument({ data }).promise.then(async function (pdf) {
        pdfDoc = pdf;
        totalPages = pdf.numPages;

        // Initialize history before creating previews
        initializeHistory();

        // Create previews for all pages
        pagePreviews.innerHTML = '';
        for (let i = 1; i <= totalPages; i++) {
            await createPagePreview(i);
        }

        // Render all pages
        renderAllPages();

        // Save initial state after rendering
        saveToHistory();
    }).catch(function (error) {
        console.error('Error loading PDF:', error);
        alert('Failed to load PDF. Please try again with a different file.');
        loadingElement.style.display = 'none';
    });
}

// Render all pages
async function renderAllPages() {
    const zoomWrapper = document.querySelector('.zoom-wrapper') || createZoomWrapper();
    zoomWrapper.innerHTML = '';

    const PAGE_GAP = 80; // Fixed gap between pages in pixels
    let totalHeight = 0;
    let maxWidth = 0;

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale });

        // Create page wrapper with absolute positioning
        const pageWrapper = document.createElement('div');
        pageWrapper.className = 'page-wrapper';
        pageWrapper.style.top = `${totalHeight}px`;

        // Create page container
        const pageContainer = document.createElement('div');
        pageContainer.className = 'page-container';
        pageContainer.dataset.pageNumber = pageNum;
        pageWrapper.appendChild(pageContainer);
        zoomWrapper.appendChild(pageWrapper);

        // Create PDF canvas
        const pdfCanvas = document.createElement('canvas');
        pdfCanvas.className = 'pdf-canvas';
        pdfCanvas.width = viewport.width;
        pdfCanvas.height = viewport.height;
        pageContainer.appendChild(pdfCanvas);

        // Create annotation canvas
        const annotCanvas = document.createElement('canvas');
        annotCanvas.className = 'annotation-canvas';
        annotCanvas.width = viewport.width;
        annotCanvas.height = viewport.height;
        annotCanvas.style.position = 'absolute';
        annotCanvas.style.left = '0';
        annotCanvas.style.top = '0';
        annotCanvas.style.pointerEvents = 'auto';
        pageContainer.appendChild(annotCanvas);

        // Set container dimensions
        pageContainer.style.width = `${viewport.width}px`;
        pageContainer.style.height = `${viewport.height}px`;

        // Update total height with fixed gap
        totalHeight += viewport.height * zoomLevel + PAGE_GAP;
        maxWidth = Math.max(maxWidth, viewport.width);

        // Render PDF content
        const context = pdfCanvas.getContext('2d');
        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;

        // Set up event listeners
        setupAnnotationListeners(annotCanvas, pageNum);

        // Draw existing annotations
        if (pageAnnotations[pageNum]) {
            const annotContext = annotCanvas.getContext('2d');
            drawAnnotationsOnCanvas(annotContext, pageAnnotations[pageNum]);
        }
    }

    // Set final wrapper dimensions
    zoomWrapper.style.width = `${maxWidth}px`;
    zoomWrapper.style.height = `${totalHeight}px`;

    loadingElement.style.display = 'none';
}

function createZoomWrapper() {
    const zoomWrapper = document.createElement('div');
    zoomWrapper.className = 'zoom-wrapper';
    pdfContainer.appendChild(zoomWrapper);
    return zoomWrapper;
}

// Set up annotation listeners for a specific page
function setupAnnotationListeners(canvas, pageNum) {
    canvas.addEventListener('mousedown', (e) => startDrawingOnPage(e, canvas, pageNum));
    canvas.addEventListener('mousemove', (e) => drawOnPage(e, canvas, pageNum));
    canvas.addEventListener('mouseup', (e) => stopDrawingOnPage(e, canvas, pageNum));
    canvas.addEventListener('mouseout', (e) => stopDrawingOnPage(e, canvas, pageNum));
    canvas.addEventListener('click', (e) => handleCanvasClick(e));
}

// Start drawing on a specific page
function startDrawingOnPage(e, canvas, pageNum) {
    if (!currentTool) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoomLevel;
    const y = (e.clientY - rect.top) / zoomLevel;

    isDrawing = true;
    startX = x;
    startY = y;
    currentPage = pageNum;

    if (!pageAnnotations[pageNum]) {
        pageAnnotations[pageNum] = [];
    }
}

// Draw on a specific page
function drawOnPage(e, canvas, pageNum) {
    if (!isDrawing || pageNum !== currentPage || !currentTool) return;

    const rect = canvas.getBoundingClientRect();
    const currentX = (e.clientX - rect.left) / zoomLevel;
    const currentY = (e.clientY - rect.top) / zoomLevel;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Redraw existing annotations
    if (pageAnnotations[pageNum]) {
        drawAnnotationsOnCanvas(ctx, pageAnnotations[pageNum]);
    }

    // Draw current annotation
    drawCurrentAnnotation(ctx, currentX, currentY);
}

// Stop drawing on a specific page
function stopDrawingOnPage(e, canvas, pageNum) {
    if (!isDrawing || pageNum !== currentPage) return;

    const rect = canvas.getBoundingClientRect();
    const endX = (e.clientX - rect.left) / zoomLevel;
    const endY = (e.clientY - rect.top) / zoomLevel;

    if (currentTool && currentTool !== 'text') {
        const annotation = {
            tool: currentTool,
            color: currentColor,
            startX: startX,
            startY: startY,
            endX: endX,
            endY: endY
        };

        if (!pageAnnotations[pageNum]) {
            pageAnnotations[pageNum] = [];
        }
        pageAnnotations[pageNum].push(annotation);

        const ctx = canvas.getContext('2d');
        drawAnnotationsOnCanvas(ctx, pageAnnotations[pageNum]);
    }

    isDrawing = false;
    saveToHistory();
}

// Restore text elements for a specific page
function restoreTextElementsForPage(pageContainer, textElements) {
    // Remove all existing text elements
    const existingTextElements = pageContainer.querySelectorAll('.text-input');
    existingTextElements.forEach(el => el.remove());

    // Restore text elements for current page
    textElements.forEach(el => {
        const textElement = document.createElement('textarea');
        textElement.className = 'text-input';
        textElement.style.left = el.x + 'px';
        textElement.style.top = el.y + 'px';
        textElement.style.color = el.color;
        textElement.value = el.text;

        pageContainer.appendChild(textElement);
    });
}

// Toggle magnifier
function toggleMagnifier(active) {
    magnifierActive = active;
    const magnifier = document.getElementById('magnifier');
    if (!magnifier) return;

    magnifier.style.display = active ? 'block' : 'none';

    if (active) {
        magnifier.style.width = magnifierSize + 'px';
        magnifier.style.height = magnifierSize + 'px';

        // Configure magnifier
        annotationCanvas.addEventListener('mousemove', handleMagnifier);
    } else {
        annotationCanvas.removeEventListener('mousemove', handleMagnifier);
    }
}

// Handle magnifier movement
function handleMagnifier(e) {
    if (!magnifierActive) return;

    const magnifier = document.getElementById('magnifier');
    if (!magnifier) return;

    const rect = annotationCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Position magnifier
    magnifier.style.left = (x - magnifierSize / 2) + 'px';
    magnifier.style.top = (y - magnifierSize / 2) + 'px';

    // Create magnified view
    magnifier.style.backgroundImage = `url(${canvas.toDataURL()})`;
    magnifier.style.backgroundPosition = `-${(x * magnifierZoom) - (magnifierSize / 2)}px -${(y * magnifierZoom) - (magnifierSize / 2)}px`;
    magnifier.style.backgroundSize = `${canvas.width * magnifierZoom}px ${canvas.height * magnifierZoom}px`;
}

// Download PDF with annotations
async function downloadPDF() {
    loadingElement.style.display = 'block';

    try {
        const pageCanvases = [];

        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const page = await pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale });

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = viewport.width;
            tempCanvas.height = viewport.height;
            const tempCtx = tempCanvas.getContext('2d');

            // Render PDF content
            await page.render({
                canvasContext: tempCtx,
                viewport: viewport
            }).promise;

            // Draw all annotations including text
            if (pageAnnotations[pageNum] && pageAnnotations[pageNum].length > 0) {
                pageAnnotations[pageNum].forEach(annotation => {
                    if (annotation.tool === 'text') {
                        tempCtx.font = annotation.font;
                        tempCtx.fillStyle = annotation.color;
                        // Draw multi-line text
                        const lines = annotation.text.split('\n');
                        let lineHeight = 18;
                        lines.forEach((line, i) => {
                            tempCtx.fillText(line, annotation.x, annotation.y + i * lineHeight);
                        });
                    } else {
                        drawAnnotationsOnCanvas(tempCtx, [annotation]);
                    }
                });
            }

            pageCanvases.push(tempCanvas);
        }

        // Generate PDF
        const { jsPDF } = window.jspdf;
        const firstPage = pageCanvases[0];
        const pdf = new jsPDF({
            orientation: firstPage.width > firstPage.height ? 'landscape' : 'portrait',
            unit: 'px',
            format: [firstPage.width, firstPage.height]
        });

        // Set PDF to open at 100% zoom (actual size)
        if (pdf.internal && pdf.internal.write) {
            pdf.internal.write('/OpenAction << /S /GoTo /D [0 /XYZ null null 1] >>');
        }

        if (pdf.setDisplayMode) {
            pdf.setDisplayMode('fullwidth', 'continuous', 'UseNone');
        }

        pageCanvases.forEach((canvas, index) => {
            if (index > 0) {
                pdf.addPage([canvas.width, canvas.height]);
            }
            const imgData = canvas.toDataURL('image/png');
            pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
        });

        pdf.save('edited-document.pdf');
    } catch (error) {
        console.error('Error generating PDF:', error);
        alert('Failed to generate PDF. Please try again.');
    } finally {
        loadingElement.style.display = 'none';
    }
}

// Initialize canvases
function initializeCanvases(viewport) {
    try {
        const zoomWrapper = document.createElement('div');
        zoomWrapper.className = 'zoom-wrapper';
        pdfContainer.appendChild(zoomWrapper);

        const pdfWrapper = document.createElement('div');
        pdfWrapper.className = 'pdf-wrapper';
        zoomWrapper.appendChild(pdfWrapper);

        canvas = document.createElement('canvas');
        canvas.id = 'pdf-canvas';
        pdfWrapper.appendChild(canvas);
        ctx = canvas.getContext('2d');

        annotationCanvas = document.createElement('canvas');
        annotationCanvas.id = 'annotation-canvas';
        pdfWrapper.appendChild(annotationCanvas);
        annotationCtx = annotationCanvas.getContext('2d');

        // Set up annotation canvas event listeners
        if (annotationCanvas) {
            annotationCanvas.addEventListener('mousedown', startDrawing);
            annotationCanvas.addEventListener('mousemove', draw);
            annotationCanvas.addEventListener('mouseup', stopDrawing);
            annotationCanvas.addEventListener('mouseout', stopDrawing);
            annotationCanvas.addEventListener('click', handleCanvasClick);
        }

        updateCanvasSizes(viewport);
    } catch (error) {
        console.error('Error initializing canvases:', error);
    }
}

// Save current page state
function saveCurrentPageState() {
    if (!currentPage) return;

    try {
        pageAnnotations[currentPage] = annotations ? [...annotations] : [];
        pageTextElements[currentPage] = textElements ? [...textElements] : [];
        pageHistory[currentPage] = history ? [...history] : [];
        currentHistoryIndex[currentPage] = currentHistoryIndex || 0;
    } catch (error) {
        console.error('Error saving page state:', error);
    }
}

// Draw annotations on canvas
function drawAnnotationsOnCanvas(ctx, annotations) {
    annotations.forEach(annotation => {
        ctx.strokeStyle = annotation.color;
        ctx.fillStyle = annotation.color;
        ctx.lineWidth = 2;

        switch (annotation.tool) {
            case 'text':
                ctx.font = annotation.font || '16px Arial';
                ctx.fillStyle = annotation.color;
                ctx.fillText(annotation.text, annotation.x, annotation.y);
                break;
            case 'circle':
                const radius = Math.sqrt(Math.pow(annotation.endX - annotation.startX, 2) +
                    Math.pow(annotation.endY - annotation.startY, 2));
                ctx.beginPath();
                ctx.arc(annotation.startX, annotation.startY, radius, 0, 2 * Math.PI);
                ctx.stroke();
                break;
            case 'square':
                const width = annotation.endX - annotation.startX;
                const height = annotation.endY - annotation.startY;
                ctx.strokeRect(annotation.startX, annotation.startY, width, height);
                break;
            case 'line':
                ctx.beginPath();
                ctx.moveTo(annotation.startX, annotation.startY);
                ctx.lineTo(annotation.endX, annotation.endY);
                ctx.stroke();
                break;
            case 'arrow':
                drawArrow(ctx, annotation.startX, annotation.startY,
                    annotation.endX, annotation.endY);
                break;
        }
    });
}

// Draw current annotation
function drawCurrentAnnotation(ctx, currentX, currentY) {
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = 2;

    switch (currentTool) {
        case 'circle':
            const radius = Math.sqrt(Math.pow(currentX - startX, 2) + Math.pow(currentY - startY, 2));
            ctx.beginPath();
            ctx.arc(startX, startY, radius, 0, 2 * Math.PI);
            ctx.stroke();
            break;
        case 'square':
            const width = currentX - startX;
            const height = currentY - startY;
            ctx.strokeRect(startX, startY, width, height);
            break;
        case 'line':
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(currentX, currentY);
            ctx.stroke();
            break;
        case 'arrow':
            drawArrow(ctx, startX, startY, currentX, currentY);
            break;
    }
}

// Modify the renderPage function to properly handle text annotations
async function renderPage(pageNum) {
    if (pageRendering) {
        pageNumPending = pageNum;
        return;
    }

    pageRendering = true;
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    // Update canvas dimensions
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    annotationCanvas.width = viewport.width;
    annotationCanvas.height = viewport.height;

    // Render PDF page
    await page.render({
        canvasContext: ctx,
        viewport: viewport
    }).promise;

    // Draw existing annotations
    if (pageAnnotations[pageNum]) {
        drawAnnotationsOnCanvas(annotationCtx, pageAnnotations[pageNum]);
    }

    pageRendering = false;
    if (pageNumPending !== null) {
        renderPage(pageNumPending);
        pageNumPending = null;
    }
}
