"use client";

import { useEffect, useRef, useState } from "react";
import {
  Send, MessageSquare, Loader2, AlertCircle,
  BookOpen, ChevronDown, ChevronRight, FileText, Sparkles
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { chatApi, type ChatMessage, type Citation, categoryLabel } from "@/lib/api";

interface Props {
  caseId: string;
  caseName: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  retrieved_chunks?: number;
  has_relevant_content?: boolean;
  streaming?: boolean;
}

const SUGGESTED_QUESTIONS = [
  { q: "What is the total balance across all bank accounts?", tag: "Bank" },
  { q: "Summarize the client's employment history and salary income.", tag: "Income" },
  { q: "What wire transfers were made and are they documented?", tag: "Wires" },
  { q: "What income is reported on the tax returns across all years provided?", tag: "Taxes" },
  { q: "What are the 401(k) or retirement account balances and any rollover details?", tag: "401k" },
  { q: "Is there documentation of how the investment funds were accumulated?", tag: "SOF" },
  { q: "What stock or brokerage accounts are in the client's name?", tag: "Stocks" },
  { q: "Are there any large unexplained deposits or transfers?", tag: "Red Flags" },
];

export function ChatTab({ caseId, caseName }: Props) {
  const [messages,   setMessages]   = useState<Message[]>([]);
  const [input,      setInput]      = useState("");
  const [loading,    setLoading]    = useState(false);
  const [sessionId,  setSessionId]  = useState<string | undefined>();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(question?: string) {
    const q = question || input.trim();
    if (!q || loading) return;

    setInput("");
    setLoading(true);

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: q };
    setMessages(prev => [...prev, userMsg]);

    const assistantId = (Date.now() + 1).toString();
    setMessages(prev => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", streaming: true },
    ]);

    try {
      const res = await fetch(`/api/v1/cases/${caseId}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, session_id: sessionId }),
      });

      const reader  = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let citations: Citation[] = [];
      let hasRelevantContent = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter(l => l.startsWith("data: "));

        for (const line of lines) {
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "metadata") {
              citations = parsed.citations || [];
              hasRelevantContent = parsed.has_relevant_content;
            } else if (parsed.type === "text") {
              fullText += parsed.text;
              setMessages(prev =>
                prev.map(m => m.id === assistantId ? { ...m, content: fullText } : m)
              );
            }
          } catch {}
        }
      }

      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, content: fullText, citations, has_relevant_content: hasRelevantContent, streaming: false }
            : m
        )
      );
    } catch (err: any) {
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, content: `Error: ${err.message}. Please try again.`, streaming: false }
            : m
        )
      );
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-220px)] min-h-[500px]">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1 pb-2">
        {messages.length === 0 ? (
          <WelcomeScreen caseName={caseName} onQuestion={sendMessage} />
        ) : (
          messages.map(msg => <ChatBubble key={msg.id} message={msg} />)
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="mt-3 card p-3 shadow-sm">
        <div className="flex gap-3 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about the documents… (Enter to send)"
            className="flex-1 resize-none text-sm text-slate-800 placeholder-slate-400
                       outline-none bg-transparent min-h-[44px] max-h-32"
            rows={1}
            disabled={loading}
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            className="flex-shrink-0 w-10 h-10 bg-brand-600 text-white rounded-xl
                       flex items-center justify-center hover:bg-brand-700
                       disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {loading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Send className="w-4 h-4" />
            }
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-2 px-1 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-success-500 rounded-full" />
          Every answer is grounded in uploaded documents only — no hallucination.
        </p>
      </div>
    </div>
  );
}

function WelcomeScreen({ caseName, onQuestion }: { caseName: string; onQuestion: (q: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-8">
      <div className="w-16 h-16 bg-brand-50 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
        <Sparkles className="w-8 h-8 text-brand-600" />
      </div>
      <h3 className="text-xl font-bold text-slate-800 mb-2">
        Document Q&A — {caseName}
      </h3>
      <p className="text-sm text-slate-500 max-w-md mb-2">
        Ask any question about the case documents.
        Every answer is cited to the exact document and page number.
      </p>
      <p className="text-xs text-slate-400 mb-8 max-w-sm">
        No hallucination — if the answer isn't in the documents, I'll tell you exactly what's missing.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
        {SUGGESTED_QUESTIONS.map(({ q, tag }) => (
          <button
            key={q}
            onClick={() => onQuestion(q)}
            className="text-left p-3.5 bg-white hover:bg-brand-50 border border-slate-200
                       hover:border-brand-300 rounded-xl transition-all group text-sm"
          >
            <span className="inline-block text-xs font-bold text-brand-600 bg-brand-50
                             border border-brand-100 px-2 py-0.5 rounded-full mb-1.5 group-hover:bg-brand-100">
              {tag}
            </span>
            <p className="text-slate-700 group-hover:text-brand-800 leading-snug">{q}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatBubble({ message }: { message: Message }) {
  const [showCitations, setShowCitations] = useState(false);

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-2xl bg-brand-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm shadow-sm">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 bg-brand-100 rounded-xl flex items-center justify-center shrink-0 mt-1">
        <Sparkles className="w-4 h-4 text-brand-700" />
      </div>
      <div className="flex-1 max-w-3xl space-y-2">
        {/* Answer card */}
        <div className="card px-5 py-4 shadow-sm">
          {message.has_relevant_content === false && !message.streaming && (
            <div className="flex items-center gap-2 text-amber-700 text-sm mb-3 p-2.5 bg-amber-50
                            border border-amber-200 rounded-lg">
              <AlertCircle className="w-4 h-4 shrink-0" />
              No relevant content found for this query in the uploaded documents.
            </div>
          )}
          <div className={`prose-legal text-sm ${message.streaming && !message.content ? "cursor-blink" : ""}`}>
            {message.content ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content + (message.streaming ? "▋" : "")}
              </ReactMarkdown>
            ) : message.streaming ? (
              <span className="text-slate-400 text-xs">Searching documents...</span>
            ) : null}
          </div>
        </div>

        {/* Citations */}
        {message.citations && message.citations.length > 0 && !message.streaming && (
          <div>
            <button
              onClick={() => setShowCitations(v => !v)}
              className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-semibold"
            >
              <BookOpen className="w-3.5 h-3.5" />
              {message.citations.length} source{message.citations.length !== 1 ? "s" : ""} cited
              {showCitations
                ? <ChevronDown className="w-3 h-3" />
                : <ChevronRight className="w-3 h-3" />}
            </button>

            {showCitations && (
              <div className="mt-2 space-y-2">
                {message.citations.map((c, i) => (
                  <div key={i} className="citation-card">
                    <div className="flex items-center gap-2 mb-1.5">
                      <FileText className="w-3.5 h-3.5 text-brand-600" />
                      <span className="font-semibold text-brand-800 text-xs">{c.filename}</span>
                      <span className="text-slate-400 text-xs">page {c.page_number}</span>
                      <span className="badge badge-category ml-auto">{categoryLabel(c.category)}</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed italic">"{c.excerpt}"</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {message.retrieved_chunks !== undefined && message.retrieved_chunks > 0 && !message.streaming && (
          <p className="text-xs text-slate-400">
            Retrieved {message.retrieved_chunks} relevant passage{message.retrieved_chunks !== 1 ? "s" : ""} from documents
          </p>
        )}
      </div>
    </div>
  );
}
