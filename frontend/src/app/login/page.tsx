import React from 'react';
import { Header } from '../../components/layout/Header';
import { LoginForm } from '../../features/auth/components/LoginForm';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#FDFBF7] flex flex-col font-sans overflow-x-hidden">
      <Header />

      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <LoginForm />
      </main>

      <footer className="bg-[#1C2826] text-white py-6 px-12 text-center text-xs text-gray-400 border-t border-[#2C3835]">
        © 2026 Mountain Hut Refuge. Secure Authentication Portal.
      </footer>
    </div>
  );
};