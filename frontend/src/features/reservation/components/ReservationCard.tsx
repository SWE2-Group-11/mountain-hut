import React from 'react';
import { useReservation } from '../hooks/useReservation';
import { DatePickerStep } from './DatePickerStep';
import { TimeSlotStep } from './TimeSlotStep';
import { PartySizeStep } from './PartySizeStep';
import { SummaryBox } from './SummaryBox';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

export const ReservationCard: React.FC = () => {
  const {
    selectedDate,
    selectedTime,
    partySize,
    setSelectedDate,
    setSelectedTime,
    maxAvailableSeats,
    setPartySize,
    isFormValid,
    bookingError,
    allocationResult,
    confirmReservation,
  } = useReservation();

  const handleBookingClick = () => {
    const success = confirmReservation();
    if (success) {
      // Success action or modal trigger can go here
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto bg-white rounded-[32px] p-10 shadow-xl border border-[#EFEADF] relative -mt-20  space-y-6">
      <div className="mb-2">
        <h2 className="text-3xl font-serif font-bold text-[#1C2826] mb-2">Reserve your table</h2>
        <p className="text-[#5A6865] text-sm">Choose your meal time and party size.</p>
      </div>

      {/* Error Banner for Constraint Violations */}
      {bookingError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-700 text-xs">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-500 mt-0.5" />
          <div>
            <span className="font-bold block mb-0.5">Booking Restriction</span>
            {bookingError}
          </div>
        </div>
      )}

      {/* Success Banner showing Table Allocation */}
      {allocationResult && (
        <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2 text-emerald-900 text-xs">
          <div className="flex items-center gap-2 font-bold text-emerald-800 text-sm">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            Table Allocated Successfully!
          </div>
          <p>
            {allocationResult.isSplit 
              ? "Your party is split across the minimum required shared tables:" 
              : "Your whole party is seated together at:"}
          </p>
          <ul className="list-disc pl-4 space-y-1 font-medium">
            {allocationResult.allocation.map((alloc: any, idx: number) => (
              <li key={idx}>
                {alloc.tableId}: <strong>{alloc.seatsAssigned} seats</strong>
              </li>
            ))}
          </ul>
        </div>
      )}

      <DatePickerStep selectedDate={selectedDate} onSelectDate={setSelectedDate} />
      <TimeSlotStep selectedDate={selectedDate} selectedTime={selectedTime} onSelectTime={setSelectedTime} />
      <PartySizeStep partySize={partySize} onUpdatePartySize={setPartySize}  maxSeats={maxAvailableSeats}   />

      <SummaryBox
        selectedDate={selectedDate}
        selectedTime={selectedTime}
        partySize={partySize}
        isFormValid={isFormValid}
        maxSeats={maxAvailableSeats} 
        onBookTable={handleBookingClick}
      />
    </div>
  );
};