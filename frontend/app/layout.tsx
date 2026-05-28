import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ParaLex | EB-5 AI Paralegal Platform",
  description: "Agentic RAG for EB-5 investor visa attorneys — zero hallucination, document-grounded answers and SOF memos",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
