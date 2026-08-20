import { Navigate, Route, Routes } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import Login from './pages/Login.jsx';
import ManageTrucks from './pages/ManageTrucks.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/manage-trucks" element={<ManageTrucks />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
