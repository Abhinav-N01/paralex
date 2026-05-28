"use client";

import { useEffect, useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import {
  UploadCloud, FileText, Loader2, CheckCircle2,
  XCircle, RefreshCw, Trash2, AlertCircle, User, DollarSign,
  FileCheck
} from "lucide-react";
import { documentsApi, type Document, formatFileSize, categoryLabel, DOCUMENT_STATUS_COLORS } from "@/lib/api";

interface Props {
  caseId: string;
  onUpdate: () => void;
}

// Ordered category groups (biographical first, financial second)
const CATEGORY_GROUPS = [
  {
    id: "biographical",
    label: "Biographical Documents",
    icon: User,
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    categories: ["passport", "birth_certificate", "national_id", "visa_stamps", "other"],
    // special: also show I-94 and I-797 type docs here
    description: "Passport, I-94, H-1B visa stamps, I-797 approval notices",
  },
  {
    id: "financial",
    label: "Financial Documents",
    icon: DollarSign,
    color: "text-green-700",
    bg: "bg-green-50",
    border: "border-green-200",
    categories: ["bank_statement", "tax_return", "w2", "pay_stub", "tax_receipt",
                 "investment_statement", "stock_statement", "retirement_401k",
                 "property_document", "wire_transfer", "gift_letter", "loan_document",
                 "business_ownership", "business_financials"],
    description: "Bank statements, W-2s, tax returns, wire transfers, 401(k), stocks",
  },
  {
    id: "legal",
    label: "Legal & Case Files",
    icon: FileCheck,
    color: "text-purple-700",
    bg: "bg-purple-50",
    border: "border-purple-200",
    categories: ["prior_memo", "legal_correspondence"],
    description: "Prior memos, correspondence, supporting legal documents",
  },
];

function getGroupForCategory(cat: string) {
  for (const g of CATEGORY_GROUPS) {
    if (g.categories.includes(cat)) return g.id;
  }
  return "biographical"; // fallback
}

export function DocumentsTab({ caseId, onUpdate }: Props) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading]     = useState(true);
  const [uploading, setUploading] = useState<string[]>([]);

  useEffect(() => {
    loadDocuments();
    const interval = setInterval(loadDocuments, 5000);
    return () => clearInterval(interval);
  }, [caseId]);

  async function loadDocuments() {
    try {
      const docs = await documentsApi.list(caseId);
      setDocuments(docs);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    for (const file of acceptedFiles) {
      setUploading(prev => [...prev, file.name]);
      try {
        await documentsApi.upload(caseId, file);
        await loadDocuments();
        onUpdate();
      } catch (e: any) {
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
      "text/csv": [".csv"],
    },
    multiple: true,
  });

  async function deleteDocument(docId: string) {
    if (!confirm("Delete this document? It will also be removed from the search index.")) return;
    await documentsApi.delete(caseId, docId);
    await loadDocuments();
    onUpdate();
  }

  async function reindexDocument(docId: string) {
    await documentsApi.reindex(caseId, docId);
    await loadDocuments();
  }

  const processingCount = documents.filter(d => d.status === "processing" || d.status === "pending").length;

  // Group documents by category group
  const grouped: Record<string, Document[]> = {};
  for (const doc of documents) {
    const gid = getGroupForCategory(doc.category);
    if (!grouped[gid]) grouped[gid] = [];
    grouped[gid].push(doc);
  }

  // Assign exhibit letters globally across all docs
  const exhibitMap: Record<string, string> = {};
  let exhibitCounter = 0;
  for (const group of CATEGORY_GROUPS) {
    for (const doc of (grouped[group.id] || [])) {
      exhibitMap[doc.id] = String.fromCharCode(65 + exhibitCounter);
      exhibitCounter++;
    }
  }

  return (
    <div className="space-y-6">
      {/* Upload Zone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all
          ${isDragActive
            ? "border-brand-500 bg-brand-50"
            : "border-slate-300 bg-white hover:border-brand-400 hover:bg-slate-50"
          }`}
      >
        <input {...getInputProps()} />
        <div className={`w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center
          ${isDragActive ? "bg-brand-100" : "bg-slate-100"}`}>
          <UploadCloud className={`w-7 h-7 ${isDragActive ? "text-brand-600" : "text-slate-400"}`} />
        </div>
        <p className="text-base font-semibold text-slate-700 mb-1">
          {isDragActive ? "Drop files here..." : "Drag & drop client documents"}
        </p>
        <p className="text-sm text-slate-500 mb-3">or click to browse files</p>
        <div className="flex flex-wrap justify-center gap-1.5">
          {["Passport", "I-94", "I-797", "Visa Stamps", "Bank Stmts (7 yrs)",
            "W-2 / Tax Returns (5 yrs)", "Pay Stubs", "Wire Transfers", "401(k)", "Stocks/Brokerage", "PAN Card", "ITR / Form 16"].map(t => (
            <span key={t} className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full border border-slate-200">
              {t}
            </span>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-3">PDF · JPG/PNG (OCR) · DOCX · XLSX · CSV — up to 50 MB each</p>
      </div>

      {/* Uploading status */}
      {uploading.length > 0 && (
        <div className="card p-4 flex items-center gap-3 bg-blue-50 border-blue-200">
          <Loader2 className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
          <div>
            <p className="text-sm font-semibold text-blue-700">Uploading {uploading.length} file(s)...</p>
            <p className="text-xs text-blue-500">{uploading.join(", ")}</p>
          </div>
        </div>
      )}

      {/* Processing banner */}
      {processingCount > 0 && (
        <div className="card p-4 flex items-center gap-3 bg-amber-50 border-amber-200">
          <Loader2 className="w-5 h-5 text-amber-600 animate-spin shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-700">
              Processing {processingCount} document{processingCount !== 1 ? "s" : ""} — parsing, OCR & indexing
            </p>
            <p className="text-xs text-amber-500">Auto-refreshes every 5 seconds · Documents will be searchable once indexed</p>
          </div>
        </div>
      )}

      {/* Exhibit legend */}
      {documents.length > 0 && (
        <div className="card p-4 bg-gold-50 border border-gold-200">
          <p className="text-xs font-bold text-gold-700 mb-2">📋 USCIS Exhibit Assignment (auto-updated as you add docs)</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(exhibitMap).map(([docId, letter]) => {
              const doc = documents.find(d => d.id === docId);
              if (!doc) return null;
              return (
                <span key={docId} className="exhibit-tag">
                  {letter}: {doc.original_filename.length > 25
                    ? doc.original_filename.slice(0, 25) + "…"
                    : doc.original_filename}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Document list — grouped by category */}
      {loading ? (
        <div className="card p-12 text-center text-slate-400">Loading documents...</div>
      ) : documents.length === 0 ? (
        <div className="card p-14 text-center">
          <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-semibold">No documents uploaded yet</p>
          <p className="text-sm text-slate-400 mt-1">Upload client documents above to get started</p>
        </div>
      ) : (
        <div className="space-y-6">
          {CATEGORY_GROUPS.map(group => {
            const groupDocs = grouped[group.id] || [];
            if (groupDocs.length === 0) return null;
            const Icon = group.icon;
            return (
              <div key={group.id} className="card overflow-hidden">
                {/* Group header */}
                <div className={`px-5 py-3 flex items-center gap-3 ${group.bg} border-b ${group.border}`}>
                  <Icon className={`w-4 h-4 ${group.color}`} />
                  <div className="flex-1">
                    <h3 className={`font-bold text-sm ${group.color}`}>{group.label}</h3>
                    <p className="text-xs text-slate-500">{group.description}</p>
                  </div>
                  <span className="text-xs font-semibold text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                    {groupDocs.length} doc{groupDocs.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Document rows */}
                <div className="divide-y divide-slate-100">
                  {groupDocs.map(doc => (
                    <DocumentRow
                      key={doc.id}
                      doc={doc}
                      exhibitLetter={exhibitMap[doc.id]}
                      onDelete={() => deleteDocument(doc.id)}
                      onReindex={() => reindexDocument(doc.id)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DocumentRow({
  doc, exhibitLetter, onDelete, onReindex,
}: {
  doc: Document;
  exhibitLetter: string;
  onDelete: () => void;
  onReindex: () => void;
}) {
  return (
    <div className="px-5 py-3.5 flex items-start gap-4 hover:bg-slate-50 transition-colors">
      <StatusIcon status={doc.status} />

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="exhibit-tag shrink-0">Exhibit {exhibitLetter}</span>
              <p className="font-semibold text-slate-800 text-sm truncate" title={doc.original_filename}>
                {doc.original_filename}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <span className="badge badge-category">{categoryLabel(doc.category)}</span>
              {doc.document_date && (
                <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{doc.document_date}</span>
              )}
              {doc.ocr_applied && (
                <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-semibold">OCR</span>
              )}
              <span className={`badge ${DOCUMENT_STATUS_COLORS[doc.status] || "bg-slate-100 text-slate-600"}`}>
                {doc.status}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            {doc.status === "failed" && (
              <button onClick={onReindex} title="Re-process"
                className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors">
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
            <button onClick={onDelete} title="Delete"
              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {doc.extraction_notes && (
          <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
            <AlertCircle className="w-3 h-3 shrink-0" />
            {doc.extraction_notes}
          </p>
        )}

        {doc.status === "indexed" && (
          <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
            <span>{doc.page_count} pages</span>
            <span>·</span>
            <span>{doc.chunk_count} passages indexed</span>
            <span>·</span>
            <span>{formatFileSize(doc.file_size)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "indexed")    return <CheckCircle2 className="w-5 h-5 text-success-500 shrink-0 mt-0.5" />;
  if (status === "failed")     return <XCircle      className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />;
  if (status === "processing") return <Loader2      className="w-5 h-5 text-blue-500 shrink-0 mt-0.5 animate-spin" />;
  return                              <Loader2      className="w-5 h-5 text-slate-300 shrink-0 mt-0.5 animate-pulse" />;
}
