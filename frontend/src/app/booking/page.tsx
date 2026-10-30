import { Header } from '../../components/layout/Header';
import { HeroBanner } from '../../components/layout/HeroBanner';
import { ReservationCard } from '../../features/reservation/components/ReservationCard';

export default function BookTablePage() {
  return (
    <div className="min-h-screen bg-[#FDFBF7] flex flex-col font-sans">
      <Header />
      <HeroBanner />

    
      <main className="flex-1 max-w-4xl w-full mx-auto px-6 py-12 flex justify-center items-center">
        <ReservationCard />
      </main>
    </div>
  );
}