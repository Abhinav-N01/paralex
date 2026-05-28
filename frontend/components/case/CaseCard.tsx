"use client";

import Link from "next/link";
import { FileText, Globe, DollarSign, ArrowRight, Clock, User } from "lucide-react";
import { type Case } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";

interface Props { case: Case; }

const STATUS_CONFIG: Record<string, { label: string; classes: string }> = {
  active:       { label: "Active",       classes: "bg-success-50 text-success-600 border-success-200" },
  under_review: { label: "Under Review", classes: "bg-blue-50 text-blue-600 border-blue-200" },
  submitted:    { label: "Submitted",    classes: "bg-purple-50 text-purple-600 border-purple-200" },
  approved:     { label: "Approved",     classes: "bg-green-100 text-green-700 border-green-200" },
  denied:       { label: "Denied",       classes: "bg-danger-50 text-danger-600 border-red-200" },
};

export function CaseCard({ case: c }: Props) {
  const status = STATUS_CONFIG[c.status] || { label: c.status, classes: "bg-slate-100 text-slate-600 border-slate-200" };

  return (
    <Link href={`/cases/${c.id}`}>
      <div className="card-hover p-5 group">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center shrink-0">
              <User className="w-5 h-5 text-brand-600" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 group-hover:text-brand-700 transition-colors truncate">
                {c.client_name}
              </h3>
              {c.case_reference && (
                <p className="text-xs text-slate-400 font-mono">{c.case_reference}</p>
              )}
            </div>
          </div>
          <span className={`badge border shrink-0 ${status.classes}`}>
            {status.label}
          </span>
        </div>

        {/* Details */}
        <div className="space-y-2 mb-4">
          {c.country_of_origin && (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>{c.country_of_origin}</span>
            </div>
          )}
          {c.investment_amount && (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <DollarSign className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="font-semibold">${c.investment_amount.toLocaleString()}</span>
              <span className="text-xs text-slate-400">{c.is_tea ? "TEA" : "Standard"}</span>
            </div>
          )}
          {c.regional_center && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span className="w-3.5 h-3.5 text-center text-slate-400 text-xs">🏢</span>
              <span className="truncate text-xs">{c.regional_center}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <FileText className="w-3 h-3" />
            <span>{c.document_count} doc{c.document_count !== 1 ? "s" : ""}</span>
            <span className="text-slate-300">·</span>
            <Clock className="w-3 h-3" />
            <span>{formatDistanceToNow(new Date(c.updated_at), { addSuffix: true })}</span>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-brand-600 group-hover:translate-x-0.5 transition-all" />
        </div>
      </div>
    </Link>
  );
}
