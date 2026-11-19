import { Header } from '../../components/layout/Header';
import { RegisterForm } from '../../features/auth/components/RegisterForm';

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-[#FDFBF7] flex flex-col font-sans overflow-x-hidden">
      <Header />

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <RegisterForm />
      </main>
    </div>
  );
}