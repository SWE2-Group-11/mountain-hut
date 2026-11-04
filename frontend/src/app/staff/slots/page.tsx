import { Header } from '../../../components/layout/Header';
import { HeroBanner } from '../../../components/layout/HeroBanner';
import { SlotSetupCard } from '../../../features/slot-setup/components/SlotSetupCard';

export default function SlotSetupPage() {
  return (
    <div className="min-h-screen bg-[#FDFBF7] flex flex-col font-sans">
      <Header />
      <HeroBanner
        title="Set up slots"
        subtitle="Choose the day and time, then define the tables and seats, or reuse a previous setup."
      />
      <main className="flex-1 w-full mx-auto px-6 pb-16 flex justify-center">
        <SlotSetupCard />
      </main>
    </div>
  );
}
