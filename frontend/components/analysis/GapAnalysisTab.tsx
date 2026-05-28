"use client";

import { useState } from "react";
import {
  ClipboardCheck, Loader2, CheckCircle2, XCircle,
  AlertTriangle, MinusCircle, RefreshCw, ChevronDown,
  ChevronRight, Sparkles, TrendingUp
} from "lucide-react";
import { analysisApi, type GapAnalysis } from "@/lib/api";

interface Props { caseId: string; }

export function GapAnalysisTab({ caseId }: Props) {
  const [analysis, setAnalysis] = useState<GapAnalysis | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

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

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (!analysis && !loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-18 h-18 w-16 h-16 bg-brand-50 rounded-2xl flex items-center justify-center mb-5 shadow-sm">
          <ClipboardCheck className="w-8 h-8 text-brand-600" />
        </div>
        <h3 className="text-xl font-bold text-slate-800 mb-2">EB-5 Document Gap Analysis</h3>
        <p className="text-slate-500 text-sm max-w-md mb-4">
          Compare all uploaded documents against the USCIS EB-5 I-526E checklist.
          Instantly see what's present, what's missing, and what needs clarification.
        </p>

        {/* What it checks */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left max-w-2xl mb-8">
          {[
            {
              icon: "🛂", title: "Biographical",
              items: ["Passport + validity", "I-94 entry record", "H-1B visa stamps", "I-797 approval"],
            },
            {
              icon: "💰", title: "Source of Funds",
              items: ["5 years tax returns", "W-2 / pay stubs (5 yrs)", "7 yrs bank statements (all accounts)", "401(k) / stocks"],
            },
            {
              icon: "🔗", title: "Path of Funds",
              items: ["Wire transfer records", "Account-to-account trace", "Escrow confirmation", "Currency conversion docs"],
            },
          ].map(section => (
            <div key={section.title} className="card p-4">
              <p className="text-base mb-2">{section.icon} <span className="font-bold text-slate-700 text-sm">{section.title}</span></p>
              <ul className="space-y-1">
                {section.items.map(item => (
                  <li key={item} className="text-xs text-slate-600 flex items-center gap-1.5">
                    <span className="w-1 h-1 bg-brand-400 rounded-full shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {error && (
          <div className="mb-5 p-3 bg-danger-50 border border-red-200 rounded-xl text-sm text-red-700 max-w-md">
            {error}
          </div>
        )}

        <button onClick={runAnalysis} className="btn-primary px-10 py-3 text-base">
          <ClipboardCheck className="w-5 h-5" />
          Run Gap Analysis
        </button>
      </div>
    );
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Loader2 className="w-12 h-12 text-brand-600 animate-spin mb-4" />
        <h3 className="text-lg font-bold text-slate-700">Analyzing documents...</h3>
        <p className="text-sm text-slate-500 mt-2 max-w-sm">
          Comparing uploaded documents against the USCIS EB-5 checklist.
          This typically takes 30–60 seconds.
        </p>
      </div>
    );
  }

  if (!analysis) return null;

  const { summary, sections, priority_actions, strengths, red_flags } = analysis.analysis;
  const completeness = Math.round(summary.completeness_pct);
  const completenessColor = completeness >= 80 ? "text-success-600 bg-success-50"
    : completeness >= 50 ? "text-amber-600 bg-amber-50"
    : "text-red-600 bg-danger-50";
  const progressColor = completeness >= 80 ? "bg-success-500"
    : completeness >= 50 ? "bg-amber-500"
    : "bg-red-500";

  // ── Results ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Gap Analysis Results</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Based on {analysis.documents_analyzed} indexed documents ·{" "}
            Generated {new Date(analysis.generated_at).toLocaleString()}
          </p>
        </div>
        <button onClick={runAnalysis} disabled={loading} className="btn-secondary text-xs">
          <RefreshCw className="w-3.5 h-3.5" />
          Re-run
        </button>
      </div>

      {/* Summary scorecards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className={`card p-4 ${completenessColor} border-0`}>
          <p className="text-xs font-bold opacity-70 mb-1 uppercase tracking-wide">Completeness</p>
          <p className="text-3xl font-black">{completeness}%</p>
        </div>
        <div className="card p-4 bg-success-50 border-0">
          <p className="text-xs font-bold text-success-600 opacity-70 mb-1 uppercase tracking-wide">Present</p>
          <p className="text-3xl font-black text-success-600">{summary.present}</p>
        </div>
        <div className="card p-4 bg-danger-50 border-0">
          <p className="text-xs font-bold text-red-600 opacity-70 mb-1 uppercase tracking-wide">Missing</p>
          <p className="text-3xl font-black text-red-600">{summary.missing}</p>
        </div>
        <div className="card p-4 bg-amber-50 border-0">
          <p className="text-xs font-bold text-amber-600 opacity-70 mb-1 uppercase tracking-wide">Uncertain</p>
          <p className="text-3xl font-black text-amber-600">{summary.uncertain}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="card p-5">
        <div className="flex items-center justify-between text-sm mb-3">
          <span className="font-semibold text-slate-700 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-brand-600" />
            Documentation Completeness
          </span>
          <span className="font-black text-slate-900 text-lg">{completeness}%</span>
        </div>
        <div className="w-full bg-slate-200 rounded-full h-4 overflow-hidden">
          <div
            className={`h-4 rounded-full transition-all duration-700 ${progressColor}`}
            style={{ width: `${completeness}%` }}
          />
        </div>
        <p className="text-xs text-slate-400 mt-2">
          {summary.present} of {summary.total_required} required items documented
        </p>
      </div>

      {/* Red Flags */}
      {red_flags.length > 0 && (
        <div className="card p-5 bg-red-50 border border-red-200">
          <h3 className="font-bold text-red-800 mb-3 flex items-center gap-2 text-sm">
            <XCircle className="w-4 h-4" />
            Potential USCIS Concerns — Address Before Filing
          </h3>
          <ul className="space-y-2">
            {red_flags.map((flag, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-red-700">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                {flag}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Priority actions */}
      {priority_actions.length > 0 && (
        <div className="card p-5 bg-amber-50 border border-amber-200">
          <h3 className="font-bold text-amber-800 mb-3 flex items-center gap-2 text-sm">
            <AlertTriangle className="w-4 h-4" />
            Priority Actions Required
          </h3>
          <ol className="space-y-2">
            {priority_actions.map((action, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-slate-700">
                <span className="w-6 h-6 bg-amber-200 text-amber-800 rounded-full
                                 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                  {i + 1}
                </span>
                {action}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Checklist sections */}
      {sections.map(section => (
        <SectionCard key={section.section_id} section={section} />
      ))}

      {/* Strengths */}
      {strengths.length > 0 && (
        <div className="card p-5 bg-success-50 border border-success-200">
          <h3 className="font-bold text-success-600 mb-3 flex items-center gap-2 text-sm">
            <CheckCircle2 className="w-4 h-4" />
            Case Strengths
          </h3>
          <ul className="space-y-2">
            {strengths.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <CheckCircle2 className="w-4 h-4 text-success-500 shrink-0 mt-0.5" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SectionCard({ section }: { section: GapAnalysis["analysis"]["sections"][0] }) {
  const [expanded, setExpanded] = useState(true);
  const missing  = section.items.filter(i => i.status === "missing").length;
  const present  = section.items.filter(i => i.status === "present").length;
  const uncertain = section.items.filter(i => i.status === "uncertain").length;

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full px-5 py-4 flex items-center justify-between bg-slate-50
                   hover:bg-slate-100 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {expanded
            ? <ChevronDown className="w-4 h-4 text-slate-400" />
            : <ChevronRight className="w-4 h-4 text-slate-400" />
          }
          <span className="font-bold text-slate-800 text-sm">{section.section_label}</span>
        </div>
        <div className="flex items-center gap-2">
          {present   > 0 && <span className="badge badge-present">{present} present</span>}
          {uncertain > 0 && <span className="badge badge-uncertain">{uncertain} uncertain</span>}
          {missing   > 0 && <span className="badge badge-missing">{missing} missing</span>}
        </div>
      </button>

      {expanded && (
        <div className="divide-y divide-slate-100">
          {section.items.map(item => (
            <div key={item.item_id} className="px-5 py-3.5 flex items-start gap-3">
              <StatusIcon status={item.status} />
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                {item.notes && (
                  <p className="text-xs text-slate-500 mt-0.5">{item.notes}</p>
                )}
                {item.covered_by?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {item.covered_by.map(f => (
                      <span key={f}
                        className="text-xs bg-slate-100 text-slate-600 border border-slate-200 px-2 py-0.5 rounded-full font-mono">
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
  if (status === "present")   return <CheckCircle2  className="w-4 h-4 text-success-500 shrink-0 mt-0.5" />;
  if (status === "missing")   return <XCircle        className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />;
  if (status === "uncertain") return <AlertTriangle  className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />;
  return                             <MinusCircle    className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />;
}
