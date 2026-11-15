import React, { useEffect, useRef } from 'react';
import type { Reservation } from '../../reservation/types/reservation.types';
import { DatePickerStep } from '../../reservation/components/DatePickerStep';
import { TimeSlotStep } from '../../reservation/components/TimeSlotStep';
import { PartySizeStep } from '../../reservation/components/PartySizeStep';
import { RequirementsStep } from '../../reservation/components/RequirementsStep';
import { useChangeBooking } from '../hooks/useChangeBooking';
import { AlertCircle, Loader2, Pencil, Plus, UtensilsCrossed } from 'lucide-react';
interface ChangeBookingPanelProps {
    booking: Reservation;
    onSaved: (updated: Reservation) => void;
    onClose: () => void;
}

export const ChangeBookingPanel: React.FC<ChangeBookingPanelProps> = ({ booking, onSaved, onClose }) => {
    const change = useChangeBooking(booking, onSaved);
    const errorRef = useRef<HTMLDivElement>(null);
    const requirements = booking.requirements ?? [];

    // The form is long: when the server refuses the change, bring the reason into view
    useEffect(() => {
        if (!change.error || !errorRef.current) return;
        errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        errorRef.current.focus({ preventScroll: true });
    }, [change.error]);

    // A form, so that Enter in any field saves the changes, like the button does
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        change.save();
    };

    return (
        <form onSubmit={handleSubmit} noValidate className="border-t border-[#EFEADF] pt-6 space-y-2">
            <h3 className="text-lg font-serif font-bold text-[#1C2826]">Change your booking</h3>
            <p className="text-sm text-[#5A6865] mb-4">Change only what you need: the rest stays as it is.</p>

            <DatePickerStep selectedDate={change.selectedDate} onSelectDate={change.setSelectedDate} />

            <TimeSlotStep
                selectedDate={change.selectedDate}
                selectedTime={change.selectedTime}
                slots={change.slotOptions}
                loading={change.slotsLoading}
                error={change.slotsError}
                onSelectTime={change.chooseTime}
            />

            <PartySizeStep
                partySize={change.partySize}
                onUpdatePartySize={change.setPartySize}
                maxSeats={change.maxSeats}
            />

            {change.editingRequirements ? (
                <div>
                    <RequirementsStep
                        rows={change.requirementRows.rows}
                        partySize={change.partySize}
                        onAdd={change.requirementRows.add}
                        onRemove={change.requirementRows.remove}
                        onChange={change.requirementRows.update}
                    />
                    <p className="text-xs text-[#5A6865] -mt-5 mb-4">
                        {requirements.length > 0
                            ? 'Edit the notes, add another or remove one. Remove them all to clear the food needs. '
                            : 'Add who has a food need or an allergy. '}
                        <button
                            type="button"
                            onClick={change.cancelRequirementsEdit}
                            className="font-semibold text-[#234E39] hover:underline cursor-pointer"
                        >
                            Cancel food changes
                        </button>
                    </p>
                </div>
            ) : (
                <div className="mb-8">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#5A6865] flex items-center gap-2 mb-3">
                        <UtensilsCrossed className="w-4 h-4 text-[#234E39]" />
                        4. Food needs
                    </span>
                    <div className="bg-[#FAF6EE] border border-[#EFEADF] rounded-2xl p-4 space-y-3">
                        {requirements.length === 0 ? (
                            <p className="text-sm text-[#5A6865]">No food needs on this booking.</p>
                        ) : (
                            <ul className="space-y-1.5 text-sm">
                                {requirements.map((requirement, index) => (
                                    <li
                                        key={index}
                                        className={`px-3 py-1.5 rounded-xl ${requirement.hasAllergies ? 'bg-[#FDECEC] text-[#B00020] font-semibold' : 'bg-white text-[#1C2826]'
                                            }`}
                                    >
                                        {requirement.hasAllergies && 'Allergy: '}
                                        {requirement.details}
                                    </li>
                                ))}
                            </ul>
                        )}
                        <button
                            type="button"
                            onClick={change.editRequirements}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#234E39] bg-white text-[#234E39] text-sm font-semibold hover:bg-[#EAF3EE] transition-colors cursor-pointer"
                        >
                            {requirements.length === 0 ? <Plus className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
                            {requirements.length === 0 ? 'Add food needs' : 'Edit food needs'}
                        </button>
                        {requirements.length > 0 && (
                            <p className="text-xs text-[#5A6865]">Change who has a need, add another or remove one.</p>
                        )}
                    </div>
                </div>
            )}

            {change.error && (
                <div
                    ref={errorRef}
                    tabIndex={-1}
                    role="alert"
                    className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-700 text-sm focus:outline-none"
                >
                    <AlertCircle className="w-5 h-5 shrink-0 text-red-500 mt-0.5" />
                    <div>
                        <span className="font-bold block mb-0.5">Booking not changed</span>
                        {change.error} Your booking stays as it was.
                    </div>
                </div>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                    type="submit"
                    disabled={!change.canSave}
                    className="flex items-center gap-2 px-6 py-3 bg-[#234E39] text-white rounded-xl text-sm font-medium hover:bg-[#1C3E2E] transition-colors disabled:opacity-40 disabled:hover:bg-[#234E39] cursor-pointer disabled:cursor-not-allowed"
                >
                    {change.saving ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                        </>
                    ) : (
                        'Save changes'
                    )}
                </button>
                <button
                    type="button"
                    onClick={onClose}
                    disabled={change.saving}
                    className="px-6 py-3 bg-white border border-[#EFEADF] text-[#1C2826] rounded-xl text-sm font-medium hover:bg-[#EFE4D2] transition-colors cursor-pointer"
                >
                    Discard changes
                </button>
                {!change.hasChanges && <span className="text-xs text-[#7C8885]">Nothing has changed yet.</span>}
            </div>
        </form>
    );
};