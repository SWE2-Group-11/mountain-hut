import React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';

// The menu is Markdown. Raw HTML is never rendered, and links are shown as plain text.
const components: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-5 mb-2 last:mb-0 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 last:mb-0 space-y-0.5">{children}</ol>,
  strong: ({ children }) => <strong className="font-bold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  h1: ({ children }) => <p className="font-bold mb-1">{children}</p>,
  h2: ({ children }) => <p className="font-bold mb-1">{children}</p>,
  h3: ({ children }) => <p className="font-bold mb-1">{children}</p>,
  a: ({ children }) => <span>{children}</span>,
};

export const MenuText: React.FC<{ text: string; className?: string }> = ({ text, className = '' }) => (
  <div className={`text-sm text-[#1C2826] break-words ${className}`}>
    <ReactMarkdown components={components}>{text}</ReactMarkdown>
  </div>
);