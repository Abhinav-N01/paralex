"use client";

import { useEffect, useState } from "react";
import {
  FileEdit, Plus, Loader2, Download, Trash2,
  FileText, Clock, CheckCircle2, ChevronLeft
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
  const [memos, setMemos] = useState<Memo[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedMemo, setSelectedMemo] = useState<Memo | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    loadMemos();
  }, [caseId]);

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
      setError(e.message || "Failed to generate memo. Ensure documents are indexed.");
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
    const url = memosApi.exportMarkdownUrl(caseId, memo.id);
    window.open(url, "_blank");
  }

  // Memo viewer
  if (selectedMemo) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedMemo(null)}
            className="btn-secondary text-xs"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            All Memos
          </button>
          <h2 className="text-base font-semibold text-gray-800 flex-1 truncate">
            {selectedMemo.title}
          </h2>
          <button
            onClick={() => downloadMemo(selectedMemo)}
            className="btn-secondary text-xs"
          >
            <Download className="w-3.5 h-3.5" />
            Export .md
          </button>
          <button
            onClick={() => deleteMemo(selectedMemo.id)}
            className="btn-secondary text-xs text-danger-600 hover:bg-danger-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="card p-6 lg:p-8">
          <div className="prose-legal max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {selectedMemo.content || ""}
            </ReactMarkdown>
          </div>
        </div>

        {selectedMemo.citations && selectedMemo.citations.length > 0 && (
          <div className="card p-5">
            <h3 className="font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Documents Referenced ({selectedMemo.citations.length})
            </h3>
            <div className="space-y-2">
              {selectedMemo.citations.map((c: any, i: number) => (
                <div key={i} className="citation-card">
                  <div className="flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-blue-600" />
                    <span className="font-medium text-blue-800 text-xs">{c.filename}</span>
                    <span className="text-blue-500 text-xs">p.{c.page_number}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 italic">"{c.excerpt}"</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Case Memos</h2>
        <button
          onClick={generateSOFMemo}
          disabled={generating}
          className="btn-primary"
        >
          {generating ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Drafting memo...</>
          ) : (
            <><Plus className="w-4 h-4" /> Draft SOF Memo</>
          )}
        </button>
      </div>

      {error && (
        <div className="p-4 bg-danger-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {generating && (
        <div className="card p-8 text-center">
          <Loader2 className="w-10 h-10 text-brand-600 animate-spin mx-auto mb-4" />
          <h3 className="font-semibold text-gray-700 mb-2">Drafting Source of Funds Memo</h3>
          <p className="text-sm text-gray-500">
            Retrieving relevant document passages and drafting the memo.
            Every fact will be cited to a specific document and page.
            This may take 60–90 seconds...
          </p>
        </div>
      )}

      {loading ? (
        <div className="card p-12 text-center text-gray-400">Loading memos...</div>
      ) : memos.length === 0 ? (
        <div className="card p-16 text-center">
          <FileEdit className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">No memos yet</h3>
          <p className="text-gray-500 text-sm mb-6 max-w-sm mx-auto">
            Generate an AI-drafted Source of Funds memo grounded entirely
            in the client's uploaded documents. Every fact is cited.
          </p>
          <button onClick={generateSOFMemo} disabled={generating} className="btn-primary mx-auto">
            <FileEdit className="w-4 h-4" />
            Draft Source of Funds Memo
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {memos.map(memo => (
            <div
              key={memo.id}
              onClick={() => setSelectedMemo(memo)}
              className="card p-5 cursor-pointer hover:shadow-md hover:border-brand-200 transition-all group"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center shrink-0">
                  <FileEdit className="w-5 h-5 text-brand-600" />
                </div>
                <div className="flex gap-1">
                  {memo.is_final && (
                    <span className="badge badge-present">Final</span>
                  )}
                  <span className="badge badge-category">
                    {memo.memo_type?.replace("_", " ") || "memo"}
                  </span>
                </div>
              </div>

              <h3 className="font-semibold text-gray-800 text-sm mb-1 group-hover:text-brand-700 transition-colors line-clamp-2">
                {memo.title || "Untitled Memo"}
              </h3>

              <p className="text-xs text-gray-400 line-clamp-3 mb-3">
                {memo.content?.slice(0, 150)}...
              </p>

              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <Clock className="w-3 h-3" />
                  {formatDistanceToNow(new Date(memo.created_at), { addSuffix: true })}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={e => { e.stopPropagation(); downloadMemo(memo); }}
                    className="p-1 text-gray-400 hover:text-brand-600"
                    title="Download"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); deleteMemo(memo.id); }}
                    className="p-1 text-gray-400 hover:text-danger-600"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
