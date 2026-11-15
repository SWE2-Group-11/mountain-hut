// Same reference as in the confirmation email: MH- and the booking id on six digits
export const bookingReference = (id: number): string => `MH-${String(id).padStart(6, '0')}`;