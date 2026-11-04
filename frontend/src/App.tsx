import { Routes, Route } from 'react-router-dom';
import HomePage from './app/page';
import LoginPage from './app/login/page';
import './App.css';
import BookTablePage from './app/booking/page';
import SlotSetupPage from './app/staff/slots/page';
import { ProtectedRoute } from './features/auth/ProtectedRoute';
import AvailabilityPage from './features/availability/page';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/availability" element={<AvailabilityPage />} />

      <Route element={<ProtectedRoute allowedRoles={['hiker']} />}>
        <Route path="/book-table" element={<BookTablePage />} />
      </Route>

      <Route element={<ProtectedRoute allowedRoles={['employee', 'warden']} />}>
        <Route path="/staff/slots" element={<SlotSetupPage />} />
      </Route>
    </Routes>
  );
}