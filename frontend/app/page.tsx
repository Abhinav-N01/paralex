"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, FileText, Users, TrendingUp, Scale, ArrowRight } from "lucide-react";
import { casesApi, type Case } from "@/lib/api";
import { NewCaseModal } from "@/components/case/NewCaseModal";
import { CaseCard } from "@/components/case/CaseCard";

export default function Dashboard() {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewCase, setShowNewCase] = useState(false);

  useEffect(() => {
    loadCases();
  }, []);

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

  const activeCases = cases.filter(c => c.status === "active" || c.status === "under_review");
  const totalDocs = cases.reduce((sum, c) => sum + c.document_count, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-brand-900 text-white">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gold-500 rounded-lg flex items-center justify-center">
              <Scale className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold">ParaLex</h1>
              <p className="text-xs text-blue-300">EB-5 Investor Visa Platform</p>
            </div>
          </div>
          <button
            onClick={() => setShowNewCase(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gold-500 hover:bg-gold-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Case
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <StatCard
            icon={<Users className="w-5 h-5 text-brand-600" />}
            label="Active Cases"
            value={activeCases.length}
            bg="bg-brand-50"
          />
          <StatCard
            icon={<FileText className="w-5 h-5 text-gold-600" />}
            label="Total Documents"
            value={totalDocs}
            bg="bg-amber-50"
          />
          <StatCard
            icon={<TrendingUp className="w-5 h-5 text-success-600" />}
            label="Total Cases"
            value={cases.length}
            bg="bg-success-50"
          />
        </div>

        {/* Cases List */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">All Cases</h2>
          <span className="text-sm text-gray-500">{cases.length} cases</span>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="card p-6 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-3" />
                <div className="h-3 bg-gray-100 rounded w-1/2 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : cases.length === 0 ? (
          <div className="card p-16 text-center">
            <Scale className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">No cases yet</h3>
            <p className="text-gray-500 text-sm mb-6">
              Create your first EB-5 case to start uploading documents
              and generating memos.
            </p>
            <button
              onClick={() => setShowNewCase(true)}
              className="btn-primary mx-auto"
            >
              <Plus className="w-4 h-4" />
              Create First Case
            </button>
          </div>
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

function StatCard({
  icon, label, value, bg
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  bg: string;
}) {
  return (
    <div className="card p-5 flex items-center gap-4">
      <div className={`w-10 h-10 ${bg} rounded-lg flex items-center justify-center`}>
        {icon}
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}
