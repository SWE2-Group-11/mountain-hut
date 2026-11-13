import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import logoImage from '../../assets/logo.jpeg';
import { Menu, X, LogOut, User as UserIcon } from 'lucide-react';
import { useAuth } from '../../features/auth/useAuth';
import { UserMenu, type AccountLink } from './UserMenu';

interface NavLink {
  to: string;
  label: string;
  visible: boolean;
  highlighted?: boolean; // green, for the pages of a signed-in role
}

export const Header: React.FC = () => {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = location.pathname;
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const isLoginActive = currentPath === '/login' || currentPath === '/staff/login';

  // Visitors and hikers see "Book a Table"; staff do not book tables.
  // A visitor who clicks it is sent to /login by ProtectedRoute.
  const canSeeBooking = !loading && (!user || user.role === 'hiker');
  // Only hikers have bookings to look at and change
  const canSeeMyBookings = !loading && user?.role === 'hiker';
  // Employees and wardens set up the slots
  const canManageSlots = !loading && (user?.role === 'employee' || user?.role === 'warden');

  // One list for the desktop and the mobile menu: add a page here and it shows up in both
  const navLinks: NavLink[] = [
    { to: '/', label: 'Home', visible: true },
    { to: '/availability', label: 'Check availability', visible: true },
    { to: '/book-table', label: 'Book a Table', visible: canSeeBooking, highlighted: true },
    { to: '/staff/slots', label: 'Manage slots', visible: canManageSlots, highlighted: true },
  ].filter((link) => link.visible);

  // The pages of the signed-in person live in the account menu, not in the main menu
  const accountLinks: AccountLink[] = canSeeMyBookings ? [{ to: '/my-bookings', label: 'My bookings' }] : [];

  const desktopLinkClass = ({ to, highlighted }: NavLink) =>
    `transition-colors ${
      currentPath === to
        ? `font-bold ${highlighted ? 'text-[#234E39]' : 'text-[#1C2826]'}`
        : highlighted
          ? 'text-[#234E39] hover:text-[#1C3E2E]'
          : 'hover:text-[#1C2826]'
    }`;

  const mobileLinkClass = ({ to, highlighted }: NavLink) =>
    `text-base font-medium py-2 transition-colors ${
      currentPath === to
        ? `font-bold ${highlighted ? 'text-[#234E39]' : 'text-[#1C2826]'}`
        : 'text-[#5A6865]'
    }`;

  const handleNavClick = () => {
    setIsMobileMenuOpen(false);
  };

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
    <header className="w-full bg-[#FAF6EE] px-6 md:px-12 py-4 flex items-center justify-between border-b border-[#EFEADF] relative z-50">
      {/* Logo & Brand */}
      <Link to="/" className="flex items-center gap-3">
        <img
          src={logoImage}
          alt="Mountain Hut Logo"
          className="w-10 h-10 md:w-14 md:h-14 rounded-full object-cover"
        />
        <span className="text-lg md:text-xl font-serif font-bold text-[#1C2826]">Mountain Hut</span>
      </Link>

      {/* Desktop Navigation */}
      <nav className="hidden md:flex items-center gap-6 font-medium text-sm text-[#3C4A47]">
        {navLinks.map((link) => (
          <Link key={link.to} to={link.to} className={desktopLinkClass(link)}>
            {link.label}
          </Link>
        ))}

        {/* Wait for the session check to avoid a flash of "Login" */}
        {loading ? (
          <div className="w-16 h-6 bg-[#EFEADF] rounded-lg animate-pulse" />
        ) : user ? (
          <UserMenu email={user.email} role={user.role} links={accountLinks} onLogout={handleLogout} />
        ) : (
          <Link
            to="/login"
            className={`text-xs transition-colors border-l border-[#EFEADF] pl-6 ${isLoginActive ? 'font-bold text-[#1C2826]' : 'text-[#7C8885] hover:text-[#1C2826]'
              }`}
          >
            Login
          </Link>
        )}
      </nav>

      {/* Mobile Hamburger Button */}
      <button
        type="button"
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        className="md:hidden p-2 rounded-xl text-[#1C2826] hover:bg-[#EFEADF] transition-colors focus:outline-none"
        aria-label="Toggle menu"
        aria-expanded={isMobileMenuOpen}
      >
        {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* Mobile Dropdown Drawer */}
      {isMobileMenuOpen && (
        <div className="absolute top-full left-0 w-full bg-[#FAF6EE] border-b border-[#EFEADF] shadow-lg py-6 px-8 flex flex-col gap-4 md:hidden">
          {navLinks.map((link) => (
            <Link key={link.to} to={link.to} onClick={handleNavClick} className={mobileLinkClass(link)}>
              {link.label}
            </Link>
          ))}

          {loading ? (
            <div className="w-20 h-8 bg-[#EFEADF] rounded-lg animate-pulse" />
          ) : user ? (
            <div className="pt-4 border-t border-[#EFEADF] flex flex-col gap-3">
              <div className="flex items-center gap-2 text-xs text-[#5A6865]">
                <UserIcon className="w-4 h-4 text-[#234E39]" />
                <span className="font-semibold text-[#1C2826]">{user.email}</span>
                <span className="bg-white px-2 py-0.5 rounded text-[10px] text-[#7C8885] uppercase border border-[#EFEADF]">
                  {user.role}
                </span>
              </div>
              {accountLinks.map((link) => (
                <Link key={link.to} to={link.to} onClick={handleNavClick} className={mobileLinkClass({ ...link, visible: true })}>
                  {link.label}
                </Link>
              ))}
              <button
                type="button"
                onClick={() => {
                  handleNavClick();
                  handleLogout();
                }}
                className="flex items-center gap-2 text-xs text-red-600 font-medium py-2 text-left cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                Logout
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              onClick={handleNavClick}
              className={`text-base font-medium py-2 transition-colors border-t border-[#EFEADF] pt-4 ${isLoginActive ? 'font-bold text-[#1C2826]' : 'text-[#5A6865]'
                }`}
            >
              Login
            </Link>
          )}
        </div>
      )}
    </header>
  );
};