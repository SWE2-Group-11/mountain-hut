import React from 'react';
// Import your local image from the assets folder
import heroBgImage from '../../assets/hut.jpg'; 
// (If you aren't using the @/ alias, use a relative path like: import heroBgImage from '../../assets/hero-bg.jpg';)

export const HeroBanner: React.FC = () => {
  return (
    <div 
      className="relative w-full h-[380px] bg-cover bg-center flex items-center px-16" 
      style={{ 
        backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.6), rgba(0,0,0,0.2)), url(${heroBgImage})` 
      }}
    >
      <div className="max-w-2xl text-white">
        <h1 className="text-5xl font-serif font-bold mb-4 tracking-tight">Book a Table</h1>
        <p className="text-lg text-gray-200 font-light">
          Reserve a place for your party and enjoy your meal at the hut.
        </p>
      </div>
    </div>
  );
};