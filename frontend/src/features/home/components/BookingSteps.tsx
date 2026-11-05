import React from 'react';
import { CalendarCheck, Users, Clock } from 'lucide-react';

export const BookingSteps: React.FC = () => {
  return (
    <section className="py-20 px-16 bg-[#FDFBF7]">
      <div className="max-w-5xl mx-auto">
        <div className="text-center max-w-xl mx-auto mb-16">
          <h2 className="text-3xl font-serif font-bold text-[#1C2826] mb-3">
            How booking works
          </h2>
          <p className="text-[#5A6865] text-sm">
            Quick guidelines to reserve your spot at our long wooden tables.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-[#EFEADF] flex flex-col justify-between">
            <div>
              <div className="p-3 bg-[#FAF6EE] w-fit rounded-xl text-[#234E39] mb-4">
                <CalendarCheck className="w-6 h-6" />
              </div>
              <h3 className="font-serif font-bold text-[#1C2826] text-lg mb-2">1. Choose Slot & Party</h3>
              <p className="text-sm text-[#5A6865] leading-relaxed">
                Select an available time slot from the active schedule and specify your party size.
              </p>
            </div>
          </div>

          <div className="bg-white p-8 rounded-2xl shadow-sm border border-[#EFEADF] flex flex-col justify-between">
            <div>
              <div className="p-3 bg-[#FAF6EE] w-fit rounded-xl text-[#234E39] mb-4">
                <Clock className="w-6 h-6" />
              </div>
              <h3 className="font-serif font-bold text-[#1C2826] text-lg mb-2">2. Timing Rules</h3>
              <p className="text-sm text-[#5A6865] leading-relaxed">
                Bookings can be made up to 2 hours before your meal. Please note that the hut is closed on Mondays.
              </p>
            </div>
          </div>

          <div className="bg-white p-8 rounded-2xl shadow-sm border border-[#EFEADF] flex flex-col justify-between">
            <div>
              <div className="p-3 bg-[#FAF6EE] w-fit rounded-xl text-[#234E39] mb-4">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="font-serif font-bold text-[#1C2826] text-lg mb-2">3. Seating Policy</h3>
              <p className="text-sm text-[#5A6865] leading-relaxed">
                We serve meals at long wooden tables. Larger parties may be split across multiple adjacent tables.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};