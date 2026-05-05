import type { Notification } from '@/hooks/useNotifications';

/**
 * Standardized notification deep-link scheme.
 *
 * Every link produced here includes a canonical `?type=<notifType>&id=<refId>`
 * pair so consumers can identify the source uniformly. For backward-compat,
 * we ALSO append the legacy param each target page already listens to
 * (`card`, `id`, `productId`) — that way existing useSearchParams handlers in
 * RequestDelivery / PlanOrder / SalesOrder / StockAdjustment / DataStock /
 * ExpiryAlert keep working without changes.
 */
export function buildNotificationDeepLink(notif: Notification): string {
  const type = notif.type;
  const refId = notif.refId || '';
  const productId = notif.productId || '';

  // Stock & expiry alerts → product-centric pages
  if (type === 'low_stock') {
    const base = '/data-stock';
    if (!productId) return base;
    return `${base}?type=${type}&id=${productId}&productId=${productId}`;
  }
  if (type === 'expiring_soon' || type === 'expired') {
    const base = '/reports/expiry';
    if (!productId) return base;
    return `${base}?type=${type}&id=${productId}&productId=${productId}`;
  }

  // Module-based routing (approval, revision, comments, urgent, etc.)
  const moduleRoutes: Record<string, { path: string; legacyParam: string }> = {
    plan_order: { path: '/plan-order', legacyParam: 'id' },
    sales_order: { path: '/sales-order', legacyParam: 'id' },
    stock_adjustment: { path: '/stock-adjustment', legacyParam: 'id' },
    stock_in: { path: '/stock-in', legacyParam: 'id' },
    stock_out: { path: '/stock-out', legacyParam: 'id' },
    delivery: { path: '/request-delivery', legacyParam: 'card' },
  };

  const route = notif.module ? moduleRoutes[notif.module] : undefined;
  if (route) {
    if (!refId) return route.path;
    return `${route.path}?type=${type}&id=${refId}&${route.legacyParam}=${refId}`;
  }

  // Fallback → notifications center
  return '/notifications';
}