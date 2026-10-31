import { Routes, Route } from 'react-router-dom';
import HomePage from './app/page';
import LoginPage from './app/login/page';
import './App.css';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
     
    </Routes>
  );
}