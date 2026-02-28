

// PDF Application Types

export interface UploadedFile {
  id: string;
  file: File;
  name: string;
  size: number;
  color: string;
}

export interface PDFPage {
  id: string;
  fileId: string;
  pageIndex: number;
  pageNumber: number;
  thumbnailUrl: string;
  rotation: number;
}

export interface SplitConfig {
  mode: 'extract_all' | 'fixed_number' | 'by_range';
  fixedCount: number;
  rangeInput: string;
}

export type ToolType = 'home' | 'merge' | 'split' | 'convert' | 'compress';

export enum AppStatus {
  IDLE = 'idle',
  PROCESSING = 'processing',
  SUCCESS = 'success',
  ERROR = 'error',
}

export interface ProcessingResult {
  url: string;
  size: number;
  filename: string;
  isZip: boolean;
}

export type ConvertFormat = 'jpg' | 'png' | 'text' | 'csv';

export type CompressionLevel = 'low' | 'balanced' | 'aggressive' | 'custom';

export interface CompressionSettings {
  level: CompressionLevel;
  quality: number; // 0.1 to 1.0
  scale: number;   // 0.5 to 3.0 (DPI control)
}

export interface CompressionResult {
  originalFileId: string;
  compressedBlob: Blob;
  newSize: number;
  originalSize: number;
  filename: string;
}

export interface SearchMatch {
  pageId: string;
  pageNumber: number; // Visual page number (1-based)
  snippet: string; // Context around the match
  matchIndex: number; // Index in the full text
}

export interface SearchResult {
  fileId: string;
  fileName: string;
  fileColor: string;
  matches: SearchMatch[];
}

export interface HistoryEntry {
  pages: PDFPage[];
  selectedPageIds: Set<string>;
  timestamp: number;
}
