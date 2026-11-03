import React from 'react';
import { MapPin, Navigation, Clock, Compass } from 'lucide-react';
import hutBackgroundImage from '../../../assets/hut.jpg'

export const LocationSection: React.FC = () => {
  return (
    <section className="py-24 px-16 bg-[#FAF6EE] border-b border-[#EFEADF]">
      <div className="max-w-7xl mx-auto flex flex-col lg:flex-row gap-16 items-center">
        
        {/* Left: Trail & Route Details */}
        <div className="flex-1 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#EFE4D2]/60 rounded-full text-[#234E39]">
            <MapPin className="w-4 h-4" />
            <span className="text-xs font-bold tracking-wider uppercase">Location & Access</span>
          </div>
          
          <h2 className="text-4xl font-serif font-bold text-[#1C2826] leading-tight">
            How to reach the hut
          </h2>
          
          <p className="text-[#5A6865] text-base leading-relaxed">
            Mountain Hut sits at an elevation of 2,150m along the high ridge trails. It is accessible exclusively on foot via well-marked alpine paths.
          </p>

          <div className="space-y-4 pt-2">
            <div className="bg-white p-5 rounded-2xl border border-[#EFEADF] shadow-sm flex items-start gap-4 transition-all hover:border-[#234E39]">
              <div className="p-3 bg-[#FAF6EE] rounded-xl text-[#234E39] shrink-0 mt-0.5">
                <Navigation className="w-5 h-5" />
              </div>
              <div className="space-y-1 w-full">
                <div className="flex items-center justify-between">
                  <h4 className="font-serif font-bold text-[#1C2826] text-base">Trail 4A from Valley Base</h4>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-[#D28A54] bg-[#FAF6EE] px-2.5 py-1 rounded-full">
                    <Clock className="w-3 h-3" /> 1h 45m
                  </span>
                </div>
                <p className="text-xs text-[#5A6865] leading-relaxed">
                  Moderate incline winding through lush pine forests and alpine streams. Well-suited for all hiking skill levels.
                </p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-[#EFEADF] shadow-sm flex items-start gap-4 transition-all hover:border-[#234E39]">
              <div className="p-3 bg-[#FAF6EE] rounded-xl text-[#234E39] shrink-0 mt-0.5">
                <Compass className="w-5 h-5" />
              </div>
              <div className="space-y-1 w-full">
                <div className="flex items-center justify-between">
                  <h4 className="font-serif font-bold text-[#1C2826] text-base">Ridge Path 12 (High Route)</h4>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-[#D28A54] bg-[#FAF6EE] px-2.5 py-1 rounded-full">
                    <Clock className="w-3 h-3" /> 50m
                  </span>
                </div>
                <p className="text-xs text-[#5A6865] leading-relaxed">
                  Scenic panoramic traverse starting from the upper cable car station with sweeping views across the main valley.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Immersive Hut Photo Map Card */}
        <div className="flex-1 w-full">
          <div 
            className="rounded-3xl h-[420px] w-full flex flex-col justify-end p-8 relative overflow-hidden shadow-lg border border-[#EFEADF] bg-cover bg-center"
            style={{ 
              backgroundImage: `linear-gradient(to top, rgba(28,40,38,0.92) 0%, rgba(28,40,38,0.3) 60%, rgba(0,0,0,0.1) 100%), url(${hutBackgroundImage})` 
            }}
          >
            <div className="absolute top-6 left-6 bg-white/90 backdrop-blur-md px-4 py-2 rounded-xl flex items-center gap-2 shadow-sm">
              <MapPin className="w-4 h-4 text-[#234E39]" />
              <span className="text-xs font-bold text-[#1C2826]">GPS: 45.9234° N, 7.8123° E</span>
            </div>

            <div className="text-white space-y-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-[#EFE4D2]">
                Alpine Navigation
              </span>
              <h3 className="font-serif font-bold text-2xl">
                Follow the Red-White-Red Stripes
              </h3>
              <p className="text-xs text-gray-200 leading-relaxed font-light">
                All paths are officially maintained by the alpine club. Ensure you wear sturdy hiking boots and check mountain weather forecasts before departure.
              </p>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
};