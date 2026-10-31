import React from 'react';

export const AboutSection: React.FC = () => {
  return (
    <section className="py-20 px-16 bg-[#FAF6EE] border-b border-[#EFEADF]">
      <div className="max-w-4xl mx-auto text-center space-y-6">
        <span className="text-xs font-bold tracking-widest text-[#234E39] uppercase">
          Welcome to the Hut
        </span>
        <h2 className="text-4xl font-serif font-bold text-[#1C2826] leading-tight">
          An authentic alpine refuge for trail-goers.
        </h2>
        <p className="text-[#5A6865] text-base leading-relaxed max-w-2xl mx-auto">
          Nestled along the mountain trail, Mountain Hut offers hikers a warm hearth, 
          hearty home-cooked meals at long wooden tables, and magnificent views of the peaks. 
          Stop by to rest, dine, and share stories from the path.
        </p>
      </div>
    </section>
  );
};