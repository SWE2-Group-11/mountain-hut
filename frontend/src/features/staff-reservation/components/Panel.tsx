import React from 'react';
import { Check } from 'lucide-react';

interface PanelProps {
  step: number;
  title: string;
  hint?: string;
  done?: boolean;
  children: React.ReactNode;
}

// One block of the reservation desk: numbered title, a tick when the block is complete
export const Panel: React.FC<PanelProps> = ({ step, title, hint, done = false, children }) => (
  <section className="bg-white rounded-2xl border border-[#EFEADF] shadow-sm">
    <header className="flex items-center gap-3 px-6 py-4 border-b border-[#EFEADF]">
      <span
        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
          done ? 'bg-[#234E39] text-white' : 'bg-[#EFE4D2] text-[#5A6865]'
        }`}
      >
        {done ? <Check className="w-4 h-4" /> : step}
      </span>
      <div className="min-w-0">
        <h2 className="font-serif font-bold text-[#1C2826] leading-tight">{title}</h2>
        {hint && <p className="text-xs text-[#7C8885]">{hint}</p>}
      </div>
    </header>
    <div className="p-6">{children}</div>
  </section>
);