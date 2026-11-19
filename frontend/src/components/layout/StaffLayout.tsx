import React from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import logoImage from '../../assets/logo.jpeg';
import { useAuth } from '../../features/auth/useAuth';
import { UserMenu } from './UserMenu';
import { CalendarClock, CalendarPlus, CalendarRange, ExternalLink, Search } from 'lucide-react';
interface StaffLayoutProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

const STAFF_PAGES = [
  { to: '/staff/reserve', label: 'Reserve for a hiker', icon: CalendarPlus },
   { to: '/staff/slots', label: 'Manage slots', icon: CalendarClock, end: true },
  { to: '/staff/slots/repeat', label: 'Copy a week', icon: CalendarRange, end: true },
  { to: '/availability', label: 'Check availability', icon: Search },
];

const itemClass = (isActive: boolean) =>
  `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
    isActive ? 'bg-[#234E39] text-white shadow-sm' : 'text-[#3C4A47] hover:bg-[#EFE4D2]'
  }`;

// The workspace of employees and the warden: a top bar, a side menu and the page content.
// Hikers and visitors never see it; they keep the public header.
export const StaffLayout: React.FC<StaffLayoutProps> = ({ title, subtitle, children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Always end up on /login, even if the logout request fails
  const handleLogout = async () => {
    try {
      await logout();
    } catch (err) {
      console.error('Logout failed', err);
    } finally {
      navigate('/login');
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F1E8] flex flex-col font-sans">
      <header className="sticky top-0 z-40 bg-[#FAF6EE] border-b border-[#EFEADF] px-4 md:px-8 h-16 flex items-center justify-between">
        <Link to="/staff/reserve" className="flex items-center gap-3">
          <img src={logoImage} alt="Mountain Hut Logo" className="w-9 h-9 rounded-full object-cover" />
          <span className="text-lg font-serif font-bold text-[#1C2826]">Mountain Hut</span>
          <span className="hidden sm:inline px-2 py-0.5 rounded-md bg-[#234E39] text-white text-[10px] font-bold uppercase tracking-widest">
            Staff
          </span>
        </Link>
        <div className="flex items-center gap-4">
          <Link to="/" className="hidden sm:flex items-center gap-1.5 text-xs text-[#5A6865] hover:text-[#1C2826]">
            Public site <ExternalLink className="w-3.5 h-3.5" />
          </Link>
          {user && <UserMenu email={user.email} role={user.role} links={[]} onLogout={handleLogout} />}
        </div>
      </header>

      <div className="flex-1 flex flex-col md:flex-row">
        {/* Side menu on desktop, a scrolling strip on phones */}
        <nav
          aria-label="Staff"
          className="md:w-64 md:shrink-0 md:border-r border-b md:border-b-0 border-[#EFEADF] bg-white/60 p-3 md:p-4 flex md:flex-col gap-1 overflow-x-auto md:sticky md:top-16 md:self-start md:h-[calc(100vh-4rem)]"
        >
          <p className="hidden md:block px-3.5 pt-2 pb-3 text-[10px] font-bold uppercase tracking-widest text-[#7C8885]">Workspace</p>
         {STAFF_PAGES.map(({ to, label, icon: Icon, end }) => (
  <NavLink key={to} to={to} end={end} className={({ isActive }) => itemClass(isActive)}>
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        <main className="flex-1 min-w-0 px-4 md:px-8 py-8 space-y-6">
          <div>
            <h1 className="text-3xl font-serif font-bold text-[#1C2826]">{title}</h1>
            {subtitle && <p className="text-sm text-[#5A6865] mt-1">{subtitle}</p>}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
};