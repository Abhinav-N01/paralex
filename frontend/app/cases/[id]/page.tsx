"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Scale, ChevronLeft, FileText, MessageSquare,
  ClipboardCheck, FileEdit, UploadCloud, Settings
} from "lucide-react";
import { casesApi, type Case } from "@/lib/api";
import { DocumentsTab } from "@/components/case/DocumentsTab";
import { ChatTab } from "@/components/chat/ChatTab";
import { GapAnalysisTab } from "@/components/analysis/GapAnalysisTab";
import { MemosTab } from "@/components/memo/MemosTab";

type Tab = "documents" | "chat" | "analysis" | "memos";

export default function CasePage() {
  const params = useParams();
  const router = useRouter();
  const caseId = params.id as string;

  const [caseData, setCaseData] = useState<Case | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("documents");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCase();
  }, [caseId]);

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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400">Loading case...</div>
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">Case not found</p>
          <Link href="/" className="btn-primary">Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: "documents" as Tab, label: "Documents", icon: <FileText className="w-4 h-4" /> },
    { id: "chat" as Tab, label: "Q&A Chat", icon: <MessageSquare className="w-4 h-4" /> },
    { id: "analysis" as Tab, label: "Gap Analysis", icon: <ClipboardCheck className="w-4 h-4" /> },
    { id: "memos" as Tab, label: "Memos", icon: <FileEdit className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-brand-900 text-white sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4 mb-3">
            <Link href="/" className="flex items-center gap-1.5 text-blue-300 hover:text-white text-sm transition-colors">
              <ChevronLeft className="w-4 h-4" />
              Dashboard
            </Link>
            <span className="text-blue-700">/</span>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-gold-500 rounded-md flex items-center justify-center">
                <Scale className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-base font-bold leading-tight">{caseData.client_name}</h1>
                {caseData.case_reference && (
                  <p className="text-xs text-blue-300 font-mono">{caseData.case_reference}</p>
                )}
              </div>
            </div>
          </div>

          {/* Case meta */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-blue-300 mb-3">
            {caseData.country_of_origin && <span>🌍 {caseData.country_of_origin}</span>}
            {caseData.investment_amount && (
              <span>💰 ${caseData.investment_amount.toLocaleString()} {caseData.is_tea ? "(TEA)" : ""}</span>
            )}
            {caseData.regional_center && <span>🏢 {caseData.regional_center}</span>}
            {caseData.attorney_name && <span>⚖️ {caseData.attorney_name}</span>}
            <span>📄 {caseData.document_count} documents</span>
          </div>

          {/* Tabs */}
          <div className="flex gap-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors
                  ${activeTab === tab.id
                    ? "bg-gray-50 text-brand-700"
                    : "text-blue-300 hover:text-white hover:bg-brand-800"
                  }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Tab Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-6">
        {activeTab === "documents" && (
          <DocumentsTab caseId={caseId} onUpdate={loadCase} />
        )}
        {activeTab === "chat" && (
          <ChatTab caseId={caseId} caseName={caseData.client_name} />
        )}
        {activeTab === "analysis" && (
          <GapAnalysisTab caseId={caseId} />
        )}
        {activeTab === "memos" && (
          <MemosTab caseId={caseId} caseName={caseData.client_name} />
        )}
      </main>
    </div>
  );
}
