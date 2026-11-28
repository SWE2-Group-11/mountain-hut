import React from 'react';
import type { Editor } from '@tiptap/react';
import { Bold, IndentDecrease, IndentIncrease, Italic, List } from 'lucide-react';

const buttonClass =
  'p-2 rounded-lg text-[#3C4A47] hover:bg-[#EFE4D2] focus:outline-none focus:ring-2 focus:ring-[#234E39]/30 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';

export const MenuToolbar: React.FC<{ editor: Editor }> = ({ editor }) => {
  const inList = editor.isActive('listItem');
  const actions = [
    {
      label: 'Bold (Ctrl+B)',
      icon: Bold,
      active: editor.isActive('bold'),
      enabled: true,
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: 'Italic (Ctrl+I)',
      icon: Italic,
      active: editor.isActive('italic'),
      enabled: true,
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: 'Bulleted list',
      icon: List,
      active: editor.isActive('bulletList'),
      enabled: true,
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: 'Make a sub item',
      icon: IndentIncrease,
      active: false,
      enabled: inList && editor.can().sinkListItem('listItem'),
      run: () => editor.chain().focus().sinkListItem('listItem').run(),
    },
    {
      label: 'Move out one level',
      icon: IndentDecrease,
      active: false,
      enabled: inList && editor.can().liftListItem('listItem'),
      run: () => editor.chain().focus().liftListItem('listItem').run(),
    },
  ];

  return (
    <div role="toolbar" aria-label="Menu formatting" className="flex flex-wrap gap-1">
      {actions.map(({ label, icon: Icon, active, enabled, run }) => (
        <button
          key={label}
          type="button"
          aria-label={label}
          aria-pressed={active}
          title={label}
          disabled={!enabled}
          // Keep the focus (and the selection) in the text while a button is pressed
          onMouseDown={(e) => e.preventDefault()}
          onClick={run}
          className={`${buttonClass} ${active ? 'bg-[#E3F1E8] text-[#234E39]' : ''}`}
        >
          <Icon className="w-4 h-4" />
        </button>
      ))}
    </div>
  );
};