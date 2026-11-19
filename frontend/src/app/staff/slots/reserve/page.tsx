import { StaffLayout } from '../../../../components/layout/StaffLayout';
import { RepeatWeekCard } from '../../../../features/repeat-week/components/RepeatWeekCard';

export default function RepeatWeekPage() {
  return (
    <StaffLayout
      title="Copy a week"
      subtitle="Set up many weeks at once: copy the slots of a week you already prepared into the weeks that follow."
    >
      <RepeatWeekCard />
    </StaffLayout>
  );
}