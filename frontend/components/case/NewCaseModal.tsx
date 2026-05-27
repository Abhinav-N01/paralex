"use client";

import { useState } from "react";
import { X, Scale } from "lucide-react";
import { casesApi, type Case, type CaseCreate } from "@/lib/api";

interface Props {
  onClose: () => void;
  onCreated: (c: Case) => void;
}

export function NewCaseModal({ onClose, onCreated }: Props) {
  const [form, setForm] = useState<CaseCreate>({
    client_name: "",
    is_tea: true,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.client_name.trim()) {
      setError("Client name is required.");
      return;
    }
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center">
              <Scale className="w-4 h-4 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">New EB-5 Case</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-danger-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Client Name *</label>
              <input
                type="text"
                value={form.client_name}
                onChange={e => setForm(f => ({ ...f, client_name: e.target.value }))}
                placeholder="e.g. John & Jane Doe"
                className="input"
                required
              />
            </div>

            <div>
              <label className="label">Client Email</label>
              <input
                type="email"
                value={form.client_email || ""}
                onChange={e => setForm(f => ({ ...f, client_email: e.target.value }))}
                placeholder="client@email.com"
                className="input"
              />
            </div>

            <div>
              <label className="label">Country of Origin</label>
              <input
                type="text"
                value={form.country_of_origin || ""}
                onChange={e => setForm(f => ({ ...f, country_of_origin: e.target.value }))}
                placeholder="e.g. China, India, Brazil"
                className="input"
              />
            </div>

            <div>
              <label className="label">Investment Amount (USD)</label>
              <input
                type="number"
                value={form.investment_amount || ""}
                onChange={e => setForm(f => ({ ...f, investment_amount: parseFloat(e.target.value) || undefined }))}
                placeholder="800000"
                className="input"
                min={0}
              />
            </div>

            <div>
              <label className="label">Project Type</label>
              <select
                value={form.is_tea ? "tea" : "standard"}
                onChange={e => setForm(f => ({ ...f, is_tea: e.target.value === "tea" }))}
                className="input"
              >
                <option value="tea">TEA ($800K minimum)</option>
                <option value="standard">Standard ($1.05M minimum)</option>
              </select>
            </div>

            <div className="col-span-2">
              <label className="label">Regional Center</label>
              <input
                type="text"
                value={form.regional_center || ""}
                onChange={e => setForm(f => ({ ...f, regional_center: e.target.value }))}
                placeholder="e.g. USCIS-approved RC name"
                className="input"
              />
            </div>

            <div className="col-span-2">
              <label className="label">Handling Attorney</label>
              <input
                type="text"
                value={form.attorney_name || ""}
                onChange={e => setForm(f => ({ ...f, attorney_name: e.target.value }))}
                placeholder="Attorney name"
                className="input"
              />
            </div>

            <div className="col-span-2">
              <label className="label">Notes</label>
              <textarea
                value={form.notes || ""}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Any initial case notes..."
                className="input resize-none"
                rows={3}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
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
