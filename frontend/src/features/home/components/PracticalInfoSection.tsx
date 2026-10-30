import React from 'react';
import { Phone, Mail, Clock, CreditCard, Dog } from 'lucide-react';

export const PracticalInfoSection: React.FC = () => {
  return (
    <section className="py-20 px-16 bg-[#FAF6EE] border-t border-[#EFEADF]">
      <div className="max-w-6xl mx-auto">
        <div className="text-center max-w-xl mx-auto mb-16">
          <h2 className="text-3xl font-serif font-bold text-[#1C2826] mb-3">
            Practical Hiker Information
          </h2>
          <p className="text-[#5A6865] text-sm">
            Everything you need to know before stepping out on the trail and arriving at the hut.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-[#EFEADF] flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-[#234E39] mb-4">
                <Clock className="w-5 h-5" />
                <h3 className="font-serif font-bold text-lg text-[#1C2826]">Season & Slots</h3>
              </div>
              <p className="text-xs text-[#5A6865] leading-relaxed mb-6">
                Open June through October. Meals are served strictly during configured slots:
              </p>
              <ul className="space-y-2 text-xs text-[#2C3835] font-medium mb-6 bg-[#FAF6EE] p-3 rounded-xl">
                <li>• Lunch: 12:00 – 13:30</li>
                <li>• Dinner: 19:00 – 20:00</li>
                <li className="text-[#D28A54] pt-1 font-normal">• Closed on Mondays</li>
              </ul>
            </div>
            <div className="pt-4 border-t border-[#F4EFE6] text-xs text-[#5A6865]">
              <span className="block font-semibold text-[#1C2826] mb-1">Need to make late changes?</span>
              <div className="flex items-center gap-3 mt-2">
                <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5 text-[#234E39]" /> +39 0123 456789</span>
                <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5 text-[#234E39]" /> help@mountainhut.it</span>
              </div>
              <p className="text-[10px] text-[#7C8885] mt-1 italic">*Subject to the 2-hour booking cutoff rule.</p>
            </div>
          </div>

          <div className="bg-white p-8 rounded-2xl shadow-sm border border-[#EFEADF] flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-[#234E39] mb-4">
                <CreditCard className="w-5 h-5" />
                <h3 className="font-serif font-bold text-lg text-[#1C2826]">Payments & Food</h3>
              </div>
              <div className="space-y-4 text-xs text-[#5A6865] leading-relaxed">
                <div>
                  <strong className="text-[#1C2826] block mb-0.5">Cash & Card Accepted</strong>
                  <p>POS terminal is available, though cash is recommended in case of severe weather interference.</p>
                </div>
                <div>
                  <strong className="text-[#1C2826] block mb-0.5">Dietary Requests</strong>
                  <p>Vegetarian and gluten-conscious options are available. </p>
                </div>
              </div>
            </div>
            <div className="pt-4 border-t border-[#F4EFE6] text-xs text-[#7C8885]">
              Informed kitchen preparation
            </div>
          </div>

          <div className="bg-white p-8 rounded-2xl shadow-sm border border-[#EFEADF] flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-[#234E39] mb-4">
                <Dog className="w-5 h-5" />
                <h3 className="font-serif font-bold text-lg text-[#1C2826]">Dogs & Companions</h3>
              </div>
              <p className="text-xs text-[#5A6865] leading-relaxed mb-6">
                Well-behaved dogs are welcome inside the communal dining areas and on the outdoor terrace. 
              </p>
              <ul className="space-y-2 text-xs text-[#5A6865]">
                <li>• Must remain on a leash at all times.</li>
                <li>• Water bowls provided outside the main entrance.</li>
                <li>• Please keep aisles clear of sleeping pets due to active table service.</li>
              </ul>
            </div>
            <div className="pt-4 border-t border-[#F4EFE6] text-xs text-[#7C8885]">
              Family & pet friendly refuge
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};