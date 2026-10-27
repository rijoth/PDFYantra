# PDFYantra 📄✨

**Private PDF tools that run in your browser.**

PDFYantra is a client-side PDF workspace. PDF bytes and PDF passwords are processed in your browser and are never uploaded or transmitted. There are no accounts, no server-side processing, and no tracking scripts.

## 🛠 Features

*   **Organizer:** Merge, reorder, rotate, and delete pages from multiple PDFs.
*   **Split:** Extract pages or split documents into multiple parts.
*   **Convert:**
    *   Convert Images, Office Docs, and HTML to PDF.
    *   Export PDF pages to Images (JPG/PNG), Text, or CSV.
*   **Compress:** Reduce PDF file size with adjustable quality settings.
*   **Private by design:** PDF processing happens in your browser. The PDF.js worker is bundled with the app, so no CDN is required for PDF work.

## ✨ Recent Updates

*   **Password Protection:** You can now open and unlock password-protected PDF files.
*   **Memory Efficiency:** Improved memory management by fixing object URL leaks.
*   **Faster UI:** Optimized state handling for smoother reordering of large documents.
*   **High-Res Previews:** Faster page previews with a new intelligent document cache.
*   **Bundled PDF.js Worker:** The PDF.js worker is bundled with the app, so no CDN is required for PDF processing.
*   **Optimized Storage:** Smooth background saving with debounced IndexedDB writes.

## 🔒 Privacy and data handling

*   PDF bytes and PDF passwords are processed in the browser and are not uploaded or transmitted.
*   There are no accounts, no server-side processing, and no analytics or telemetry scripts in the repository.
*   The PDF.js worker is bundled with the app, so no CDN is required for PDF processing.
*   Fonts and icons are served by the app itself. No third-party requests.
*   The workspace is stored unencrypted in the browser's IndexedDB (`PDFYantraDB`) so it survives a refresh. Use **Clear workspace** before leaving a shared computer.
*   Unlocking a password-protected PDF creates an unencrypted, image-based copy in the workspace. That copy remains until the workspace is cleared.
*   PDFYantra is not a PWA and has no service worker; the app needs a network connection to load.

## 🚀 Tech Stack

*   React + TypeScript
*   Vite / ESM
*   pdf-lib & pdf.js for manipulation
*   TailwindCSS for styling
*   Zustand for state management

## 📦 Running Locally

1.  Clone the repository.
2.  Install dependencies.
3.  Run the development server.