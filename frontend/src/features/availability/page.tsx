import { Header } from '../../components/layout/Header';
import { StaffLayout } from '../../components/layout/StaffLayout';
import { AvailabilityCard } from '../../features/availability/components/ AvailabilityCard';
import { useAuth } from '../auth/useAuth';

export default function AvailabilityPage() {
  const { user } = useAuth();

  // Employees and the warden stay in their workspace
  if (user?.role === 'employee' || user?.role === 'warden') {
    return (
      <StaffLayout title="Check availability" subtitle="See if there is room for a party before you reserve.">
        <AvailabilityCard />
      </StaffLayout>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFBF7] flex flex-col font-sans">
      <Header />

      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-serif font-bold text-[#1C2826] mb-2">Is there a table for us?</h1>
          <p className="text-[#5A6865]">
            Check whether the hut has room for your party.
          </p>
        </div>
        <AvailabilityCard />
      </main>
    </div>
  );
}