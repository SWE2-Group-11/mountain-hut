import { Routes, Route } from 'react-router-dom';
import HomePage from './app/page';
import LoginPage from './app/login/page';
import './App.css';
import BookTablePage from './app/booking/page';
import SlotSetupPage from './app/staff/slots/page';
import { ProtectedRoute } from './features/auth/ProtectedRoute';
import AvailabilityPage from './features/availability/page';
import MyBookingsPage from './features/my-bookings/page';
import StaffReservePage from './app/staff/slots/reserve/page';
import RegisterPage from './app/register/page';
import ChangePasswordPage from './app/change-password/page';
import ForgotPasswordPage from './app/forgot-password/page';
import ResetPasswordPage from './app/reset-password/page';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/availability" element={<AvailabilityPage />} />

      {/* Any logged-in person, whatever the role: the forced change of a temporary password */}
      <Route element={<ProtectedRoute />}>
        <Route path="/change-password" element={<ChangePasswordPage />} />
      </Route>

      <Route element={<ProtectedRoute allowedRoles={['hiker']} />}>
        <Route path="/book-table" element={<BookTablePage />} />
        <Route path="/my-bookings" element={<MyBookingsPage />} />
      </Route>

      <Route element={<ProtectedRoute allowedRoles={['employee', 'warden']} />}>
        <Route path="/staff/slots" element={<SlotSetupPage />} />
        <Route path="/staff/reserve" element={<StaffReservePage />} />
      </Route>
    </Routes>
  );
}