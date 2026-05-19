/**
 * usePermissions Hook
 * 
 * Provides easy access to permission checking functions for components.
 * Use this hook to determine whether to show/hide UI elements.
 * 
 * IMPORTANT: Do NOT disable buttons - HIDE them completely if user lacks permission.
 */

import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/hooks/usePlanOrders';
import {
  canAccessMenu,
  canPerformAction,
  canApproveOrder,
  isSuperAdmin,
  isAdminOrAbove,
  isViewer,
  canViewPurchasePrice,
  canViewSupplier,
  MenuKey,
  ModuleType,
  ActionType,
} from '@/lib/permissions';

export function usePermissions() {
  const { user } = useAuth();
  const { allowAdminApprove } = useSettings();
  
  const role = user?.role;

  return useMemo(() => ({
    /**
     * Check if user can access a menu/page
     */
    canAccessMenu: (menuKey: MenuKey) => canAccessMenu(role, menuKey),
    
    /**
     * Check if user can perform an action on a module
     * Use this to show/hide action buttons (Create, Edit, Delete, etc.)
     */
    canPerformAction: (module: ModuleType, action: ActionType) => 
      canPerformAction(role, module, action),
    
    /**
     * Check if user can approve orders
     * Takes into account the allowAdminApprove setting
     */
    canApproveOrder: (module: 'plan_order' | 'sales_order' | 'stock_adjustment') => 
      canApproveOrder(role, module, allowAdminApprove),
    
    /**
     * Check if user is super_admin
     */
    isSuperAdmin: () => isSuperAdmin(role),
    
    /**
     * Check if user is admin or super_admin
     */
    isAdminOrAbove: () => isAdminOrAbove(role),
    
    /**
     * Check if user is viewer (read-only)
     */
    isViewer: () => isViewer(role),
    
    /**
     * Check if user can view purchase price
     * Only super_admin, admin, finance, purchasing can see it
     */
    canViewPurchasePrice: () => canViewPurchasePrice(role),

    /**
     * Check if user can view supplier info
     * Hidden from sales and viewer roles
     */
    canViewSupplier: () => canViewSupplier(role),

    /**
     * Get current user role
     */
    role,
    
    /**
     * Check if user can create in a module
     */
    canCreate: (module: ModuleType) => canPerformAction(role, module, 'create'),
    
    /**
     * Check if user can edit in a module
     */
    canEdit: (module: ModuleType) => canPerformAction(role, module, 'edit'),
    
    /**
     * Check if user can delete in a module
     */
    canDelete: (module: ModuleType) => canPerformAction(role, module, 'delete'),
    
    /**
     * Check if user can cancel in a module
     */
    canCancel: (module: ModuleType) => canPerformAction(role, module, 'cancel'),
    
    /**
     * Check if user can upload in a module
     */
    canUpload: (module: ModuleType) => canPerformAction(role, module, 'upload'),
    
    /**
     * Check if user can print in a module
     */
    canPrint: (module: ModuleType) => canPerformAction(role, module, 'print'),
    
  }), [role, allowAdminApprove]);
}

export default usePermissions;
