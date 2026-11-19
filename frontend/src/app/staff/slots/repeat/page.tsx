import { StaffLayout } from '../../../../components/layout/StaffLayout';
import { RepeatWeekCard } from '../../../../features/repeat-week/components/RepeatWeekCard';

export default function RepeatWeekPage() {
  return (
    <StaffLayout
      title="Repeat a week"
      subtitle="Copy the slots of one week into one or more later weeks, instead of setting them up one by one."
    >
      <RepeatWeekCard />
    </StaffLayout>
  );
}