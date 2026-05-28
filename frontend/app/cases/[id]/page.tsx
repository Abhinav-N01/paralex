"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Scale, ChevronLeft, FileText, MessageSquare,
  ClipboardCheck, FileEdit, Globe, DollarSign, Building2, User
} from "lucide-react";
import { casesApi, type Case } from "@/lib/api";
import { DocumentsTab } from "@/components/case/DocumentsTab";
import { ChatTab } from "@/components/chat/ChatTab";
import { GapAnalysisTab } from "@/components/analysis/GapAnalysisTab";
import { MemosTab } from "@/components/memo/MemosTab";

type Tab = "documents" | "chat" | "analysis" | "memos";

const TABS = [
  { id: "documents" as Tab, label: "Documents",     icon: FileText,       desc: "Upload & manage client documents" },
  { id: "chat"      as Tab, label: "Q&A Chat",      icon: MessageSquare,  desc: "Ask questions grounded in docs" },
  { id: "analysis"  as Tab, label: "Gap Analysis",  icon: ClipboardCheck, desc: "USCIS checklist completeness" },
  { id: "memos"     as Tab, label: "SOF Memo",       icon: FileEdit,       desc: "Auto-draft Source of Funds memo" },
];

export default function CasePage() {
  const params   = useParams();
  const router   = useRouter();
  const caseId   = params.id as string;

  const [caseData, setCaseData] = useState<Case | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("documents");
  const [loading, setLoading]     = useState(true);

  useEffect(() => { loadCase(); }, [caseId]);

  async function loadCase() {
    try {
      const data = await casesApi.get(caseId);
      setCaseData(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <Scale className="w-6 h-6 animate-pulse" />
          <span className="text-sm">Loading case...</span>
        </div>
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center card p-10">
          <p className="text-slate-500 mb-4">Case not found</p>
          <Link href="/" className="btn-primary">Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  const StatusDot = () => {
    const colors: Record<string, string> = {
      active: "bg-success-500", under_review: "bg-blue-500",
      submitted: "bg-purple-500", approved: "bg-green-600", denied: "bg-red-500",
    };
    return (
      <span className={`w-2 h-2 rounded-full ${colors[caseData.status] || "bg-slate-400"} inline-block`} />
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* ── Sticky Header ──────────────────────────────────────── */}
      <header className="bg-brand-900 text-white sticky top-0 z-30 shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 mb-3 text-sm">
            <Link href="/" className="flex items-center gap-1.5 text-blue-300 hover:text-white transition-colors">
              <ChevronLeft className="w-4 h-4" />
              <span className="text-xs">Dashboard</span>
            </Link>
            <span className="text-blue-700 text-xs">/</span>

            {/* Client identity */}
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-gold-500 rounded-lg flex items-center justify-center">
                <User className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-sm font-bold leading-tight">{caseData.client_name}</h1>
                {caseData.case_reference && (
                  <p className="text-xs text-blue-300 font-mono">{caseData.case_reference}</p>
                )}
              </div>
              <div className="flex items-center gap-1 ml-2">
                <StatusDot />
                <span className="text-xs text-blue-300 capitalize">{caseData.status.replace("_", " ")}</span>
              </div>
            </div>
          </div>

          {/* Case meta pills */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {caseData.country_of_origin && (
              <div className="flex items-center gap-1.5 bg-white/10 border border-white/20 rounded-full px-3 py-1 text-xs text-blue-100">
                <Globe className="w-3 h-3" />
                {caseData.country_of_origin}
              </div>
            )}
            {caseData.investment_amount && (
              <div className="flex items-center gap-1.5 bg-gold-500/20 border border-gold-400/30 rounded-full px-3 py-1 text-xs text-yellow-200">
                <DollarSign className="w-3 h-3" />
                ${caseData.investment_amount.toLocaleString()} {caseData.is_tea ? "· TEA" : "· Standard"}
              </div>
            )}
            {caseData.regional_center && (
              <div className="flex items-center gap-1.5 bg-white/10 border border-white/20 rounded-full px-3 py-1 text-xs text-blue-100">
                <Building2 className="w-3 h-3" />
                {caseData.regional_center}
              </div>
            )}
            {caseData.attorney_name && (
              <div className="flex items-center gap-1.5 bg-white/10 border border-white/20 rounded-full px-3 py-1 text-xs text-blue-100">
                <Scale className="w-3 h-3" />
                {caseData.attorney_name}
              </div>
            )}
            <div className="flex items-center gap-1.5 bg-white/10 border border-white/20 rounded-full px-3 py-1 text-xs text-blue-100">
              <FileText className="w-3 h-3" />
              {caseData.document_count} documents
            </div>
          </div>

          {/* Tab navigation */}
          <div className="flex gap-1">
            {TABS.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-t-lg text-sm font-semibold transition-all
                    ${isActive
                      ? "bg-slate-50 text-brand-700 shadow-sm"
                      : "text-blue-300 hover:text-white hover:bg-brand-800"
                    }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* ── Tab Content ──────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-6">
        {activeTab === "documents" && <DocumentsTab caseId={caseId} onUpdate={loadCase} />}
        {activeTab === "chat"      && <ChatTab caseId={caseId} caseName={caseData.client_name} />}
        {activeTab === "analysis"  && <GapAnalysisTab caseId={caseId} />}
        {activeTab === "memos"     && <MemosTab caseId={caseId} caseName={caseData.client_name} />}
      </main>
    </div>
  );
}
