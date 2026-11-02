import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Receipt, Calendar, Clock, Users } from 'lucide-react';
import { useReservation } from '../hooks/useReservation';
import { DatePickerStep } from './DatePickerStep';
import { TimeSlotStep } from './TimeSlotStep';
import { PartySizeStep } from './PartySizeStep';
import { SummaryBox } from './SummaryBox';

const formatLongDate = (date: Date) =>
  date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

export const ReservationCard: React.FC = () => {
  const navigate = useNavigate();
  const {
    selectedDate,
    selectedTime,
    partySize,
    slots,
    slotsLoading,
    slotsError,
    setSelectedDate,
    setSelectedTime,
    maxAvailableSeats,
    setPartySize,
    isFormValid,
    isSubmitting,
    bookingError,
    reservation,
    confirmReservation,
    clearError,
  } = useReservation();

  // The receipt shows what the server confirmed, not what the form held
  const receiptDate = reservation
    ? formatLongDate(new Date(`${reservation.date}T00:00:00`))
    : '';

  return (
    <div className="w-full max-w-2xl mx-auto bg-white rounded-[32px] p-10 shadow-xl border border-[#EFEADF] relative -mt-20 space-y-6">
      {/* ERROR MODAL POPUP */}
      {bookingError && (
        <div
          role="alertdialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
        >
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-red-100 space-y-4 relative">
            <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="font-serif font-bold text-lg text-[#1C2826]">Booking not completed</h3>
              <p className="text-xs text-[#5A6865] leading-relaxed">{bookingError}</p>
            </div>
            <button
              type="button"
              onClick={clearError}
              className="w-full py-3 bg-[#1C2826] text-white rounded-xl font-medium text-xs hover:bg-black transition-colors cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* SUCCESS RECEIPT VIEW (replaces the form after a successful booking) */}
      {reservation ? (
        <div className="bg-[#FAF6EE] border-2 border-dashed border-[#D4CDBA] rounded-3xl p-8 space-y-6 text-[#1C2826] relative">
          {/* Header */}
          <div className="text-center border-b border-[#EFEADF] pb-6 space-y-2">
            <div className="w-12 h-12 bg-[#234E39] text-white rounded-2xl flex items-center justify-center mx-auto shadow-sm">
              <Receipt className="w-6 h-6" />
            </div>
            <span className="text-[10px] uppercase font-bold tracking-widest text-[#7C8885]">
              Reservation Voucher
            </span>
            <h2 className="text-2xl font-serif font-bold">Mountain Hut Refuge</h2>
            <p className="text-xs text-[#5A6865]">Booking #{reservation.id} confirmed</p>
          </div>

          {/* Details */}
          <div className="space-y-4 text-xs">
            <div className="flex justify-between items-center py-2 border-b border-[#EFEADF]">
              <span className="text-[#7C8885] flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-[#234E39]" /> Date
              </span>
              <span className="font-semibold text-[#1C2826]">{receiptDate}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-[#EFEADF]">
              <span className="text-[#7C8885] flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-[#234E39]" /> Time Slot
              </span>
              <span className="font-semibold text-[#1C2826]">{reservation.slot}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-[#EFEADF]">
              <span className="text-[#7C8885] flex items-center gap-1.5">
                <Users className="w-4 h-4 text-[#234E39]" /> Party Size
              </span>
              <span className="font-semibold text-[#1C2826]">
                {reservation.partySize} {reservation.partySize === 1 ? 'Guest' : 'Guests'}
              </span>
            </div>

            {/* Table assignment decided by the server */}
            <div className="bg-white rounded-2xl p-4 border border-[#EFEADF] space-y-2">
              <span className="font-bold text-[#234E39] block uppercase tracking-wider text-[10px]">
                Assigned Seating
              </span>
              <p className="text-[#5A6865]">
                {reservation.seatings.length > 1
                  ? 'Your party is seated across the following shared tables:'
                  : 'Your party is seated together at:'}
              </p>
              <ul className="space-y-1 font-medium pt-1">
                {reservation.seatings.map((seating) => (
                  <li
                    key={seating.table_number}
                    className="flex justify-between items-center bg-[#FAF6EE] px-3 py-1.5 rounded-xl"
                  >
                    <span className="text-[#1C2826]">Table {seating.table_number}</span>
                    <span className="text-[#234E39] font-bold">{seating.assigned_seats} seats</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center pt-2">
            <p className="text-[10px] text-[#7C8885]">
              Please show this confirmation on arrival. Tables are shared with other guests.
            </p>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="mt-4 px-6 py-2.5 bg-[#234E39] text-white rounded-xl font-medium text-xs hover:bg-[#1C3E2E] transition-colors cursor-pointer"
            >
              Go Back Home
            </button>
          </div>
        </div>
      ) : (
        /* STANDARD FORM VIEW */
        <>
          <div className="mb-2">
            <h2 className="text-3xl font-serif font-bold text-[#1C2826] mb-2">Reserve your table</h2>
            <p className="text-[#5A6865] text-sm">Choose your meal time and party size.</p>
          </div>

          <DatePickerStep selectedDate={selectedDate} onSelectDate={setSelectedDate} />

          <TimeSlotStep
            selectedDate={selectedDate}
            selectedTime={selectedTime}
            slots={slots}
            loading={slotsLoading}
            error={slotsError}
            onSelectTime={setSelectedTime}
          />

          <PartySizeStep
            partySize={partySize}
            onUpdatePartySize={setPartySize}
            maxSeats={maxAvailableSeats}
          />

          <SummaryBox
            selectedDate={selectedDate}
            selectedTime={selectedTime}
            partySize={partySize}
            isFormValid={isFormValid}
            isSubmitting={isSubmitting}
            maxSeats={maxAvailableSeats}
            onBookTable={confirmReservation}
          />
        </>
      )}
    </div>
  );
};