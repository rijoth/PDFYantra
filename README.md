# PDFYantra 📄✨

**Secure, Client-Side PDF Tools running directly in your browser.**

PDFYantra provides a suite of PDF manipulation tools that respect your privacy. All processing happens locally on your device—no files are ever uploaded to a server.

## 🛠 Features

*   **Organizer:** Merge, reorder, rotate, and delete pages from multiple PDFs.
*   **Split:** Extract pages or split documents into multiple parts.
*   **Convert:**
    *   Convert Images, Office Docs, and HTML to PDF.
    *   Export PDF pages to Images (JPG/PNG), Text, or CSV.
*   **Compress:** Reduce PDF file size with adjustable quality settings.
*   **Privacy First:** Powered by WebAssembly and modern browser APIs to ensure your data never leaves your computer.

## ✨ Recent Updates

*   **Password Protection:** You can now open and unlock password-protected PDF files.
*   **Memory Efficiency:** Improved memory management by fixing object URL leaks.
*   **Faster UI:** Optimized state handling for smoother reordering of large documents.
*   **High-Res Previews:** Faster page previews with a new intelligent document cache.
*   **Offline Support:** The PDF.js worker is now bundled locally for better privacy.
*   **Optimized Storage:** Smooth background saving with debounced IndexedDB writes.

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