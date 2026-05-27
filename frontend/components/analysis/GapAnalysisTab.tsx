"use client";

import { useState } from "react";
import { ClipboardCheck, Loader2, CheckCircle2, XCircle, AlertTriangle, MinusCircle, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { analysisApi, type GapAnalysis } from "@/lib/api";

interface Props {
  caseId: string;
}

export function GapAnalysisTab({ caseId }: Props) {
  const [analysis, setAnalysis] = useState<GapAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function runAnalysis() {
    setLoading(true);
    setError("");
    try {
      const result = await analysisApi.gapAnalysis(caseId);
      setAnalysis(result);
    } catch (e: any) {
      setError(e.message || "Analysis failed. Make sure documents are uploaded and indexed.");
    } finally {
      setLoading(false);
    }
  }

  if (!analysis && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mb-5">
          <ClipboardCheck className="w-8 h-8 text-brand-600" />
        </div>
        <h3 className="text-xl font-semibold text-gray-800 mb-2">EB-5 Document Gap Analysis</h3>
        <p className="text-gray-500 text-sm max-w-md mb-8">
          Compare the uploaded documents against the USCIS EB-5 checklist.
          Identifies what's missing, what needs clarification, and potential red flags.
        </p>
        {error && (
          <div className="mb-4 p-3 bg-danger-50 border border-red-200 rounded-lg text-sm text-red-700 max-w-md">
            {error}
          </div>
        )}
        <button onClick={runAnalysis} className="btn-primary px-8">
          <ClipboardCheck className="w-4 h-4" />
          Run Gap Analysis
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Loader2 className="w-10 h-10 text-brand-600 animate-spin mb-4" />
        <h3 className="text-lg font-semibold text-gray-700">Analyzing documents...</h3>
        <p className="text-sm text-gray-500 mt-2">
          Comparing against USCIS EB-5 checklist. This may take 30–60 seconds.
        </p>
      </div>
    );
  }

  if (!analysis) return null;

  const { summary, sections, priority_actions, strengths, red_flags } = analysis.analysis;
  const completeness = Math.round(summary.completeness_pct);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Gap Analysis Results</h2>
        <button
          onClick={runAnalysis}
          disabled={loading}
          className="btn-secondary text-xs"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Re-run
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SummaryCard
          label="Completeness"
          value={`${completeness}%`}
          color={completeness >= 80 ? "text-success-600" : completeness >= 50 ? "text-amber-600" : "text-danger-600"}
          bg={completeness >= 80 ? "bg-success-50" : completeness >= 50 ? "bg-amber-50" : "bg-danger-50"}
        />
        <SummaryCard label="Present" value={summary.present} color="text-success-600" bg="bg-success-50" />
        <SummaryCard label="Missing" value={summary.missing} color="text-danger-600" bg="bg-danger-50" />
        <SummaryCard label="Uncertain" value={summary.uncertain} color="text-amber-600" bg="bg-amber-50" />
      </div>

      {/* Progress bar */}
      <div className="card p-4">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-gray-600 font-medium">Documentation Completeness</span>
          <span className="font-bold text-gray-800">{completeness}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className={`h-3 rounded-full transition-all duration-500 ${
              completeness >= 80 ? "bg-success-500" : completeness >= 50 ? "bg-amber-500" : "bg-danger-500"
            }`}
            style={{ width: `${completeness}%` }}
          />
        </div>
        <p className="text-xs text-gray-400 mt-2">
          {summary.present} of {summary.total_required} required items documented
          · Based on {analysis.documents_analyzed} indexed documents
        </p>
      </div>

      {/* Sections */}
      {sections.map(section => (
        <SectionCard key={section.section_id} section={section} />
      ))}

      {/* Priority Actions */}
      {priority_actions.length > 0 && (
        <div className="card p-5 border-amber-200">
          <h3 className="font-semibold text-amber-800 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Priority Actions Required
          </h3>
          <ol className="space-y-2">
            {priority_actions.map((action, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-gray-700">
                <span className="w-6 h-6 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                  {i + 1}
                </span>
                {action}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Red Flags */}
      {red_flags.length > 0 && (
        <div className="card p-5 border-red-200 bg-red-50">
          <h3 className="font-semibold text-red-800 mb-3 flex items-center gap-2">
            <XCircle className="w-4 h-4" />
            Potential USCIS Concerns
          </h3>
          <ul className="space-y-2">
            {red_flags.map((flag, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-red-700">
                <span className="mt-1">⚠️</span>
                {flag}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Strengths */}
      {strengths.length > 0 && (
        <div className="card p-5 border-success-500/20">
          <h3 className="font-semibold text-success-600 mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Case Strengths
          </h3>
          <ul className="space-y-2">
            {strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <CheckCircle2 className="w-4 h-4 text-success-500 shrink-0 mt-0.5" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-gray-400 text-center">
        Analysis generated {new Date(analysis.generated_at).toLocaleString()}
      </p>
    </div>
  );
}

function SummaryCard({ label, value, color, bg }: { label: string; value: string | number; color: string; bg: string }) {
  return (
    <div className={`card p-4 ${bg} border-0`}>
      <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function SectionCard({ section }: { section: GapAnalysis["analysis"]["sections"][0] }) {
  const [expanded, setExpanded] = useState(true);
  const missing = section.items.filter(i => i.status === "missing").length;
  const present = section.items.filter(i => i.status === "present").length;

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full px-5 py-4 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
          <span className="font-semibold text-gray-800 text-sm">{section.section_label}</span>
        </div>
        <div className="flex items-center gap-2">
          {present > 0 && <span className="badge badge-present">{present} present</span>}
          {missing > 0 && <span className="badge badge-missing">{missing} missing</span>}
        </div>
      </button>

      {expanded && (
        <div className="divide-y">
          {section.items.map(item => (
            <div key={item.item_id} className="px-5 py-3 flex items-start gap-3">
              <StatusIcon status={item.status} />
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-800">{item.label}</p>
                {item.notes && (
                  <p className="text-xs text-gray-500 mt-0.5">{item.notes}</p>
                )}
                {item.covered_by?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {item.covered_by.map(f => (
                      <span key={f} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-mono">
                        {f}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "present") return <CheckCircle2 className="w-4 h-4 text-success-500 shrink-0 mt-0.5" />;
  if (status === "missing") return <XCircle className="w-4 h-4 text-danger-500 shrink-0 mt-0.5" />;
  if (status === "uncertain") return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />;
  return <MinusCircle className="w-4 h-4 text-gray-300 shrink-0 mt-0.5" />;
}
