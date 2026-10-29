import React from 'react';
import { Link } from 'react-router-dom';
import logoImage from '../../assets/logo.jpeg';

interface HeaderProps {
  activeTab?: 'home';
}

export const Header: React.FC<HeaderProps> = ({ activeTab = 'home' }) => {
  return (
    <header className="w-full bg-[#FAF6EE] px-12 py-4 flex items-center justify-between border-b border-[#EFEADF]">
      <div className="flex items-center gap-1">
        <img src={logoImage} alt="Mountain Hut Logo" className="w-15 h-15 rounded-full object-cover" />
        <span className="text-xl font-serif font-bold text-[#1C2826]">Mountain Hut</span>
      </div>
      
      <nav className="flex items-center gap-8 font-medium text-sm text-[#3C4A47]">
        <Link to="/" className={`hover:text-[#1C2826] transition-colors ${activeTab === 'home' ? 'font-bold text-[#1C2826]' : ''}`}>
          Home
        </Link>
        <Link to="/staff/login" className="text-xs text-[#7C8885] hover:text-[#1C2826] transition-colors border-l border-[#EFEADF] pl-6">
          Staff Login
        </Link>
      </nav>
    </header>
  );
};