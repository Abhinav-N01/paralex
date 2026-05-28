"use client";

import { useState } from "react";
import { X, Scale, User, Globe, DollarSign, Building2, FileText } from "lucide-react";
import { casesApi, type Case, type CaseCreate } from "@/lib/api";

interface Props {
  onClose: () => void;
  onCreated: (c: Case) => void;
}

const COMMON_COUNTRIES = [
  "India", "China", "Vietnam", "Taiwan", "South Korea",
  "Brazil", "Mexico", "Philippines", "Pakistan", "Nigeria",
];

export function NewCaseModal({ onClose, onCreated }: Props) {
  const [form, setForm] = useState<CaseCreate>({
    client_name: "",
    is_tea: true,
    country_of_origin: "India",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState("");

  function set(key: keyof CaseCreate, val: any) {
    setForm(f => ({ ...f, [key]: val }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.client_name.trim()) { setError("Client name is required."); return; }
    setLoading(true);
    setError("");
    try {
      const newCase = await casesApi.create(form);
      onCreated(newCase);
    } catch (err: any) {
      setError(err.message || "Failed to create case.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl animate-slide-up max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white flex items-center justify-between px-6 py-5 border-b rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-brand-600 rounded-xl flex items-center justify-center">
              <Scale className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">New EB-5 Case</h2>
              <p className="text-xs text-slate-500">I-526E Petition Preparation</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-danger-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Section: Client Identity */}
          <div>
            <p className="flex items-center gap-2 text-xs font-bold text-brand-700 uppercase tracking-widest mb-3">
              <User className="w-3.5 h-3.5" /> Client Information
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="label">Full Legal Name (as on Passport) *</label>
                <input type="text" value={form.client_name}
                  onChange={e => set("client_name", e.target.value)}
                  placeholder="e.g. Rajesh Kumar Sharma"
                  className="input" required />
              </div>
              <div>
                <label className="label">Email</label>
                <input type="email" value={form.client_email || ""}
                  onChange={e => set("client_email", e.target.value)}
                  placeholder="client@email.com" className="input" />
              </div>
              <div>
                <label className="label">Country of Origin</label>
                <select value={form.country_of_origin || "India"}
                  onChange={e => set("country_of_origin", e.target.value)}
                  className="input">
                  {COMMON_COUNTRIES.map(c => <option key={c}>{c}</option>)}
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section: Investment Details */}
          <div>
            <p className="flex items-center gap-2 text-xs font-bold text-brand-700 uppercase tracking-widest mb-3">
              <DollarSign className="w-3.5 h-3.5" /> Investment Details
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Investment Amount (USD)</label>
                <input type="number" value={form.investment_amount || ""}
                  onChange={e => set("investment_amount", parseFloat(e.target.value) || undefined)}
                  placeholder="800000" className="input" min={0} />
              </div>
              <div>
                <label className="label">Project Type</label>
                <select value={form.is_tea ? "tea" : "standard"}
                  onChange={e => set("is_tea", e.target.value === "tea")}
                  className="input">
                  <option value="tea">TEA — $800,000 minimum</option>
                  <option value="standard">Standard — $1,050,000 minimum</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="label">Regional Center Name</label>
                <input type="text" value={form.regional_center || ""}
                  onChange={e => set("regional_center", e.target.value)}
                  placeholder="e.g. EB5 Capital, CMB Regional Centers, USCIS-approved RC"
                  className="input" />
              </div>
            </div>
          </div>

          {/* Section: Case Admin */}
          <div>
            <p className="flex items-center gap-2 text-xs font-bold text-brand-700 uppercase tracking-widest mb-3">
              <Building2 className="w-3.5 h-3.5" /> Case Administration
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Handling Attorney</label>
                <input type="text" value={form.attorney_name || ""}
                  onChange={e => set("attorney_name", e.target.value)}
                  placeholder="Attorney full name" className="input" />
              </div>
              <div>
                <label className="label">Case Reference #</label>
                <input type="text" value={form.case_reference || ""}
                  onChange={e => set("case_reference", e.target.value)}
                  placeholder="e.g. EB5-2024-001" className="input" />
              </div>
              <div className="col-span-2">
                <label className="label">Initial Notes</label>
                <textarea value={form.notes || ""}
                  onChange={e => set("notes", e.target.value)}
                  placeholder="e.g. Client on H-1B, investing through savings + 401k rollover..."
                  className="input resize-none" rows={3} />
              </div>
            </div>
          </div>

          {/* Hint about doc types */}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-xs text-amber-800 font-semibold mb-1">📋 Documents to collect for Indian EB-5 investors:</p>
            <p className="text-xs text-amber-700">
              Passport · I-94 printout · H-1B visa stamps · I-797 approval notice ·
              7 years bank statements (US + India, all accounts) · W-2s (5 years) · Tax returns (5 years) ·
              Pay stubs (3 months) · Wire transfer confirmations · 401(k) statements ·
              Stock/brokerage statements · PAN card · Indian ITR / Form 16
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
              {loading ? "Creating..." : "Create Case"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
