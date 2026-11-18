import React from 'react';
import { AlertCircle } from 'lucide-react';
import { useStaffReservation } from '../hooks/useStaffReservation';
import { RequirementsStep } from '../../reservation/components/RequirementsStep';
import { hikerProblem } from '../utils/hikerDetails';
import { Panel } from './Panel';
import { ServicePanel } from './ServicePanel';
import { PartyPanel } from './PartyPanel'
import { HikerPicker } from './HikerPicker';
import { ReservationSummary } from './ReservationSummary';
import { ReservationReceipt } from './ReservationReceipt';

// The staff desk: the choices on the left, what will be reserved (and the button) on the right
export const StaffReservationDesk: React.FC = () => {
  const s = useStaffReservation();

  return (
    <>
      {s.error && (
        <div role="alertdialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-red-100 space-y-4">
            <div className="w-12 h-12 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="font-serif font-bold text-lg text-[#1C2826]">Reservation not made</h3>
              <p className="text-xs text-[#5A6865] leading-relaxed">{s.error}</p>
            </div>
            <button
              type="button"
              onClick={s.clearError}
              autoFocus
              className="w-full py-3 bg-[#1C2826] text-white rounded-xl font-medium text-xs hover:bg-black transition-colors cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {s.reservation && s.reservedFor ? (
        <ReservationReceipt reservation={s.reservation} reservedFor={s.reservedFor} onNew={s.startAnother} />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
          <div className="space-y-6">
            {s.prefillNotice && (
              <div role="status" className="p-4 bg-[#FDF6E3] border border-[#EBD9A8] rounded-2xl text-xs text-[#6B5200]">
                {s.prefillNotice}
              </div>
            )}

            <Panel step={1} title="Service" hint="Day and meal time" done={s.selectedTime !== null}>
              <ServicePanel
                selectedDate={s.selectedDate}
                onSelectDate={s.setSelectedDate}
                slots={s.slots}
                loading={s.slotsLoading}
                error={s.slotsError}
                selectedTime={s.selectedTime}
                onSelectTime={s.setSelectedTime}
              />
            </Panel>

            <Panel step={2} title="Party size" hint="How many people" done={s.selectedTime !== null}>
              <PartyPanel
                partySize={s.partySize}
                maxSeats={s.maxAvailableSeats}
                hasService={s.selectedTime !== null}
                onChange={s.setPartySize}
              />
            </Panel>

            <Panel step={3} title="Guest" hint="Who the reservation is for" done={hikerProblem(s.hiker) === null}>
              <HikerPicker
                hiker={s.hiker}
                onModeChange={s.setHikerMode}
                onSelect={s.selectHiker}
                onQuickChange={s.updateQuick}
                onAccountChange={s.updateAccount}
                onStartNew={s.startNewHiker}
              />
            </Panel>

            <Panel step={4} title="Food needs" hint="Optional">
              <RequirementsStep
                staff
                rows={s.requirementRows.rows}
                partySize={s.partySize}
                onAdd={s.requirementRows.add}
                onRemove={s.requirementRows.remove}
                onChange={s.requirementRows.update}
              />
            </Panel>
          </div>

          <ReservationSummary
            selectedDate={s.selectedDate}
            selectedTime={s.selectedTime}
            partySize={s.partySize}
            hiker={s.hiker}
            foodNeedCount={s.requirementRows.rows.length}
            missing={s.missing}
            canSubmit={s.canSubmit}
            isSubmitting={s.isSubmitting}
            onSubmit={s.submit}
          />
        </div>
      )}
    </>
  );
};