import { Header } from '../../components/layout/Header';
import { MyBookings } from '../../features/my-bookings/components/MyBookings';

export default function MyBookingsPage() {
  return (
    <div className="min-h-screen bg-[#FDFBF7] flex flex-col font-sans">
      <Header />

      <main className="flex-1 w-full px-6 py-12">
        <MyBookings />
      </main>
    </div>
  );
}