import { Header } from '../../components/layout/Header';
import { ChangePasswordForm } from '../../features/auth/components/ChangePasswordForm';

export default function ChangePasswordPage() {
  return (
    <div className="min-h-screen bg-[#FDFBF7] flex flex-col font-sans overflow-x-hidden">
      <Header />

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <ChangePasswordForm />
      </main>
    </div>
  );
}