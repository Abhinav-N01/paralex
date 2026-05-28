"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Plus, FileText, Users, Scale, ArrowRight,
  FolderOpen, Clock, CheckCircle2, AlertCircle
} from "lucide-react";
import { casesApi, type Case } from "@/lib/api";
import { NewCaseModal } from "@/components/case/NewCaseModal";
import { CaseCard } from "@/components/case/CaseCard";

export default function Dashboard() {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewCase, setShowNewCase] = useState(false);

  useEffect(() => { loadCases(); }, []);

  async function loadCases() {
    try {
      const data = await casesApi.list();
      setCases(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const activeCases   = cases.filter(c => c.status === "active" || c.status === "under_review");
  const totalDocs     = cases.reduce((sum, c) => sum + c.document_count, 0);
  const submittedCases = cases.filter(c => c.status === "submitted" || c.status === "approved");

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Top Nav ──────────────────────────────────────────── */}
      <header className="bg-brand-900 text-white border-b border-brand-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gold-500 rounded-lg flex items-center justify-center shadow-sm">
              <Scale className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight">ParaLex</span>
              <span className="ml-2 text-xs text-blue-300 font-medium bg-blue-900/40 px-2 py-0.5 rounded-full">
                EB-5 Paralegal Platform
              </span>
            </div>
          </div>
          <button
            onClick={() => setShowNewCase(true)}
            className="btn-gold"
          >
            <Plus className="w-4 h-4" />
            New Case
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* ── Welcome Banner ───────────────────────────────────── */}
        <div className="bg-gradient-to-r from-brand-900 to-brand-700 rounded-2xl p-6 mb-8 text-white flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-1">EB-5 Case Management</h1>
            <p className="text-blue-200 text-sm max-w-lg">
              Upload client documents, run gap analysis against the USCIS checklist,
              ask questions grounded in the documents, and auto-draft Source of Funds memos.
            </p>
          </div>
          <div className="hidden md:flex flex-col items-end gap-1 text-right shrink-0 ml-8">
            <p className="text-xs text-blue-300 font-medium">Typical EB-5 Document Set</p>
            <div className="flex flex-wrap justify-end gap-1.5 max-w-xs">
              {["Passport","I-94","H-1B/I-797","Bank Stmts","W-2/Tax Returns","Wire Transfers","Pay Stubs","401(k)"].map(t => (
                <span key={t} className="text-xs bg-white/10 border border-white/20 px-2 py-0.5 rounded-full text-blue-100">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── Stats Row ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard icon={<Users className="w-5 h-5 text-brand-600" />}
            label="Total Cases" value={cases.length} sub="all time" color="bg-brand-50" />
          <StatCard icon={<Clock className="w-5 h-5 text-amber-600" />}
            label="Active" value={activeCases.length} sub="in progress" color="bg-amber-50" />
          <StatCard icon={<FileText className="w-5 h-5 text-blue-600" />}
            label="Documents" value={totalDocs} sub="indexed" color="bg-blue-50" />
          <StatCard icon={<CheckCircle2 className="w-5 h-5 text-success-600" />}
            label="Filed/Approved" value={submittedCases.length} sub="cases" color="bg-success-50" />
        </div>

        {/* ── Cases Grid ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-5">
          <div className="section-header mb-0 flex-1">
            <FolderOpen className="w-5 h-5 text-brand-600" />
            <h2 className="text-lg font-bold text-slate-900">All Cases</h2>
            <div className="section-line" />
            <span className="text-sm text-slate-400 shrink-0">{cases.length} cases</span>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="card p-6 animate-pulse">
                <div className="h-4 bg-slate-200 rounded w-3/4 mb-3" />
                <div className="h-3 bg-slate-100 rounded w-1/2 mb-2" />
                <div className="h-3 bg-slate-100 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : cases.length === 0 ? (
          <EmptyState onNew={() => setShowNewCase(true)} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {cases.map(c => (
              <CaseCard key={c.id} case={c} />
            ))}
          </div>
        )}
      </main>

      {showNewCase && (
        <NewCaseModal
          onClose={() => setShowNewCase(false)}
          onCreated={(newCase) => {
            setCases(prev => [newCase, ...prev]);
            setShowNewCase(false);
          }}
        />
      )}
    </div>
  );
}

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: number; sub: string; color: string;
}) {
  return (
    <div className="card p-5 flex items-center gap-4">
      <div className={`w-11 h-11 ${color} rounded-xl flex items-center justify-center shrink-0`}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-slate-500 font-medium">{label}</p>
        <p className="text-2xl font-bold text-slate-900 leading-tight">{value}</p>
        <p className="text-xs text-slate-400">{sub}</p>
      </div>
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="card p-16 text-center">
      <div className="w-16 h-16 bg-brand-50 rounded-2xl flex items-center justify-center mx-auto mb-5">
        <Scale className="w-8 h-8 text-brand-400" />
      </div>
      <h3 className="text-xl font-bold text-slate-700 mb-2">No cases yet</h3>
      <p className="text-slate-500 text-sm mb-2 max-w-sm mx-auto">
        Create your first EB-5 case to start uploading client documents.
      </p>
      <p className="text-slate-400 text-xs mb-8 max-w-sm mx-auto">
        Typical clients: Indian nationals on H-1B visa investing in a USCIS-approved regional center.
        Upload passport, I-94, I-797, 7 years of bank statements, W-2s (5 yrs), tax returns, wire transfers, and more.
      </p>
      <button onClick={onNew} className="btn-primary mx-auto">
        <Plus className="w-4 h-4" />
        Create First Case
      </button>
    </div>
  );
}
