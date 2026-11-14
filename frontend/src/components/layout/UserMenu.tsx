import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CalendarCheck, ChevronDown, LogOut } from 'lucide-react';

export interface AccountLink {
  to: string;
  label: string;
}

interface UserMenuProps {
  email: string;
  role: string;
  links: AccountLink[];
  onLogout: () => void;
}

const roleLabel = (role: string) => role.charAt(0).toUpperCase() + role.slice(1);

// The account of the signed-in person: who they are, their own pages and the way out.
export const UserMenu: React.FC<UserMenuProps> = ({ email, role, links, onLogout }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();

  // Close when the page changes, on a click outside, and with Escape
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative pl-6 border-l border-[#EFEADF]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex items-center gap-2 rounded-full pl-1 pr-2 py-1 hover:bg-[#EFEADF] transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#234E39]/40"
      >
        <span className="w-8 h-8 rounded-full bg-[#234E39] text-white flex items-center justify-center text-sm font-bold uppercase">
          {email.charAt(0)}
        </span>
        <ChevronDown className={`w-4 h-4 text-[#5A6865] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-3 w-64 bg-white border border-[#EFEADF] rounded-2xl shadow-xl py-2 z-50"
        >
          <div className="px-4 py-3 border-b border-[#EFEADF]">
            <p className="text-xs text-[#7C8885]">Signed in as</p>
            <p className="text-sm font-semibold text-[#1C2826] truncate" title={email}>
              {email}
            </p>
            <span className="inline-block mt-2 bg-[#FAF6EE] px-2 py-0.5 rounded text-[10px] text-[#5A6865] uppercase tracking-wider border border-[#EFEADF]">
              {roleLabel(role)}
            </span>
          </div>

          {links.length > 0 && (
            <div className="py-1">
              {links.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  role="menuitem"
                  aria-current={pathname === link.to ? 'page' : undefined}
                  className={`flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[#FAF6EE] transition-colors ${
                    pathname === link.to ? 'font-bold text-[#234E39]' : 'text-[#1C2826]'
                  }`}
                >
                  <CalendarCheck className="w-4 h-4 text-[#234E39]" />
                  {link.label}
                </Link>
              ))}
            </div>
          )}

          <div className="border-t border-[#EFEADF] pt-1">
            <button
              type="button"
              role="menuitem"
              onClick={onLogout}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors cursor-pointer text-left"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
};