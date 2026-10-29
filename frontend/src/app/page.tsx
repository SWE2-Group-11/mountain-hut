import React from 'react';
import { Header } from '../components/layout/Header';
import { AboutSection } from '../features/home/components/AboutSection';
import { LocationSection } from '../features/home/components/LocationSection';
import { BookingSteps } from '../features/home/components/BookingSteps';
import { PracticalInfoSection } from '../features/home/components/PracticalInfoSection';
import { Link } from 'react-router-dom';
import hutBackgroundImage from '../assets/hut.jpg';

export default function HomePage() {
 return (
  <div className="min-h-screen bg-[#FDFBF7] flex flex-col font-sans overflow-x-hidden">
    <Header activeTab="home" />

    {/* Hero Banner */}
    <div 
      className="relative w-full h-[460px] bg-cover bg-center flex items-center px-16" 
      style={{ 
        backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.65), rgba(0,0,0,0.3)), url(${hutBackgroundImage})` 
      }}
    >
      <div className="max-w-3xl text-white">
        <span className="text-xs font-bold tracking-widest uppercase text-[#EFE4D2] mb-3 block">
          Open Daily for Hikers & Travelers
        </span>
        <h1 className="text-5xl md:text-6xl font-serif font-bold mb-6 tracking-tight">
          Rest your feet. Taste the peaks.
        </h1>
        <p className="text-lg text-gray-200 font-light mb-8 max-w-xl leading-relaxed">
          Experience warm alpine hospitality, traditional wood-table dining, and majestic sunset views at Mountain Hut.
        </p>
      </div>
    </div>

    {/* Structured Sections */}
    <AboutSection />
    <LocationSection />
    <BookingSteps />
    <PracticalInfoSection />

    {/* Footer */}
    <footer className="bg-[#1C2826] text-white py-10 px-16 flex flex-col md:flex-row justify-between items-center text-sm border-t border-[#2C3835]">
      <p className="text-gray-400 mb-4 md:mb-0">© 2026 Mountain Hut Refuge.</p>
      <Link to="/login" className="text-xs text-gray-400 hover:text-white transition-colors underline">
        Login
      </Link>
    </footer>
  </div>
);
}