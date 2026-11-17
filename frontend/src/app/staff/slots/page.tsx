import { StaffLayout } from '../../../components/layout/StaffLayout';
import { SlotSetupCard } from '../../../features/slot-setup/components/SlotSetupCard';

export default function SlotSetupPage() {
  return (
    <StaffLayout
      title="Set up slots"
      subtitle="Choose the day and time, then define the tables and seats, or reuse a previous setup."
    >
      {/* The card was made to overlap a banner (-mt-20); here there is no banner */}
      <div className="*:mt-0! *:mx-0!">
        <SlotSetupCard />
      </div>
    </StaffLayout>
  );
}