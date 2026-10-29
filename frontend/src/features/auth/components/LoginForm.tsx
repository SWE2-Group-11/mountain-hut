import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, ShieldCheck, Mail, Lock, ArrowRight } from 'lucide-react';

export const LoginForm: React.FC = () => {
  const navigate = useNavigate();
  const [loginType, setLoginType] = useState<'user' | 'staff'>('user');
 const [staffRole, setStaffRole] = useState<'Employee' | 'Warden'>('Employee');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate login routing based on role
    if (loginType === 'staff') {
      console.log(`Logging in as staff role: ${staffRole}`);
      navigate(`/staff/dashboard/${staffRole}`);
    } else {
      console.log('Logging in as standard user');
      navigate('/');
    }
  };

  return (
    <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-sm border border-[#EFEADF]">
      
      {/* Top Toggle: User vs Staff */}
      <div className="flex bg-[#FAF6EE] p-1.5 rounded-2xl mb-8 border border-[#EFEADF]">
        <button
          type="button"
          onClick={() => setLoginType('user')}
          className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
            loginType === 'user' 
              ? 'bg-[#1C2826] text-white shadow-sm' 
              : 'text-[#5A6865] hover:text-[#1C2826]'
          }`}
        >
          <User className="w-4 h-4" /> Hiker / Guest
        </button>
        <button
          type="button"
          onClick={() => setLoginType('staff')}
          className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 ${
            loginType === 'staff' 
              ? 'bg-[#1C2826] text-white shadow-sm' 
              : 'text-[#5A6865] hover:text-[#1C2826]'
          }`}
        >
          <ShieldCheck className="w-4 h-4" /> Hut Staff
        </button>
      </div>

      <div className="mb-6">
        <h2 className="text-2xl font-serif font-bold text-[#1C2826] mb-1">
          {loginType === 'staff' ? 'Staff Portal Access' : 'Welcome'}
        </h2>
        <p className="text-xs text-[#5A6865]">
          {loginType === 'staff' 
            ? 'Select your employee role and enter credentials.' 
            : 'Enter your credentials to manage your refuge bookings.'}
        </p>
      </div>

      <form onSubmit={handleLogin} className="space-y-4">
        
        {/* Staff Role Selector (Only shown if 'Staff' is selected) */}
        {loginType === 'staff' && (
          <div className="space-y-1.5 pb-2">
            <label className="text-xs font-bold uppercase tracking-wider text-[#234E39]">
              Employee Role
            </label>
            <select
              value={staffRole}
              onChange={(e) => setStaffRole(e.target.value as any)}
              className="w-full px-4 py-3 bg-[#FAF6EE] border border-[#EFEADF] rounded-xl text-sm font-medium text-[#1C2826] focus:outline-none focus:border-[#234E39] transition-all"
            >
             
              <option value="employee">Employee</option>
              {/* <option value="warden">Warden </option> */}
            </select>
          </div>
        )}

        {/* Email Field */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-[#5A6865]">
            Email Address
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-[#7C8885] absolute left-4 top-3.5" />
            <input
              type="email"
              required
              placeholder={loginType === 'staff' ? 'staff@mountainhut.it' : 'hiker@example.com'}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-[#FDFBF7] border border-[#EFEADF] rounded-xl text-sm text-[#1C2826] focus:outline-none focus:border-[#234E39] transition-all"
            />
          </div>
        </div>

        {/* Password Field */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-[#5A6865]">
            Password
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-[#7C8885] absolute left-4 top-3.5" />
            <input
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-[#FDFBF7] border border-[#EFEADF] rounded-xl text-sm text-[#1C2826] focus:outline-none focus:border-[#234E39] transition-all"
            />
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          className="w-full mt-2 py-3.5 bg-[#234E39] text-white font-medium rounded-xl hover:bg-[#1C3E2E] transition-all shadow-sm flex items-center justify-center gap-2 text-sm"
        >
          <span>Sign In</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};