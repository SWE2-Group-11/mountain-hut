import React from 'react';
import { Routes, Route } from 'react-router-dom';
import HomePage from './app/page';
import './App.css';

export default function App() {
  return (
    <Routes>
      {/* Home Route */}
      <Route path="/" element={<HomePage />} />

      {/* Staff Login Route (Placeholder for MH-02) */}
      <Route 
        path="/staff/login" 
        element={
          <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center font-serif text-3xl text-[#1C2826]">
            Staff Portal Login (Coming Soon)
          </div>
        } 
      />
    </Routes>
  );
}