import { Header } from '../../components/layout/Header';
import { ResetPasswordForm } from '../../features/auth/components/ResetPasswordForm';

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-[#FDFBF7] flex flex-col font-sans overflow-x-hidden">
      <Header />

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <ResetPasswordForm />
      </main>
    </div>
  );
}