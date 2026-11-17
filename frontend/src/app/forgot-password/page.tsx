import { Header } from '../../components/layout/Header';
import { ForgotPasswordForm } from '../../features/auth/components/ForgotPasswordForm';

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen bg-[#FDFBF7] flex flex-col font-sans overflow-x-hidden">
      <Header />

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <ForgotPasswordForm />
      </main>
    </div>
  );
}