import React, {useState} from 'react';
import { Link, useLocation} from 'react-router-dom';
import logoImage from '../../assets/logo.jpeg';
import { Menu, X } from 'lucide-react';

export const Header: React.FC = () => {
 const location = useLocation();
  const currentPath = location.pathname;
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const isLoginActive = currentPath === '/login' || currentPath === '/staff/login';
  const isHomeActive = currentPath === '/';

  // Close mobile menu when a link is clicked
  const handleNavClick = () => {
    setIsMobileMenuOpen(false);
  };

  return (
    <header className="w-full bg-[#FAF6EE] px-6 md:px-12 py-4 flex items-center justify-between border-b border-[#EFEADF] relative z-50">
      {/* Logo & Brand */}
      <div className="flex items-center gap-3">
        <img src={logoImage} alt="Mountain Hut Logo" className="w-10 h-10 md:w-14 md:h-14 rounded-full object-cover" />
        <span className="text-lg md:text-xl font-serif font-bold text-[#1C2826]">Mountain Hut</span>
      </div>
      
      {/* Desktop Navigation */}
      <nav className="hidden md:flex items-center gap-8 font-medium text-sm text-[#3C4A47]">
        <Link 
          to="/" 
          className={`hover:text-[#1C2826] transition-colors ${isHomeActive ? 'font-bold text-[#1C2826]' : ''}`}
        >
          Home
        </Link>
        <Link 
          to="/login" 
          className={`text-xs transition-colors border-l border-[#EFEADF] pl-6 ${
            isLoginActive ? 'font-bold text-[#1C2826]' : 'text-[#7C8885] hover:text-[#1C2826]'
          }`}
        >
          Login
        </Link>
      </nav>

      {/* Mobile Hamburger Button */}
      <button 
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        className="md:hidden p-2 rounded-xl text-[#1C2826] hover:bg-[#EFEADF] transition-colors focus:outline-none"
        aria-label="Toggle menu"
      >
        {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* Mobile Dropdown Drawer */}
      {isMobileMenuOpen && (
        <div className="absolute top-full left-0 w-full bg-[#FAF6EE] border-b border-[#EFEADF] shadow-lg py-6 px-8 flex flex-col gap-4 md:hidden">
          <Link 
            to="/" 
            onClick={handleNavClick}
            className={`text-base font-medium py-2 transition-colors ${isHomeActive ? 'font-bold text-[#1C2826]' : 'text-[#5A6865]'}`}
          >
            Home
          </Link>
          <Link 
            to="/login" 
            onClick={handleNavClick}
            className={`text-base font-medium py-2 transition-colors border-t border-[#EFEADF] pt-4 ${
              isLoginActive ? 'font-bold text-[#1C2826]' : 'text-[#5A6865]'
            }`}
          >
            Login
          </Link>
        </div>
      )}
    </header>
  );
};