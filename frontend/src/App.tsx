import { Routes, Route } from 'react-router-dom';
import HomePage from './app/page';
import LoginPage from './app/login/page';
import './App.css';
import BookTablePage from './app/booking/page';
import { ProtectedRoute } from './features/auth/ProtectedRoute';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute allowedRoles={['hiker']} />}>
        <Route path="/book-table" element={<BookTablePage />} />
      </Route>

    </Routes>
  );
}