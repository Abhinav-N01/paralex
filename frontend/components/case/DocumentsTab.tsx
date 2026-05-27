"use client";

import { useEffect, useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import {
  UploadCloud, FileText, Loader2, CheckCircle2,
  XCircle, RefreshCw, Trash2, AlertCircle, Eye
} from "lucide-react";
import { documentsApi, type Document, formatFileSize, categoryLabel, DOCUMENT_STATUS_COLORS } from "@/lib/api";

interface Props {
  caseId: string;
  onUpdate: () => void;
}

export function DocumentsTab({ caseId, onUpdate }: Props) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string[]>([]);

  useEffect(() => {
    loadDocuments();
    // Poll for processing updates
    const interval = setInterval(loadDocuments, 5000);
    return () => clearInterval(interval);
  }, [caseId]);

  async function loadDocuments() {
    try {
      const docs = await documentsApi.list(caseId);
      setDocuments(docs);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    for (const file of acceptedFiles) {
      setUploading(prev => [...prev, file.name]);
      try {
        await documentsApi.upload(caseId, file);
        await loadDocuments();
        onUpdate();
      } catch (e: any) {
        console.error(`Upload failed for ${file.name}:`, e);
        alert(`Upload failed for ${file.name}: ${e.message}`);
      } finally {
        setUploading(prev => prev.filter(n => n !== file.name));
      }
    }
  }, [caseId]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/tiff": [".tiff", ".tif"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "application/msword": [".doc"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
      "text/csv": [".csv"],
    },
    multiple: true,
  });

  async function deleteDocument(docId: string) {
    if (!confirm("Delete this document? This will also remove it from the search index.")) return;
    await documentsApi.delete(caseId, docId);
    await loadDocuments();
    onUpdate();
  }

  async function reindexDocument(docId: string) {
    await documentsApi.reindex(caseId, docId);
    await loadDocuments();
  }

  const processingCount = documents.filter(d => d.status === "processing" || d.status === "pending").length;

  return (
    <div className="space-y-6">
      {/* Upload Zone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all
          ${isDragActive
            ? "border-brand-500 bg-brand-50"
            : "border-gray-300 bg-white hover:border-brand-400 hover:bg-gray-50"
          }`}
      >
        <input {...getInputProps()} />
        <UploadCloud className={`w-10 h-10 mx-auto mb-3 ${isDragActive ? "text-brand-600" : "text-gray-400"}`} />
        <p className="text-sm font-medium text-gray-700">
          {isDragActive ? "Drop files here..." : "Drag & drop documents, or click to browse"}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          PDF, JPG/PNG (OCR), DOCX, XLSX, CSV — up to 50MB each
        </p>
        <p className="text-xs text-gray-400">
          Accepts: passports, bank statements, tax returns, W-2s, 401k statements, wire transfers, etc.
        </p>
      </div>

      {/* Uploading indicator */}
      {uploading.length > 0 && (
        <div className="card p-4 flex items-center gap-3 border-blue-200 bg-blue-50">
          <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
          <div>
            <p className="text-sm font-medium text-blue-700">Uploading {uploading.length} file(s)...</p>
            <p className="text-xs text-blue-500">{uploading.join(", ")}</p>
          </div>
        </div>
      )}

      {/* Processing banner */}
      {processingCount > 0 && (
        <div className="card p-4 flex items-center gap-3 border-amber-200 bg-amber-50">
          <Loader2 className="w-5 h-5 text-amber-600 animate-spin" />
          <div>
            <p className="text-sm font-medium text-amber-700">
              Processing {processingCount} document(s) — parsing, OCR, and indexing in progress
            </p>
            <p className="text-xs text-amber-500">This page auto-refreshes every 5 seconds</p>
          </div>
        </div>
      )}

      {/* Document List */}
      {loading ? (
        <div className="card p-12 text-center text-gray-400">Loading documents...</div>
      ) : documents.length === 0 ? (
        <div className="card p-12 text-center">
          <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">No documents uploaded yet</p>
          <p className="text-sm text-gray-400 mt-1">Upload client documents above to get started</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between">
            <h3 className="font-medium text-gray-700">
              {documents.length} Document{documents.length !== 1 ? "s" : ""}
            </h3>
            <span className="text-xs text-gray-400">
              {documents.filter(d => d.status === "indexed").length} indexed
            </span>
          </div>
          <div className="divide-y">
            {documents.map(doc => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                onDelete={() => deleteDocument(doc.id)}
                onReindex={() => reindexDocument(doc.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DocumentRow({
  doc,
  onDelete,
  onReindex,
}: {
  doc: Document;
  onDelete: () => void;
  onReindex: () => void;
}) {
  const statusColors = DOCUMENT_STATUS_COLORS[doc.status] || "bg-gray-100 text-gray-600";

  return (
    <div className="px-5 py-4 flex items-start gap-4 hover:bg-gray-50 transition-colors">
      <StatusIcon status={doc.status} />

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-gray-900 text-sm truncate" title={doc.original_filename}>
              {doc.original_filename}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="badge badge-category">{categoryLabel(doc.category)}</span>
              {doc.document_date && (
                <span className="text-xs text-gray-400">{doc.document_date}</span>
              )}
              {doc.ocr_applied && (
                <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">OCR</span>
              )}
              <span className={`badge ${statusColors}`}>
                {doc.status}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            {doc.status === "failed" && (
              <button
                onClick={onReindex}
                title="Re-process document"
                className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onDelete}
              title="Delete document"
              className="p-1.5 text-gray-400 hover:text-danger-600 hover:bg-danger-50 rounded transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Description / notes */}
        {doc.description && (
          <p className="text-xs text-gray-500 mt-1 truncate">{doc.description}</p>
        )}
        {doc.extraction_notes && (
          <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {doc.extraction_notes}
          </p>
        )}

        {/* Stats */}
        {doc.status === "indexed" && (
          <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-400">
            <span>{doc.page_count} pages</span>
            <span>{doc.chunk_count} chunks indexed</span>
            <span>{formatFileSize(doc.file_size)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "indexed") return <CheckCircle2 className="w-5 h-5 text-success-500 shrink-0 mt-0.5" />;
  if (status === "failed") return <XCircle className="w-5 h-5 text-danger-500 shrink-0 mt-0.5" />;
  if (status === "processing") return <Loader2 className="w-5 h-5 text-blue-500 shrink-0 mt-0.5 animate-spin" />;
  return <Loader2 className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />;
}
