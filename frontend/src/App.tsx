import { Routes, Route } from 'react-router-dom';
import HomePage from './app/page';
import LoginPage from './app/login/page';
import './App.css';
import BookTablePage from './app/booking/page';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/book-table" element={<BookTablePage />} />
     
    </Routes>
  );
}