import { StaffLayout } from '../../../../components/layout/StaffLayout';
import { StaffReservationDesk } from '../../../../features/staff-reservation/components/StaffReservationDesk';

export default function StaffReservePage() {
  return (
    <StaffLayout title="Reserve for a hiker" subtitle="Enter a reservation for a guest who is here or on the phone.">
      <div className="max-w-5xl">
        <StaffReservationDesk />
      </div>
    </StaffLayout>
  );
}