"use client";

import { useEffect, useState } from "react";
import {
  FileEdit, Plus, Loader2, Download, Trash2,
  FileText, Clock, ChevronLeft, Scale, BookOpen,
  CheckCircle2, AlertCircle, Sparkles
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { memosApi, type Memo } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";

interface Props {
  caseId: string;
  caseName: string;
}

export function MemosTab({ caseId, caseName }: Props) {
  const [memos,        setMemos]        = useState<Memo[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [generating,   setGenerating]   = useState(false);
  const [selectedMemo, setSelectedMemo] = useState<Memo | null>(null);
  const [error,        setError]        = useState("");

  useEffect(() => { loadMemos(); }, [caseId]);

  async function loadMemos() {
    try {
      const data = await memosApi.list(caseId);
      setMemos(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function generateSOFMemo() {
    setGenerating(true);
    setError("");
    try {
      const memo = await memosApi.draftSOF(caseId);
      setMemos(prev => [memo, ...prev]);
      setSelectedMemo(memo);
    } catch (e: any) {
      setError(e.message || "Failed to generate memo. Make sure documents are uploaded and indexed.");
    } finally {
      setGenerating(false);
    }
  }

  async function deleteMemo(memoId: string) {
    if (!confirm("Delete this memo?")) return;
    await memosApi.delete(caseId, memoId);
    await loadMemos();
    if (selectedMemo?.id === memoId) setSelectedMemo(null);
  }

  function downloadMemo(memo: Memo) {
    window.open(memosApi.exportMarkdownUrl(caseId, memo.id), "_blank");
  }

  // ── Memo Viewer ──────────────────────────────────────────────────────────────
  if (selectedMemo) {
    return (
      <div className="space-y-4">
        {/* Viewer toolbar */}
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => setSelectedMemo(null)} className="btn-secondary text-xs">
            <ChevronLeft className="w-3.5 h-3.5" />
            All Memos
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-slate-800 truncate">{selectedMemo.title}</h2>
            <p className="text-xs text-slate-400">
              {formatDistanceToNow(new Date(selectedMemo.created_at), { addSuffix: true })} ·{" "}
              {selectedMemo.citations?.length || 0} documents referenced
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => downloadMemo(selectedMemo)} className="btn-secondary text-xs">
              <Download className="w-3.5 h-3.5" />
              Export .md
            </button>
            <button onClick={() => deleteMemo(selectedMemo.id)}
              className="btn-secondary text-xs text-red-600 hover:bg-red-50 hover:border-red-200">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* USCIS memo header banner */}
        <div className="card p-4 bg-brand-50 border border-brand-200">
          <div className="flex items-center gap-3">
            <Scale className="w-5 h-5 text-brand-700 shrink-0" />
            <div>
              <p className="text-xs font-bold text-brand-800 uppercase tracking-wide">
                Source of Funds Memorandum — I-526E Support
              </p>
              <p className="text-xs text-brand-600">
                All facts are cited to specific exhibits. [MISSING: …] indicates required information not found in the uploaded documents.
              </p>
            </div>
          </div>
        </div>

        {/* Memo content */}
        <div className="card p-6 lg:p-10 shadow-sm">
          <div className="prose-legal max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {selectedMemo.content || ""}
            </ReactMarkdown>
          </div>
        </div>

        {/* Exhibits referenced */}
        {selectedMemo.citations && selectedMemo.citations.length > 0 && (
          <div className="card p-5">
            <h3 className="flex items-center gap-2 font-bold text-slate-700 mb-4 text-sm">
              <BookOpen className="w-4 h-4 text-brand-600" />
              Documents Referenced ({selectedMemo.citations.length})
            </h3>
            <div className="space-y-2">
              {selectedMemo.citations.map((c: any, i: number) => (
                <div key={i} className="flex items-start gap-3 py-2 border-b border-slate-100 last:border-0">
                  <span className="exhibit-tag shrink-0">Exhibit {String.fromCharCode(65 + i)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 text-sm truncate">{c.filename}</p>
                    <p className="text-xs text-slate-500">Page {c.page_number}</p>
                    {c.excerpt && (
                      <p className="text-xs text-slate-500 mt-0.5 italic line-clamp-2">"{c.excerpt}"</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Memo List ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Source of Funds Memos</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            AI-drafted memoranda for USCIS I-526E filings — every fact cited to uploaded documents
          </p>
        </div>
        <button onClick={generateSOFMemo} disabled={generating} className="btn-primary">
          {generating
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Drafting memo...</>
            : <><Sparkles className="w-4 h-4" /> Draft SOF Memo</>
          }
        </button>
      </div>

      {error && (
        <div className="card p-4 bg-danger-50 border border-red-200 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-700">Memo generation failed</p>
            <p className="text-xs text-red-600 mt-0.5">{error}</p>
            <p className="text-xs text-red-500 mt-1">Make sure documents are uploaded and indexed (status = indexed).</p>
          </div>
        </div>
      )}

      {/* Generating spinner */}
      {generating && (
        <div className="card p-10 text-center bg-brand-50 border-brand-200">
          <div className="w-14 h-14 bg-brand-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Loader2 className="w-7 h-7 text-brand-600 animate-spin" />
          </div>
          <h3 className="font-bold text-brand-800 mb-2">Drafting Source of Funds Memo</h3>
          <p className="text-sm text-brand-600 max-w-md mx-auto">
            Retrieving relevant passages from all uploaded documents and drafting the memo.
            Every factual claim will be cited to a specific exhibit and page number.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {["Biographical review","Income analysis","Bank statement review",
              "Tax return verification","Fund path tracing","Exhibit assignment"].map(step => (
              <span key={step} className="text-xs bg-brand-100 text-brand-700 border border-brand-200 px-2.5 py-1 rounded-full">
                {step}
              </span>
            ))}
          </div>
          <p className="text-xs text-brand-500 mt-4">This typically takes 60–120 seconds...</p>
        </div>
      )}

      {/* What gets generated — info card */}
      {!generating && memos.length === 0 && !loading && (
        <div className="card p-6 lg:p-10 text-center">
          <div className="w-16 h-16 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <FileEdit className="w-8 h-8 text-brand-400" />
          </div>
          <h3 className="text-xl font-bold text-slate-700 mb-2">No memos yet</h3>
          <p className="text-slate-500 text-sm mb-6 max-w-md mx-auto">
            Generate a complete Source of Funds memorandum for USCIS I-526E filing.
            The memo follows the standard EB-5 attorney memo format.
          </p>

          {/* Memo structure preview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-left max-w-2xl mx-auto mb-8">
            {[
              { label: "Memorandum Header", desc: "To / From / Date / Re: line" },
              { label: "Biographical Background", desc: "From passport, I-94, I-797, visa stamps" },
              { label: "Source of Funds Analysis", desc: "Employment income, savings, investments" },
              { label: "Path of Funds", desc: "How money flowed to escrow account" },
              { label: "Fund Tracing Table", desc: "Dollar-by-dollar account of EB-5 funds" },
              { label: "Exhibit List", desc: "Exhibit A, B, C… with document citations" },
            ].map(item => (
              <div key={item.label} className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <CheckCircle2 className="w-4 h-4 text-success-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                  <p className="text-xs text-slate-500">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-left max-w-lg mx-auto mb-6">
            <p className="text-xs text-amber-800 font-semibold mb-1">📎 For Indian EB-5 investors, the memo will include:</p>
            <p className="text-xs text-amber-700">
              H-1B employment history · US salary + Indian-origin savings · 401(k) rollover documentation ·
              INR → USD conversion with bank transfer records · PAN card / Indian bank accounts reference
            </p>
          </div>

          <button onClick={generateSOFMemo} disabled={generating} className="btn-primary mx-auto px-8">
            <Sparkles className="w-4 h-4" />
            Draft Source of Funds Memo
          </button>
        </div>
      )}

      {loading ? (
        <div className="card p-10 text-center text-slate-400">Loading memos...</div>
      ) : memos.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {memos.map(memo => (
            <MemoCard
              key={memo.id}
              memo={memo}
              onClick={() => setSelectedMemo(memo)}
              onDownload={() => downloadMemo(memo)}
              onDelete={() => deleteMemo(memo.id)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MemoCard({ memo, onClick, onDownload, onDelete }: {
  memo: Memo;
  onClick: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  return (
    <div onClick={onClick}
      className="card-hover p-5 group flex flex-col">
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center shrink-0">
          <FileEdit className="w-5 h-5 text-brand-600" />
        </div>
        <div className="flex gap-1.5">
          {memo.is_final && <span className="badge badge-present">Final</span>}
          <span className="badge badge-category">
            {memo.memo_type?.replace(/_/g, " ") || "SOF Memo"}
          </span>
        </div>
      </div>

      <h3 className="font-bold text-slate-800 text-sm mb-1 group-hover:text-brand-700 transition-colors line-clamp-2">
        {memo.title || "Source of Funds Memo"}
      </h3>

      <p className="text-xs text-slate-400 line-clamp-3 mb-4 flex-1">
        {memo.content?.slice(0, 160)}…
      </p>

      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
        <div className="flex items-center gap-1 text-xs text-slate-400">
          <Clock className="w-3 h-3" />
          {formatDistanceToNow(new Date(memo.created_at), { addSuffix: true })}
        </div>
        <div className="flex gap-1">
          <button onClick={e => { e.stopPropagation(); onDownload(); }}
            className="p-1.5 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
            title="Download Markdown">
            <Download className="w-3.5 h-3.5" />
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete(); }}
            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Delete">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
