import React, { useEffect, useState } from 'react';
import { fetchReusableMenus } from '../api/slotMenusApi';
import { MenuText } from './MenuText';

interface ReusableMenusProps {
  onPick: (menu: string) => void;
}

// The menus written for other slots. Choosing one only copies its text into the editor:
// the slot it came from is never changed.
export const ReusableMenus: React.FC<ReusableMenusProps> = ({ onPick }) => {
  const [menus, setMenus] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchReusableMenus()
      .then((data) => {
        if (!cancelled) setMenus(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return (
      <p role="alert" className="text-sm text-red-700">
        Could not load the previous menus.
      </p>
    );
  }
  if (menus === null) return <p className="text-sm text-[#7C8885]">Loading the previous menus...</p>;
  if (menus.length === 0) return <p className="text-sm text-[#5A6865]">There is no previous menu yet.</p>;

  return (
      <ul aria-label="Previous menus" className="space-y-2 max-h-96 overflow-y-auto pr-1">
      {menus.map((menu) => (
        <li key={menu} className="flex items-start gap-3 rounded-xl border border-[#EFEADF] bg-white p-3">
                 <div className="flex-1 min-w-0">
            <MenuText text={menu} />
          </div>
          <button
            type="button"
            onClick={() => onPick(menu)}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-[#234E39] text-white text-xs font-medium hover:bg-[#1C3E2E] cursor-pointer"
          >
            Use this menu
          </button>
        </li>
      ))}
    </ul>
  );
};