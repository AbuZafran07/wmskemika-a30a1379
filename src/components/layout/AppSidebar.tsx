import React, { useState, useRef, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ClipboardList,
  ArrowDownToLine,
  Database,
  ShoppingCart,
  ArrowUpFromLine,
  Settings2,
  FileText,
  Users,
  ChevronDown,
  ChevronRight,
  Boxes,
  Tags,
  Ruler,
  Building2,
  UserCircle,
  FileBarChart,
  ClipboardCheck,
  Rows3,
  FlaskConical,
  History,
  Package,
  TrendingUpDown,
  CalendarClock,
  Truck,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { canAccessMenu, MenuKey } from "@/lib/permissions";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface MenuItem {
  key: string;
  menuKey?: MenuKey;
  labelKey: string;
  icon: React.ElementType;
  href?: string;
  subLabelKey?: string;
  children?: MenuItem[];
}

const menuItems: { groupKey: string; items: MenuItem[] }[] = [
  {
    groupKey: "menu.summary",
    items: [
      { key: "dashboard", menuKey: "dashboard", labelKey: "menu.dashboard", icon: LayoutDashboard, href: "/dashboard" },
      { key: "requestDelivery", menuKey: "requestDelivery", labelKey: "menu.requestDelivery", subLabelKey: "menu.requestDeliverySub", icon: Truck, href: "/request-delivery" },
      { key: "trackerPO", menuKey: "trackerPO", labelKey: "menu.trackerPO", subLabelKey: "menu.trackerPOSub", icon: ClipboardCheck, href: "/tracker-po" },
      { key: "trackerKalibrasi", menuKey: "trackerKalibrasi", labelKey: "menu.trackerKalibrasi", subLabelKey: "menu.trackerKalibrasiSub", icon: FlaskConical, href: "/tracker-kalibrasi" },
    ],
  },
  {
    groupKey: "menu.transactions",
    items: [
      { key: "planOrder", menuKey: "planOrder", labelKey: "menu.planOrder", subLabelKey: "menu.planOrderSub", icon: ClipboardList, href: "/plan-order" },
      { key: "stockIn", menuKey: "stockIn", labelKey: "menu.stockIn", subLabelKey: "menu.stockInSub", icon: ArrowDownToLine, href: "/stock-in" },
      { key: "salesOrder", menuKey: "salesOrder", labelKey: "menu.salesOrder", subLabelKey: "menu.salesOrderSub", icon: ShoppingCart, href: "/sales-order" },
      { key: "proformaInvoice", menuKey: "proformaInvoice", labelKey: "menu.proformaInvoice", subLabelKey: "menu.proformaInvoiceSub", icon: Receipt, href: "/proforma-invoice" },
      { key: "stockOut", menuKey: "stockOut", labelKey: "menu.stockOut", subLabelKey: "menu.stockOutSub", icon: ArrowUpFromLine, href: "/stock-out" },
      { key: "deliveryOrder", menuKey: "deliveryOrder", labelKey: "menu.deliveryOrder", subLabelKey: "menu.deliveryOrderSub", icon: FileText, href: "/delivery-order" },
      { key: "stockAdjustment", menuKey: "stockAdjustment", labelKey: "menu.stockAdjustment", icon: Settings2, href: "/stock-adjustment" },
    ],
  },
  {
    groupKey: "menu.masterData",
    items: [
      {
        key: "dataProduct",
        labelKey: "menu.dataProduct",
        icon: Package,
        children: [
          { key: "products", menuKey: "products", labelKey: "menu.products", icon: Boxes, href: "/data-product/products" },
          { key: "categories", menuKey: "categories", labelKey: "menu.categories", icon: Tags, href: "/data-product/categories" },
          { key: "units", menuKey: "units", labelKey: "menu.units", icon: Ruler, href: "/data-product/units" },
          { key: "suppliers", menuKey: "suppliers", labelKey: "menu.suppliers", icon: Building2, href: "/data-product/suppliers" },
          { key: "customers", menuKey: "customers", labelKey: "menu.customers", icon: UserCircle, href: "/data-product/customers" },
        ],
      },
      { key: "dataStock", menuKey: "dataStock", labelKey: "menu.dataStock", icon: Database, href: "/data-stock" },
      { key: "userManagement", menuKey: "userManagement", labelKey: "menu.userManagement", icon: Users, href: "/user-management" },
      { key: "settings", menuKey: "settings", labelKey: "menu.settings", icon: Settings2, href: "/settings" },
    ],
  },
  {
    groupKey: "menu.reports",
    items: [
      { key: "stockReport", menuKey: "stockReport", labelKey: "menu.stockReport", icon: FileText, href: "/reports/stock" },
      { key: "inboundReport", menuKey: "inboundReport", labelKey: "menu.inboundReport", icon: FileBarChart, href: "/reports/inbound" },
      { key: "outboundReport", menuKey: "outboundReport", labelKey: "menu.outboundReport", icon: FileBarChart, href: "/reports/outbound" },
      { key: "stockMovement", menuKey: "stockMovement", labelKey: "menu.stockMovement", icon: TrendingUpDown, href: "/reports/movement" },
      { key: "expiryAlert", menuKey: "expiryAlert", labelKey: "menu.expiryAlert", icon: CalendarClock, href: "/reports/expiry" },
      { key: "adjustmentLog", menuKey: "adjustmentLog", labelKey: "menu.adjustmentLog", icon: ClipboardCheck, href: "/reports/adjustment" },
      { key: "auditLog", menuKey: "auditLog", labelKey: "menu.auditLog", icon: History, href: "/reports/audit" },
    ],
  },
];

interface AppSidebarProps {
  isMobile: boolean;
  isOpen: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onClose: () => void;
  onNavigate: () => void;
}

const SCROLL_POSITION_KEY = "sidebar-scroll-position";

export default function AppSidebar({ isMobile, isOpen, isCollapsed, onToggleCollapse, onClose, onNavigate }: AppSidebarProps) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const location = useLocation();
  const [expandedItems, setExpandedItems] = useState<string[]>(["dataProduct"]);
  const scrollContainerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const savedScrollPosition = sessionStorage.getItem(SCROLL_POSITION_KEY);
    if (savedScrollPosition && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = parseInt(savedScrollPosition, 10);
    }
  }, []);

  const handleScroll = () => {
    if (scrollContainerRef.current) {
      sessionStorage.setItem(SCROLL_POSITION_KEY, scrollContainerRef.current.scrollTop.toString());
    }
  };

  useEffect(() => {
    const activeElement = scrollContainerRef.current?.querySelector('[data-active="true"]');
    if (activeElement) activeElement.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [location.pathname]);

  const toggleExpanded = (key: string) => {
    setExpandedItems((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const isActive = (href: string) => location.pathname === href;
  const isParentActive = (children: MenuItem[]) =>
    children.some((child) => child.href && location.pathname.startsWith(child.href));

  const handleNavClick = () => {
    if (isMobile) onNavigate();
  };

  const canAccess = (item: MenuItem): boolean => {
    if (!user) return false;
    if (item.menuKey) return canAccessMenu(user.role, item.menuKey);
    if (item.children) return item.children.some(child => canAccess(child));
    return true;
  };

  const getAccessibleChildren = (children: MenuItem[]): MenuItem[] => {
    return children.filter(child => canAccess(child));
  };

  const renderMenuItem = (item: MenuItem, depth = 0) => {
    if (!canAccess(item)) return null;

    const hasChildren = item.children && item.children.length > 0;
    
    if (hasChildren) {
      const accessibleChildren = getAccessibleChildren(item.children!);
      if (accessibleChildren.length === 0) return null;
    }
    
    const isExpanded = expandedItems.includes(item.key);
    const active = item.href ? isActive(item.href) : hasChildren && isParentActive(item.children!);
    const Icon = item.icon;

    // Collapsed mode
    if (isCollapsed && !isMobile) {
      if (hasChildren) {
        const accessibleChildren = getAccessibleChildren(item.children!);
        return (
          <Tooltip key={item.key} delayDuration={0}>
            <TooltipTrigger asChild>
              <div className={cn(
                "flex items-center justify-center w-10 h-10 mx-auto rounded-lg transition-all duration-200 cursor-pointer",
                "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                active && "bg-sidebar-accent text-sidebar-primary",
              )}>
                <Icon className="w-5 h-5" />
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="flex flex-col gap-1 p-2">
              <span className="font-semibold text-xs mb-1">{t(item.labelKey)}</span>
              {accessibleChildren.map(child => (
                <NavLink
                  key={child.key}
                  to={child.href!}
                  onClick={handleNavClick}
                  className={({ isActive: navActive }) => cn(
                    "text-xs px-2 py-1 rounded hover:bg-accent transition-colors",
                    navActive && "bg-accent font-medium"
                  )}
                >
                  {t(child.labelKey)}
                </NavLink>
              ))}
            </TooltipContent>
          </Tooltip>
        );
      }

      return (
        <Tooltip key={item.key} delayDuration={0}>
          <TooltipTrigger asChild>
            <NavLink
              to={item.href!}
              onClick={handleNavClick}
              data-active={active}
              className={({ isActive: navActive }) =>
                cn(
                  "flex items-center justify-center w-10 h-10 mx-auto rounded-lg transition-all duration-200",
                  "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  (navActive || active) && "bg-sidebar-accent text-sidebar-primary",
                )
              }
            >
              <Icon className="w-5 h-5" />
            </NavLink>
          </TooltipTrigger>
          <TooltipContent side="right">
            <span className="text-xs">{t(item.labelKey)}</span>
          </TooltipContent>
        </Tooltip>
      );
    }

    // Expanded mode (original)
    if (hasChildren) {
      const accessibleChildren = getAccessibleChildren(item.children!);
      
      return (
        <div key={item.key}>
          <button
            onClick={() => toggleExpanded(item.key)}
            className={cn(
              "w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-all duration-200",
              "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              active && "bg-sidebar-accent text-sidebar-primary",
            )}
          >
            <div className="flex items-center gap-3">
              <Icon className="w-5 h-5" />
              <span>{t(item.labelKey)}</span>
            </div>
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>

          {isExpanded && (
            <div className="ml-4 mt-1 space-y-1 border-l border-sidebar-border pl-3">
              {accessibleChildren.map((child) => renderMenuItem(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    return (
      <NavLink
        key={item.key}
        to={item.href!}
        onClick={handleNavClick}
        data-active={active}
        className={({ isActive: navActive }) =>
          cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200",
            "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            (navActive || active) &&
              "bg-sidebar-accent text-sidebar-primary font-medium border-l-2 border-sidebar-primary -ml-0.5 pl-[14px]",
          )
        }
      >
        <Icon className="w-5 h-5 flex-shrink-0" />
        <div className="flex flex-col">
          <span>{t(item.labelKey)}</span>
          {item.subLabelKey && <span className="text-xs text-sidebar-foreground/70">{t(item.subLabelKey)}</span>}
        </div>
      </NavLink>
    );
  };

  const getVisibleGroups = () => {
    return menuItems.filter(group => {
      return group.items.some(item => canAccess(item));
    });
  };

  const visibleGroups = getVisibleGroups();

  return (
    <TooltipProvider>
      <aside className={cn("h-full sidebar-gradient sidebar-shadow flex flex-col transition-all duration-300", isMobile ? "w-full" : "w-full")}>
        {/* Collapse toggle button - desktop only */}
        {!isMobile && (
          <div className={cn("flex items-center px-2 pt-2", isCollapsed ? "justify-center" : "justify-end")}>
            <button
              onClick={onToggleCollapse}
              className="p-1.5 rounded-lg text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
          </div>
        )}

        {/* Navigation - scrollable */}
        <nav ref={scrollContainerRef} onScroll={handleScroll} className={cn("flex-1 overflow-y-auto space-y-6", isCollapsed && !isMobile ? "p-2" : "p-3")}>
          {visibleGroups.map((group) => {
            const visibleItems = group.items.filter(item => canAccess(item));
            if (visibleItems.length === 0) return null;
            
            return (
              <div key={group.groupKey}>
                {!isCollapsed && (
                  <h2 className="px-3 mb-2 text-xs font-semibold text-sidebar-foreground/80 uppercase tracking-wider">
                    {t(group.groupKey)}
                  </h2>
                )}
                {isCollapsed && !isMobile && (
                  <div className="w-6 border-t border-sidebar-border/50 mx-auto mb-2" />
                )}

                <div className={cn("space-y-1", isCollapsed && !isMobile && "flex flex-col items-center")}>
                  {visibleItems.map((item) => renderMenuItem(item))}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-sidebar-border flex-shrink-0">
          {isCollapsed && !isMobile ? (
            <p className="text-[8px] text-sidebar-foreground/60 text-center">KKP</p>
          ) : (
            <p className="text-xs text-sidebar-foreground/60 text-center">© 2026 PT. Kemika Karya Pratama</p>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}