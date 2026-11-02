import { Header } from '../components/layout/Header';
import { AboutSection } from '../features/home/components/AboutSection';
import { LocationSection } from '../features/home/components/LocationSection';
import { BookingSteps } from '../features/home/components/BookingSteps';
import { PracticalInfoSection } from '../features/home/components/PracticalInfoSection';
import { Link } from 'react-router-dom';
import { useAuth } from '../features/auth/useAuth';
import { Calendar, ArrowRight } from 'lucide-react';
import hutBackgroundImage from '../assets/hut.jpg';

export default function HomePage() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-[#FDFBF7] flex flex-col font-sans overflow-x-hidden">
      <Header />

      {/* Hero Banner */}
      <div 
        className="relative w-full h-[520px] bg-cover bg-center flex items-center px-8 md:px-16" 
        style={{ 
          backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.65), rgba(0,0,0,0.3)), url(${hutBackgroundImage})` 
        }}
      >
        <div className="max-w-3xl text-white space-y-4">
         
          <h1 className="text-4xl md:text-6xl font-serif font-bold tracking-tight leading-tight">
            Rest your feet. Taste the peaks.
          </h1>
          <p className="text-base md:text-lg text-gray-200 font-light max-w-xl leading-relaxed">
            Experience warm alpine hospitality, traditional wood-table dining, and majestic sunset views at Mountain Hut.
          </p>

          <div className="pt-4">
            {/* Dynamic Link: goes to /book-table if logged in, otherwise redirects to /login */}
            <Link
              to={user ? "/book-table" : "/login"}
              className="inline-flex items-center gap-2 px-8 py-4 bg-[#234E39] text-white rounded-2xl font-medium text-sm hover:bg-[#1C3E2E] transition-colors shadow-lg cursor-pointer"
            >
              <Calendar className="w-5 h-5" />
              Book a Table
              <ArrowRight className="w-4 h-4 ml-1" />
            </Link>
          </div>
        </div>
      </div>

      {/* Structured Sections */}
      <AboutSection />
      <LocationSection />
      <BookingSteps />
      <PracticalInfoSection />

      {/* Footer */}
      <footer className="bg-[#1C2826] text-white py-10 px-8 md:px-16 flex flex-col md:flex-row justify-between items-center text-sm border-t border-[#2C3835]">
        <p className="text-gray-400 mb-4 md:mb-0">© 2026 Mountain Hut Refuge (MH-01).</p>
        <div>
          {user ? (
            <button 
              onClick={logout} 
              className="text-xs text-gray-400 hover:text-white transition-colors underline cursor-pointer"
            >
              Logout ({user.username})
            </button>
          ) : (
            <Link 
              to="/login" 
              className="text-xs text-gray-400 hover:text-white transition-colors underline"
            >
              Login
            </Link>
          )}
        </div>
      </footer>
    </div>
  );
}