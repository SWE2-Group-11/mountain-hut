import React from 'react';
import heroBgImage from '../../assets/hut.jpg';

interface HeroBannerProps {
  title?: string;
  subtitle?: string;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({
  title = 'Book a Table',
  subtitle = 'Reserve a place for your party and enjoy your meal at the hut.',
}) => {
  return (
    <div
      className="relative w-full h-[380px] bg-cover bg-center flex items-center px-16"
      style={{
        backgroundImage: `linear-gradient(to right, rgba(0,0,0,0.6), rgba(0,0,0,0.2)), url(${heroBgImage})`,
      }}
    >
      <div className="max-w-2xl text-white">
        <h1 className="text-5xl font-serif font-bold mb-4 tracking-tight">{title}</h1>
        <p className="text-lg text-gray-200 font-light">{subtitle}</p>
      </div>
    </div>
  );
};