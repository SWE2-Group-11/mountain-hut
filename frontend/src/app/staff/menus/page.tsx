import { StaffLayout } from '../../../components/layout/StaffLayout';
import { MenusBoard } from '../../../features/slot-menus/components/MenusBoard';

export default function MenusPage() {
  return (
    <StaffLayout
      title="Menus"
      subtitle="Write the menu of each slot, so that hikers know what the hut serves. A menu can be changed or removed until its slot starts."
    >
      <MenusBoard />
    </StaffLayout>
  );
}