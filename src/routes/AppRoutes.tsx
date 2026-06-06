import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginScreen } from '../pages/LoginScreen';
import { CaixaPDV } from '../pages/CaixaPDV';
import { AdminDashboard } from '../pages/AdminDashboard';
import { SuperDashboard } from '../pages/SuperDashboard';
import { RouteGuard } from './RouteGuard';

export function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Rota Pública de Login */}
        <Route path="/login" element={<LoginScreen />} />

        {/* Rota Protegida do Operador de Caixa (Frente de Caixa/PDV) */}
        <Route
          path="/pdv"
          element={
            <RouteGuard requiredRole="OPERADOR_CAIXA">
              <CaixaPDV />
            </RouteGuard>
          }
        />

        {/* Rota Protegida do Gerente Operacional (Relatórios, Estoque, Sessões de Caixa) */}
        <Route
          path="/admin"
          element={
            <RouteGuard requiredRole="ADMIN_OPERACIONAL">
              <AdminDashboard />
            </RouteGuard>
          }
        />

        {/* Rota Protegida do TI / Diretor (Gestão de Equipe, Whitelist, Configurações Estruturais e Backups JSON) */}
        <Route
          path="/super-admin"
          element={
            <RouteGuard requiredRole="SUPER_ADMIN">
              <SuperDashboard />
            </RouteGuard>
          }
        />

        {/* Redirecionamento Padrão */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
