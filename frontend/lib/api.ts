/**
 * ParaLex — API Client
 * Type-safe wrapper around the FastAPI backend.
 */

const API_BASE = "/api/v1";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface Case {
  id: string;
  client_name: string;
  client_email?: string;
  attorney_name?: string;
  case_reference?: string;
  investment_amount?: number;
  is_tea: boolean;
  regional_center?: string;
  country_of_origin?: string;
  status: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  document_count: number;
}

export interface CaseCreate {
  client_name: string;
  client_email?: string;
  attorney_name?: string;
  case_reference?: string;
  investment_amount?: number;
  is_tea?: boolean;
  regional_center?: string;
  country_of_origin?: string;
  notes?: string;
}

export interface Document {
  id: string;
  case_id: string;
  filename: string;
  original_filename: string;
  file_size?: number;
  mime_type?: string;
  category: string;
  category_confidence?: number;
  document_date?: string;
  description?: string;
  status: "pending" | "processing" | "indexed" | "failed";
  page_count?: number;
  ocr_applied: boolean;
  chunk_count: number;
  extraction_notes?: string;
  created_at: string;
}

export interface Citation {
  doc_id: string;
  filename: string;
  category: string;
  page_number: number;
  excerpt: string;
  score: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  retrieved_chunks?: number;
  created_at: string;
}

export interface ChatResponse {
  session_id: string;
  message_id: string;
  answer: string;
  citations: Citation[];
  retrieved_chunks: number;
  has_relevant_content: boolean;
}

export interface GapAnalysis {
  case_id: string;
  analysis: {
    summary: {
      total_required: number;
      present: number;
      missing: number;
      uncertain: number;
      completeness_pct: number;
    };
    sections: {
      section_id: string;
      section_label: string;
      items: {
        item_id: string;
        label: string;
        status: "present" | "missing" | "uncertain" | "not_applicable";
        covered_by: string[];
        notes: string;
      }[];
    }[];
    priority_actions: string[];
    strengths: string[];
    red_flags: string[];
  };
  documents_analyzed: number;
  generated_at: string;
}

export interface Memo {
  id: string;
  case_id: string;
  memo_type?: string;
  title?: string;
  content?: string;
  citations?: Citation[];
  is_final: boolean;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────────────────────────────────────────
// HTTP helpers
// ─────────────────────────────────────────────────────────────

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `HTTP ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// ─────────────────────────────────────────────────────────────
// Cases API
// ─────────────────────────────────────────────────────────────

export const casesApi = {
  list: () => request<Case[]>("/cases"),
  get: (id: string) => request<Case>(`/cases/${id}`),
  create: (data: CaseCreate) =>
    request<Case>("/cases", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<CaseCreate>) =>
    request<Case>(`/cases/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) =>
    request<void>(`/cases/${id}`, { method: "DELETE" }),
};

// ─────────────────────────────────────────────────────────────
// Documents API
// ─────────────────────────────────────────────────────────────

export const documentsApi = {
  list: (caseId: string, category?: string) =>
    request<Document[]>(
      `/cases/${caseId}/documents${category ? `?category=${category}` : ""}`
    ),
  upload: async (caseId: string, file: File, description?: string): Promise<Document> => {
    const formData = new FormData();
    formData.append("file", file);
    if (description) formData.append("description", description);

    const res = await fetch(`${API_BASE}/cases/${caseId}/documents`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(error.detail || `Upload failed: HTTP ${res.status}`);
    }
    return res.json();
  },
  update: (caseId: string, docId: string, data: { category?: string; description?: string }) =>
    request<Document>(`/cases/${caseId}/documents/${docId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (caseId: string, docId: string) =>
    request<void>(`/cases/${caseId}/documents/${docId}`, { method: "DELETE" }),
  reindex: (caseId: string, docId: string) =>
    request<Document>(`/cases/${caseId}/documents/${docId}/reindex`, { method: "POST" }),
};

// ─────────────────────────────────────────────────────────────
// Chat API
// ─────────────────────────────────────────────────────────────

export const chatApi = {
  ask: (caseId: string, question: string, sessionId?: string) =>
    request<ChatResponse>(`/cases/${caseId}/chat`, {
      method: "POST",
      body: JSON.stringify({ question, session_id: sessionId }),
    }),
  listSessions: (caseId: string) =>
    request<{ id: string; title?: string; created_at: string; message_count: number }[]>(
      `/cases/${caseId}/chat/sessions`
    ),
  getMessages: (caseId: string, sessionId: string) =>
    request<ChatMessage[]>(`/cases/${caseId}/chat/sessions/${sessionId}/messages`),
  deleteSession: (caseId: string, sessionId: string) =>
    request<void>(`/cases/${caseId}/chat/sessions/${sessionId}`, { method: "DELETE" }),
  streamUrl: (caseId: string) => `${API_BASE}/cases/${caseId}/chat/stream`,
};

// ─────────────────────────────────────────────────────────────
// Analysis API
// ─────────────────────────────────────────────────────────────

export const analysisApi = {
  gapAnalysis: (caseId: string) =>
    request<GapAnalysis>(`/cases/${caseId}/analysis/gap-analysis`, { method: "POST" }),
};

// ─────────────────────────────────────────────────────────────
// Memos API
// ─────────────────────────────────────────────────────────────

export const memosApi = {
  list: (caseId: string) => request<Memo[]>(`/cases/${caseId}/memos`),
  get: (caseId: string, memoId: string) => request<Memo>(`/cases/${caseId}/memos/${memoId}`),
  draftSOF: (caseId: string) =>
    request<Memo>(`/cases/${caseId}/memos/source-of-funds`, { method: "POST" }),
  update: (caseId: string, memoId: string, data: { content?: string; title?: string; is_final?: boolean }) =>
    request<Memo>(`/cases/${caseId}/memos/${memoId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  delete: (caseId: string, memoId: string) =>
    request<void>(`/cases/${caseId}/memos/${memoId}`, { method: "DELETE" }),
  exportMarkdownUrl: (caseId: string, memoId: string) =>
    `${API_BASE}/cases/${caseId}/memos/${memoId}/export/markdown`,
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

export function formatFileSize(bytes?: number): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function categoryLabel(cat: string): string {
  const labels: Record<string, string> = {
    passport: "Passport",
    birth_certificate: "Birth Certificate",
    visa_stamps: "Visa Stamps",
    national_id: "National ID",
    tax_return: "Tax Return",
    w2: "W-2",
    pay_stub: "Pay Stub",
    tax_receipt: "Tax Receipt",
    bank_statement: "Bank Statement",
    investment_statement: "Investment Statement",
    stock_statement: "Stock Statement",
    retirement_401k: "401(k) / Retirement",
    property_document: "Property Document",
    wire_transfer: "Wire Transfer",
    gift_letter: "Gift Letter",
    loan_document: "Loan Document",
    business_ownership: "Business Ownership",
    business_financials: "Business Financials",
    prior_memo: "Prior Memo",
    legal_correspondence: "Legal Correspondence",
    other: "Other",
  };
  return labels[cat] || cat;
}

export const DOCUMENT_STATUS_COLORS: Record<string, string> = {
  pending:    "bg-slate-100 text-slate-500",
  processing: "bg-blue-50 text-blue-600",
  indexed:    "bg-success-50 text-success-600",
  failed:     "bg-danger-50 text-danger-600",
};
