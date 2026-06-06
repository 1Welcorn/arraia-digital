import React from 'react';
import { Navigate } from 'react-router-dom';
import { authLocalService } from '../services/authLocalService';

interface RouteGuardProps {
  children: React.ReactNode;
  requiredRole?: 'SUPER_ADMIN' | 'ADMIN_OPERACIONAL' | 'OPERADOR_CAIXA';
}

export function RouteGuard({ children, requiredRole }: RouteGuardProps) {
  const isAuth = authLocalService.isAuthenticated();

  if (!isAuth) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && !authLocalService.checkRole(requiredRole)) {
    const currentUser = authLocalService.getCurrentUser();
    
    if (currentUser?.role === 'OPERADOR_CAIXA') {
      return <Navigate to="/pdv" replace />;
    }
    
    return <Navigate to="/admin" replace />;
  }

  return <>{children}</>;
}
