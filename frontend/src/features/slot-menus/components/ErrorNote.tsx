import React from 'react';
import { AlertCircle } from 'lucide-react';

export const ErrorNote: React.FC<{ message: string }> = ({ message }) => (
  <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 text-red-700 text-xs">
    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
    <span>{message}</span>
  </div>
);