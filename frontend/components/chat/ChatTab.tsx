"use client";

import { useEffect, useRef, useState } from "react";
import {
  Send, MessageSquare, Loader2, AlertCircle,
  BookOpen, ChevronDown, ChevronRight, FileText
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
  "What is the total amount in the bank accounts?",
  "Summarize the source of funds for this case.",
  "What wire transfers were made and when?",
  "What income is documented in the tax returns?",
  "Are there any discrepancies between the bank statements?",
  "What are the 401(k) or retirement account details?",
];

export function ChatTab({ caseId, caseName }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(question?: string) {
    const q = question || input.trim();
    if (!q || loading) return;

    setInput("");
    setLoading(true);

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: q,
    };
    setMessages(prev => [...prev, userMsg]);

    // Add streaming assistant placeholder
    const assistantId = (Date.now() + 1).toString();
    setMessages(prev => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", streaming: true },
    ]);

    try {
      // Use streaming endpoint
      const res = await fetch(`/api/v1/cases/${caseId}/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, session_id: sessionId }),
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let citations: Citation[] = [];
      let hasRelevantContent = false;
      let newSessionId = sessionId;

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
                prev.map(m =>
                  m.id === assistantId
                    ? { ...m, content: fullText }
                    : m
                )
              );
            }
          } catch {}
        }
      }

      // Finalize
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? {
                ...m,
                content: fullText,
                citations,
                has_relevant_content: hasRelevantContent,
                streaming: false,
              }
            : m
        )
      );

    } catch (err: any) {
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? {
                ...m,
                content: `Error: ${err.message}. Please try again.`,
                streaming: false,
              }
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
    <div className="flex flex-col h-[calc(100vh-200px)] min-h-[500px]">
      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-14 h-14 bg-brand-50 rounded-2xl flex items-center justify-center mb-4">
              <MessageSquare className="w-7 h-7 text-brand-600" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">
              Ask anything about {caseName}'s documents
            </h3>
            <p className="text-sm text-gray-500 max-w-md mb-8">
              Every answer is grounded in the uploaded documents only.
              No hallucination — if it's not in the docs, I'll say so.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-xl">
              {SUGGESTED_QUESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="text-left p-3 text-sm text-brand-700 bg-brand-50 hover:bg-brand-100
                             border border-brand-200 rounded-xl transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map(msg => (
            <ChatBubble key={msg.id} message={msg} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="mt-4 card p-3">
        <div className="flex gap-3 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about the case documents... (Enter to send, Shift+Enter for newline)"
            className="flex-1 resize-none text-sm text-gray-800 placeholder-gray-400 outline-none bg-transparent min-h-[44px] max-h-32"
            rows={1}
            disabled={loading}
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            className="flex-shrink-0 w-10 h-10 bg-brand-600 text-white rounded-xl
                       flex items-center justify-center hover:bg-brand-700
                       disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2 px-1">
          🔒 Answers are grounded in uploaded documents only. All data stays local.
        </p>
      </div>
    </div>
  );
}

function ChatBubble({ message }: { message: Message }) {
  const [showCitations, setShowCitations] = useState(false);

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-2xl bg-brand-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 bg-brand-50 rounded-xl flex items-center justify-center shrink-0 mt-1">
        <MessageSquare className="w-4 h-4 text-brand-600" />
      </div>
      <div className="flex-1 max-w-3xl space-y-2">
        {/* Answer */}
        <div className="card px-5 py-4">
          {message.has_relevant_content === false && !message.streaming && (
            <div className="flex items-center gap-2 text-amber-600 text-sm mb-3 p-2 bg-amber-50 rounded-lg">
              <AlertCircle className="w-4 h-4" />
              No relevant documents found for this query.
            </div>
          )}

          <div className={`prose-legal text-sm ${message.streaming && !message.content ? "cursor-blink" : ""}`}>
            {message.content ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content + (message.streaming ? "▋" : "")}
              </ReactMarkdown>
            ) : message.streaming ? (
              <span className="text-gray-400">Searching documents...</span>
            ) : null}
          </div>
        </div>

        {/* Citations */}
        {message.citations && message.citations.length > 0 && !message.streaming && (
          <div>
            <button
              onClick={() => setShowCitations(v => !v)}
              className="flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium"
            >
              <BookOpen className="w-3.5 h-3.5" />
              {message.citations.length} source{message.citations.length !== 1 ? "s" : ""} cited
              {showCitations ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            </button>

            {showCitations && (
              <div className="mt-2 space-y-2">
                {message.citations.map((c, i) => (
                  <div key={i} className="citation-card">
                    <div className="flex items-center gap-2 mb-1">
                      <FileText className="w-3.5 h-3.5 text-blue-600" />
                      <span className="font-medium text-blue-800 text-xs">{c.filename}</span>
                      <span className="text-blue-500 text-xs">p.{c.page_number}</span>
                      <span className="badge badge-category ml-auto">{categoryLabel(c.category)}</span>
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed italic">
                      "{c.excerpt}"
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Chunk count */}
        {message.retrieved_chunks !== undefined && message.retrieved_chunks > 0 && !message.streaming && (
          <p className="text-xs text-gray-400">
            Retrieved {message.retrieved_chunks} relevant passage{message.retrieved_chunks !== 1 ? "s" : ""} from documents
          </p>
        )}
      </div>
    </div>
  );
}
