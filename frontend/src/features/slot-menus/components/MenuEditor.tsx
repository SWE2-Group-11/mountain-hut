import React, { useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { History } from 'lucide-react';
import type { DaySlot } from '../types/slotMenus.types';
import { ErrorNote } from './ErrorNote';
import { MenuToolbar } from './MenuToolbar';
import { ReusableMenus } from './ReusableMenus';

const MAX_LENGTH = 5000; // the limit of the server

const labelClass = 'block text-[10px] uppercase font-bold tracking-widest text-[#7C8885] mb-1.5';

// Only what a menu needs: bold, italic and (nested) bulleted lists. The text is saved as Markdown.
const extensions = [
  StarterKit.configure({
    heading: false,
    blockquote: false,
    codeBlock: false,
    code: false,
    horizontalRule: false,
    strike: false,
    underline: false,
    link: false,
    orderedList: false,
  }),
  Markdown,
];

const editorClass = [
  'min-h-56 rounded-xl border border-[#EFEADF] bg-white px-3 py-2.5 text-sm text-[#1C2826] focus:outline-none',
  'focus:ring-2 focus:ring-[#234E39]/30 break-words',
  '[&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-1 [&_li]:my-0.5 [&_li>p]:mb-0',
  '[&_strong]:font-bold [&_em]:italic',
].join(' ');

interface MenuEditorProps {
  slot: DaySlot;
  // Answers with an error message, or null when the menu was saved
  onSave: (menu: string) => Promise<string | null>;
  onClose: () => void;
}

export const MenuEditor: React.FC<MenuEditorProps> = ({ slot, onSave, onClose }) => {
  const [text, setText] = useState(slot.menu ?? '');
  // The editor may write the same menu with other Markdown symbols, so "changed" means "edited"
  const [edited, setEdited] = useState(false);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editor = useEditor({
    extensions,
    content: slot.menu ?? '',
    contentType: 'markdown',
    shouldRerenderOnTransaction: true,
    editorProps: { attributes: { class: editorClass, 'aria-label': 'Menu text', role: 'textbox', 'aria-multiline': 'true' } },
    onUpdate: ({ editor: e }) => {
      setText(e.getMarkdown().trim());
      setEdited(true);
    },
  });

  const time = `${slot.startTime} - ${slot.endTime}`;
  const blank = text === '';
  const tooLong = text.length > MAX_LENGTH;
  const canSave = !saving && edited && !blank && !tooLong;

  const handlePick = (menu: string) => {
    editor?.commands.setContent(menu, { contentType: 'markdown' });
    setText(menu.trim());
    setEdited(true);
    setPicking(false);
    editor?.commands.focus('end');
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const message = await onSave(text);
    if (message) {
      setError(message);
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[#EFEADF] bg-[#FAF6EE] p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-serif font-bold text-lg text-[#1C2826]">
          {slot.menu ? 'Edit the menu' : 'Write the menu'} · {time}
        </h3>
        <button
          type="button"
          aria-expanded={picking}
          onClick={() => setPicking((open) => !open)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-[#234E39] text-[#234E39] text-sm font-medium hover:bg-[#EFE4D2] cursor-pointer"
        >
          <History className="w-4 h-4" />
          Reuse a previous menu
        </button>
      </div>

      {picking && (
        <div className="rounded-xl bg-[#F5F1E8] p-3 space-y-2">
          <p className="text-xs text-[#5A6865]">
            Pick a menu to start from. It replaces the text below and you can still change it. The slot it came from
            stays as it is.
          </p>
          <ReusableMenus onPick={handlePick} />
        </div>
      )}

      <div className="space-y-2">
        <span className={labelClass}>Menu text</span>
        {editor && <MenuToolbar editor={editor} />}
        <EditorContent editor={editor} />
        <p className={`text-xs text-right ${tooLong ? 'text-red-700 font-semibold' : 'text-[#7C8885]'}`}>
          {text.length} / {MAX_LENGTH}
        </p>
      </div>

      <p className="text-xs text-[#5A6865]">
        Saving changes only the {time} slot of this day. Other slots that use the same menu are not changed.
      </p>

      {error && <ErrorNote message={error} />}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {blank && edited && (
          <span className="text-xs text-[#5A6865] mr-auto">To take the menu away, cancel and use Remove menu.</span>
        )}
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-xl border border-[#EFEADF] bg-white text-sm font-medium text-[#3C4A47] hover:bg-[#EFE4D2] cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="px-4 py-2 rounded-xl bg-[#234E39] text-white text-sm font-medium hover:bg-[#1C3E2E] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          {saving ? 'Saving...' : 'Save menu'}
        </button>
      </div>
    </div>
  );
};