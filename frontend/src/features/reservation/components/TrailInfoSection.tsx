import React from 'react';
import { Utensils, Clock, MapPin } from 'lucide-react';

export const TrailInfoSection: React.FC = () => {
  return (
    <div className="flex-1 pr-12">
      <h2 className="text-3xl font-serif font-bold text-[#1C2826] mb-4">
        A warm meal after the trail
      </h2>
      <p className="text-[#5A6865] text-base mb-8 leading-relaxed">
        Hearty alpine dishes, served at long wooden tables with a view of the peaks.
      </p>

      <div className="space-y-4">
        <div className="flex items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-[#EFEADF]">
          <div className="p-3 bg-[#F4EFE6] rounded-xl text-[#3C4A47]">
            <Utensils className="w-5 h-5" />
          </div>
          <span className="text-sm font-medium text-[#2C3835]">
            Lunch 12:00 – 13:30 · Dinner 19:00 – 20:00
          </span>
        </div>

        <div className="flex items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-[#EFEADF]">
          <div className="p-3 bg-[#F4EFE6] rounded-xl text-[#3C4A47]">
            <Clock className="w-5 h-5" />
          </div>
          <span className="text-sm font-medium text-[#2C3835]">
            Book up to 2 hours before your meal
          </span>
        </div>

        <div className="flex items-center gap-4 bg-white p-4 rounded-2xl shadow-sm border border-[#EFEADF]">
          <div className="p-3 bg-[#F4EFE6] rounded-xl text-[#3C4A47]">
            <MapPin className="w-5 h-5" />
          </div>
          <span className="text-sm font-medium text-[#2C3835]">
            Closed on Mondays
          </span>
        </div>
      </div>
    </div>
  );
};