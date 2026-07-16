/**
 * RBAC Permissions Configuration
 * 
 * This file defines the complete Role-Based Access Control system for the application.
 * All permission checks should use these utilities to ensure consistency.
 * 
 * ROLES (LOCKED - NO ADDITIONAL ROLES):
 * - super_admin: Full system authority
 * - admin: Operational with restrictions
 * - finance: Limited to financial operations
 * - purchasing: Limited to purchasing operations
 * - warehouse: Limited to warehouse operations
 * - sales: Limited to sales operations
 * - viewer: Read-only access
 */

import { UserRole } from '@/contexts/AuthContext';

// ============================================================================
// ROLE DEFINITIONS
// ============================================================================

export const ROLES = {
  SUPER_ADMIN: 'super_admin' as UserRole,
  ADMIN: 'admin' as UserRole,
  FINANCE: 'finance' as UserRole,
  PURCHASING: 'purchasing' as UserRole,
  WAREHOUSE: 'warehouse' as UserRole,
  SALES: 'sales' as UserRole,
  VIEWER: 'viewer' as UserRole,
} as const;

// ============================================================================
// MENU ACCESS CONFIGURATION
// ============================================================================

export type MenuKey = 
  | 'dashboard'
  | 'requestDelivery'
  | 'planOrder'
  | 'stockIn'
  | 'salesOrder'
  | 'proformaInvoice'
  | 'stockOut'
  | 'stockAdjustment'
  | 'deliveryOrder'
  | 'products'
  | 'categories'
  | 'units'
  | 'suppliers'
  | 'customers'
  | 'dataStock'
  | 'userManagement'
  | 'settings'
  | 'stockReport'
  | 'inboundReport'
  | 'outboundReport'
  | 'stockMovement'
  | 'expiryAlert'
  | 'adjustmentLog'
  | 'auditLog'
  | 'trackerPO'
  | 'dualBoard'
  | 'trackerKalibrasi';

/**
 * Menu visibility configuration
 * Defines which roles can SEE each menu item
 */
export const MENU_ACCESS: Record<MenuKey, UserRole[]> = {
  // Dashboard - All roles
  dashboard: ['super_admin', 'admin', 'finance', 'purchasing', 'warehouse', 'sales', 'viewer'],
  
  // Request Delivery - All roles can view
  requestDelivery: ['super_admin', 'admin', 'finance', 'purchasing', 'warehouse', 'sales', 'viewer'],
  
  // Transactions
  planOrder: ['super_admin', 'admin', 'finance', 'purchasing', 'warehouse'],
  stockIn: ['super_admin', 'admin', 'warehouse'],
  salesOrder: ['super_admin', 'admin', 'finance', 'purchasing', 'sales', 'warehouse'],
  proformaInvoice: ['super_admin', 'admin', 'finance', 'purchasing', 'sales'],
  stockOut: ['super_admin', 'admin', 'warehouse'],
  stockAdjustment: ['super_admin', 'admin', 'finance'], // Hide from warehouse
  deliveryOrder: ['super_admin', 'admin', 'finance', 'purchasing', 'warehouse'],
  
  // Master Data - Products (Finance can now view these)
  products: ['super_admin', 'admin', 'finance', 'purchasing', 'warehouse', 'sales'],
  categories: ['super_admin', 'admin', 'finance', 'purchasing'],
  units: ['super_admin', 'admin', 'finance', 'purchasing'],
  suppliers: ['super_admin', 'admin', 'finance', 'purchasing'],
  customers: ['super_admin', 'admin', 'finance', 'sales'],
  dataStock: ['super_admin', 'admin', 'finance', 'purchasing', 'warehouse', 'sales', 'viewer'], // Add viewer
  
  // Admin Only
  userManagement: ['super_admin'],
  settings: ['super_admin'],
  
  // Reports - Role-based access
  stockReport: ['super_admin', 'admin', 'finance', 'purchasing', 'warehouse', 'sales', 'viewer'],
  inboundReport: ['super_admin', 'admin', 'finance', 'purchasing', 'warehouse', 'viewer'],
  outboundReport: ['super_admin', 'admin', 'finance', 'purchasing', 'sales', 'warehouse', 'viewer'],
  stockMovement: ['super_admin', 'admin', 'finance', 'purchasing', 'warehouse', 'viewer'],
  expiryAlert: ['super_admin', 'admin', 'finance', 'purchasing', 'warehouse', 'viewer'],
  adjustmentLog: ['super_admin', 'admin', 'finance', 'purchasing', 'warehouse', 'viewer'],
  auditLog: ['super_admin', 'admin'], // Purchasing not allowed
  trackerPO: ['super_admin', 'admin', 'finance', 'purchasing', 'warehouse', 'viewer'],
  dualBoard: ['super_admin', 'admin', 'finance', 'purchasing', 'warehouse', 'viewer'],
  trackerKalibrasi: ['super_admin', 'admin', 'finance', 'purchasing', 'warehouse', 'sales', 'viewer'],
};

// ============================================================================
// ACTION PERMISSIONS
// ============================================================================

export type ActionType = 
  | 'view'
  | 'create'
  | 'edit'
  | 'delete'
  | 'cancel'
  | 'approve'
  | 'upload'
  | 'print';

export type ModuleType = 
  | 'plan_order'
  | 'stock_in'
  | 'sales_order'
  | 'proforma_invoice'
  | 'stock_out'
  | 'stock_adjustment'
  | 'product'
  | 'category'
  | 'unit'
  | 'supplier'
  | 'customer'
  | 'user'
  | 'settings'
  | 'report';

/**
 * Action permissions by module
 * Defines which roles can perform which actions on each module
 */
export const ACTION_PERMISSIONS: Record<ModuleType, Record<ActionType, UserRole[]>> = {
  plan_order: {
    view: ['super_admin', 'admin', 'finance', 'purchasing', 'warehouse'],
    create: ['super_admin', 'admin', 'purchasing'],
    edit: ['super_admin', 'admin', 'purchasing'],
    delete: ['super_admin', 'admin'],
    cancel: ['super_admin', 'admin'],
    approve: ['super_admin', 'admin'], // Admin needs allowAdminApprove setting
    upload: ['super_admin', 'admin', 'purchasing'],
    print: ['super_admin', 'admin', 'finance', 'purchasing', 'warehouse'],
  },
  stock_in: {
    view: ['super_admin', 'admin', 'warehouse'],
    create: ['super_admin', 'admin', 'warehouse'],
    edit: ['super_admin', 'admin', 'warehouse'],
    delete: ['super_admin'],
    cancel: ['super_admin'],
    approve: ['super_admin'],
    upload: ['super_admin', 'admin', 'warehouse'],
    print: ['super_admin', 'admin', 'warehouse'],
  },
  sales_order: {
    view: ['super_admin', 'admin', 'finance', 'purchasing', 'sales', 'warehouse'],
    create: ['super_admin', 'admin', 'sales'],
    edit: ['super_admin', 'admin', 'sales'],
    delete: ['super_admin', 'admin'],
    cancel: ['super_admin', 'admin'],
    approve: ['super_admin', 'admin'], // Admin needs allowAdminApprove setting
    upload: ['super_admin', 'admin', 'sales'],
    print: ['super_admin', 'admin', 'finance', 'purchasing', 'sales', 'warehouse'],
  },
  proforma_invoice: {
    view: ['super_admin', 'admin', 'finance', 'purchasing', 'sales'],
    create: ['super_admin', 'sales'],
    edit: ['super_admin', 'finance', 'purchasing'],
    delete: ['super_admin', 'finance'],
    cancel: ['super_admin', 'admin', 'finance'],
    approve: ['super_admin', 'admin', 'finance', 'purchasing'],
    upload: ['super_admin', 'sales'],
    print: ['super_admin', 'admin', 'finance', 'purchasing', 'sales'],
  },
  stock_out: {
    view: ['super_admin', 'admin', 'warehouse'],
    create: ['super_admin', 'admin', 'warehouse'],
    edit: ['super_admin', 'admin', 'warehouse'],
    delete: ['super_admin'],
    cancel: ['super_admin'],
    approve: ['super_admin'],
    upload: ['super_admin', 'admin', 'warehouse'],
    print: ['super_admin', 'admin', 'warehouse'],
  },
  stock_adjustment: {
    view: ['super_admin', 'admin', 'finance'],
    create: ['super_admin', 'admin', 'finance'],
    edit: ['super_admin', 'admin', 'finance'],
    delete: ['super_admin', 'admin'],
    cancel: ['super_admin', 'admin'],
    approve: ['super_admin', 'admin'],
    upload: ['super_admin', 'admin', 'finance'],
    print: ['super_admin', 'admin', 'finance'],
  },
  product: {
    view: ['super_admin', 'admin', 'finance', 'purchasing', 'warehouse', 'sales'],
    create: ['super_admin', 'admin', 'finance', 'purchasing'],
    edit: ['super_admin', 'admin', 'finance', 'purchasing'],
    delete: ['super_admin', 'admin'],
    cancel: [],
    approve: [],
    upload: ['super_admin', 'admin', 'finance', 'purchasing'],
    print: ['super_admin', 'admin', 'finance', 'purchasing', 'warehouse', 'sales'],
  },
  category: {
    view: ['super_admin', 'admin', 'finance', 'purchasing'],
    create: ['super_admin', 'admin', 'finance', 'purchasing'],
    edit: ['super_admin', 'admin', 'finance', 'purchasing'],
    delete: ['super_admin', 'admin'],
    cancel: [],
    approve: [],
    upload: ['super_admin', 'admin', 'finance', 'purchasing'],
    print: ['super_admin', 'admin', 'finance', 'purchasing'],
  },
  unit: {
    view: ['super_admin', 'admin', 'finance', 'purchasing'],
    create: ['super_admin', 'admin', 'finance', 'purchasing'],
    edit: ['super_admin', 'admin', 'finance', 'purchasing'],
    delete: ['super_admin', 'admin'],
    cancel: [],
    approve: [],
    upload: ['super_admin', 'admin', 'finance', 'purchasing'],
    print: ['super_admin', 'admin', 'finance', 'purchasing'],
  },
  supplier: {
    view: ['super_admin', 'admin', 'finance', 'purchasing'],
    create: ['super_admin', 'admin', 'finance', 'purchasing'],
    edit: ['super_admin', 'admin', 'finance', 'purchasing'],
    delete: ['super_admin', 'admin'],
    cancel: [],
    approve: [],
    upload: ['super_admin', 'admin', 'finance', 'purchasing'],
    print: ['super_admin', 'admin', 'finance', 'purchasing'],
  },
  customer: {
    view: ['super_admin', 'admin', 'finance', 'sales'],
    create: ['super_admin', 'admin', 'finance'], // Sales removed, Finance added
    edit: ['super_admin', 'admin', 'finance'], // Sales removed, Finance added
    delete: ['super_admin', 'admin'],
    cancel: [],
    approve: [],
    upload: ['super_admin', 'admin', 'finance'], // Finance added
    print: ['super_admin', 'admin', 'finance', 'sales'],
  },
  user: {
    view: ['super_admin'],
    create: ['super_admin'],
    edit: ['super_admin'],
    delete: ['super_admin'],
    cancel: [],
    approve: [],
    upload: [],
    print: ['super_admin'],
  },
  settings: {
    view: ['super_admin'],
    create: ['super_admin'],
    edit: ['super_admin'],
    delete: ['super_admin'],
    cancel: [],
    approve: [],
    upload: [],
    print: [],
  },
  report: {
    view: ['super_admin', 'admin', 'finance', 'purchasing', 'warehouse', 'sales', 'viewer'],
    create: [],
    edit: [],
    delete: [],
    cancel: [],
    approve: [],
    upload: ['super_admin', 'admin', 'finance', 'purchasing', 'warehouse', 'sales'], // Export CSV
    print: ['super_admin', 'admin', 'finance', 'purchasing', 'warehouse', 'sales', 'viewer'],
  },
};

// ============================================================================
// PERMISSION CHECK FUNCTIONS
// ============================================================================

/**
 * Check if a user role can access a specific menu
 */
export function canAccessMenu(role: UserRole | undefined, menuKey: MenuKey): boolean {
  if (!role) return false;
  return MENU_ACCESS[menuKey]?.includes(role) ?? false;
}

/**
 * Check if a user role can perform a specific action on a module
 */
export function canPerformAction(
  role: UserRole | undefined, 
  module: ModuleType, 
  action: ActionType
): boolean {
  if (!role) return false;
  return ACTION_PERMISSIONS[module]?.[action]?.includes(role) ?? false;
}

/**
 * Check if user can approve orders
 * Admin requires allowAdminApprove setting to be true
 */
export function canApproveOrder(
  role: UserRole | undefined, 
  module: 'plan_order' | 'sales_order' | 'stock_adjustment',
  allowAdminApprove: boolean = false
): boolean {
  if (!role) return false;
  if (role === 'super_admin') return true;
  
  // For stock_adjustment, super_admin and admin can approve
  if (module === 'stock_adjustment') return role === 'admin';
  
  // For plan_order and sales_order, admin needs allowAdminApprove
  if (role === 'admin' && allowAdminApprove) return true;
  
  return false;
}

/**
 * Check if user is super_admin
 */
export function isSuperAdmin(role: UserRole | undefined): boolean {
  return role === 'super_admin';
}

/**
 * Check if user is admin or super_admin
 */
export function isAdminOrAbove(role: UserRole | undefined): boolean {
  return role === 'super_admin' || role === 'admin';
}

/**
 * Check if user is viewer (read-only)
 */
export function isViewer(role: UserRole | undefined): boolean {
  return role === 'viewer';
}

/**
 * Roles that can view purchase price
 * Only super_admin, admin, finance, and purchasing can see purchase_price
 */
export const PURCHASE_PRICE_VISIBLE_ROLES: UserRole[] = [
  'super_admin',
  'admin',
  'finance',
  'purchasing',
];

/**
 * Check if user can view purchase price
 * Only super_admin, admin, finance, and purchasing can see it
 */
export function canViewPurchasePrice(role: UserRole | undefined): boolean {
  if (!role) return false;
  return PURCHASE_PRICE_VISIBLE_ROLES.includes(role);
}

// Supplier info hidden from sales and viewer roles
export const SUPPLIER_VISIBLE_ROLES: UserRole[] = [
  'super_admin',
  'admin',
  'finance',
  'purchasing',
  'warehouse',
];

export function canViewSupplier(role: UserRole | undefined): boolean {
  if (!role) return false;
  return SUPPLIER_VISIBLE_ROLES.includes(role);
}

// ============================================================================
// ROUTE PROTECTION
// ============================================================================

/**
 * Route access configuration
 * Maps routes to menu keys for permission checking
 */
export const ROUTE_TO_MENU: Record<string, MenuKey> = {
  '/dashboard': 'dashboard',
  '/request-delivery': 'requestDelivery',
  '/plan-order': 'planOrder',
  '/stock-in': 'stockIn',
  '/sales-order': 'salesOrder',
  '/proforma-invoice': 'proformaInvoice',
  '/stock-out': 'stockOut',
  '/stock-adjustment': 'stockAdjustment',
  '/data-product/products': 'products',
  '/data-product/categories': 'categories',
  '/data-product/units': 'units',
  '/data-product/suppliers': 'suppliers',
  '/data-product/customers': 'customers',
  '/data-stock': 'dataStock',
  '/user-management': 'userManagement',
  '/settings': 'settings',
  '/reports/stock': 'stockReport',
  '/reports/inbound': 'inboundReport',
  '/reports/outbound': 'outboundReport',
  '/reports/movement': 'stockMovement',
  '/reports/expiry': 'expiryAlert',
  '/reports/adjustment': 'adjustmentLog',
  '/reports/audit': 'auditLog',
  '/tracker-po': 'trackerPO',
  '/dual-board': 'dualBoard',
  '/tracker-kalibrasi': 'trackerKalibrasi',
};

/**
 * Check if a user role can access a specific route
 */
export function canAccessRoute(role: UserRole | undefined, path: string): boolean {
  if (!role) return false;
  
  // Profile and notifications are always accessible
  if (path === '/profile' || path === '/notifications') return true;
  
  const menuKey = ROUTE_TO_MENU[path];
  if (!menuKey) return true; // Unknown routes are allowed by default
  
  return canAccessMenu(role, menuKey);
}
