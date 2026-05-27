"use client";

import Link from "next/link";
import { FileText, Globe, DollarSign, ArrowRight, Clock } from "lucide-react";
import { type Case } from "@/lib/api";
import { formatDistanceToNow } from "date-fns";

interface Props {
  case: Case;
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-success-50 text-success-600",
  under_review: "bg-blue-50 text-blue-600",
  submitted: "bg-purple-50 text-purple-600",
  approved: "bg-green-100 text-green-700",
  denied: "bg-danger-50 text-danger-600",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  under_review: "Under Review",
  submitted: "Submitted",
  approved: "Approved",
  denied: "Denied",
};

export function CaseCard({ case: c }: Props) {
  return (
    <Link href={`/cases/${c.id}`}>
      <div className="card p-5 hover:shadow-md hover:border-brand-200 transition-all cursor-pointer group">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-semibold text-gray-900 group-hover:text-brand-700 transition-colors">
              {c.client_name}
            </h3>
            {c.case_reference && (
              <p className="text-xs text-gray-400 font-mono mt-0.5">{c.case_reference}</p>
            )}
          </div>
          <span className={`badge ${STATUS_STYLES[c.status] || "bg-gray-100 text-gray-600"}`}>
            {STATUS_LABELS[c.status] || c.status}
          </span>
        </div>

        {/* Details */}
        <div className="space-y-1.5 mb-4">
          {c.country_of_origin && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Globe className="w-3.5 h-3.5 text-gray-400" />
              {c.country_of_origin}
            </div>
          )}
          {c.investment_amount && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <DollarSign className="w-3.5 h-3.5 text-gray-400" />
              ${c.investment_amount.toLocaleString()} {c.is_tea ? "(TEA)" : "(Standard)"}
            </div>
          )}
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <FileText className="w-3.5 h-3.5 text-gray-400" />
            {c.document_count} document{c.document_count !== 1 ? "s" : ""}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <Clock className="w-3 h-3" />
            {formatDistanceToNow(new Date(c.updated_at), { addSuffix: true })}
          </div>
          <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-brand-600 group-hover:translate-x-0.5 transition-all" />
        </div>
      </div>
    </Link>
  );
}
