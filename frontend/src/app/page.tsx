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
<<<<<<< HEAD
  return (
    <div className="min-h-screen bg-[#FDFBF7] flex flex-col font-sans overflow-x-hidden">
      <Header />

      <div 
        className="relative w-full h-[460px] bg-cover bg-center flex items-center px-16" 
=======
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-[#FDFBF7] flex flex-col font-sans overflow-x-hidden">
      <Header />

      {/* Hero Banner */}
      <div 
        className="relative w-full h-[520px] bg-cover bg-center flex items-center px-8 md:px-16" 
>>>>>>> feat/MH-30-UI-Home/LoginPage
        style={{ 
          backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.65), rgba(0,0,0,0.3)), url(${hutBackgroundImage})` 
        }}
      >
<<<<<<< HEAD
        <div className="max-w-3xl text-white">
          <span className="text-xs font-bold tracking-widest uppercase text-[#EFE4D2] mb-3 block">Open Daily for Hikers & Travelers</span>
          <h1 className="text-5xl md:text-6xl font-serif font-bold mb-6 tracking-tight">Rest your feet. Taste the peaks.</h1>
          <p className="text-lg text-gray-200 font-light mb-8 max-w-xl leading-relaxed">
            Experience warm alpine hospitality, traditional wood-table dining, and majestic sunset views at Mountain Hut.
          </p>
          <div>
            <Link to="/book-table" className="px-8 py-4 bg-[#D28A54] text-white font-medium rounded-xl hover:bg-[#be7847] transition-all shadow-md inline-block">
              Book a Table
=======
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
>>>>>>> feat/MH-30-UI-Home/LoginPage
            </Link>
          </div>
        </div>
      </div>

<<<<<<< HEAD
=======
      {/* Structured Sections */}
>>>>>>> feat/MH-30-UI-Home/LoginPage
      <AboutSection />
      <LocationSection />
      <BookingSteps />
      <PracticalInfoSection />

<<<<<<< HEAD
      <footer className="bg-[#1C2826] text-white py-10 px-16 flex flex-col md:flex-row justify-between items-center text-sm border-t border-[#2C3835]">
        <p className="text-gray-400 mb-4 md:mb-0">© 2026 Mountain Hut Refuge. All rights reserved.</p>
        <Link to="/login" className="text-xs text-gray-400 hover:text-white transition-colors underline">Staff Portal Login</Link>
=======
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
>>>>>>> feat/MH-30-UI-Home/LoginPage
      </footer>
    </div>
  );
}