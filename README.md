# PDF Editor with Native JavaScript and HTML

A lightweight, browser-based PDF editor that allows users to annotate and modify PDF documents using pure JavaScript and HTML. This editor provides a simple yet powerful interface for adding shapes, text, and annotations to PDF files without requiring any server-side processing.

## Features

- **PDF Viewing**: View PDF documents directly in the browser using PDF.js
- **Annotation Tools**:
  - Circle: Draw circular annotations
  - Square: Create rectangular shapes
  - Arrow: Add directional indicators
  - Line: Draw straight lines
  - Text: Add text annotations anywhere on the PDF
- **Color Options**: Choose from multiple colors (green, black, red) for annotations
- **Undo Functionality**: Revert the last annotation action
- **Zoom Controls**: Zoom in/out to adjust the view
- **Multi-page Support**: Navigate through multiple PDF pages
- **Page Preview**: Sidebar with page thumbnails for quick navigation
- **Download**: Save the annotated PDF with all modifications

## Technical Implementation

### Core Technologies
- **PDF.js**: Mozilla's PDF viewer library for rendering PDFs in the browser
- **jsPDF**: Library for PDF generation and modification
- **Native JavaScript**: Pure JavaScript for DOM manipulation and event handling
- **HTML5 Canvas**: Used for drawing annotations and shapes

### Key Components

1. **PDF Loading and Display**
   - Drag and drop or file input for PDF upload
   - PDF.js for rendering PDF pages to canvas
   - Dynamic page creation and management

2. **Annotation System**
   - Canvas-based drawing implementation
   - Event listeners for mouse interactions
   - Separate canvas layer for annotations
   - State management for undo operations

3. **Page Management**
   - Thumbnail generation for sidebar
   - Page navigation system
   - Zoom level management
   - Fixed page gaps for consistent spacing

4. **Drawing Tools**
   - Tool state management
   - Mouse event handling for drawing
   - Shape rendering algorithms
   - Text input handling

### Data Structure

```javascript
{
  annotations: [], // Stores current page annotations
  pageAnnotations: {}, // Stores annotations for all pages
  pageHistory: {}, // Maintains undo history per page
  currentHistoryIndex: {}, // Tracks undo position for each page
  textElements: [], // Manages text annotations
  pageTextElements: {} // Stores text elements per page
}
```

## Usage

1. **Opening a PDF**
   - Click the upload area or drag and drop a PDF file
   - The PDF will load and display with page previews in the sidebar

2. **Adding Annotations**
   - Select a tool from the toolbar (Circle, Square, Arrow, Line, Text)
   - Choose a color from the color picker
   - Click and drag on the PDF to create shapes
   - For text, click where you want to add text and type

3. **Navigation**
   - Use the sidebar thumbnails to jump to specific pages
   - Zoom in/out using the zoom controls
   - Scroll through pages in the main view

4. **Editing**
   - Use the undo button to revert the last action
   - Actions can be undone across different pages
   - Text elements can be moved and edited after placement

5. **Saving**
   - Click the Download button to save the annotated PDF
   - All annotations and modifications will be preserved

## Browser Compatibility

The editor is compatible with modern browsers that support:
- HTML5 Canvas
- PDF.js
- ES6+ JavaScript features
- Drag and Drop API

## Performance Considerations

- Annotations are rendered on separate canvas layers for optimal performance
- Page loading is optimized for memory efficiency
- Zoom operations maintain fixed page gaps
- Undo history is maintained per page to manage memory usage

## Limitations

- Text annotations are implemented as HTML elements for better editing
- Some complex PDF features might not be fully supported
- Performance may vary with very large PDF files
- Mobile support is limited to basic viewing

## Future Improvements

- Additional annotation tools (highlighter, freehand drawing)
- Better mobile device support
- Annotation layer opacity controls
- Custom font support for text annotations
- Annotation grouping and selection
- Cloud storage integration 