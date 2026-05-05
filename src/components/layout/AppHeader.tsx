import React, { useState, useEffect } from 'react';
import { Menu, X, Sun, Moon, Bell, User, LogOut, Settings, ChevronDown, AlertTriangle, Calendar, Package, CheckCircle, FileText, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications, Notification } from '@/hooks/useNotifications';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import logoImage from '@/assets/logo.png';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import WmsAssistant from '@/components/assistant/WmsAssistant';

interface AppHeaderProps {
  onMenuClick: () => void;
  isMobileDrawerOpen?: boolean;
}

export default function AppHeader({ onMenuClick, isMobileDrawerOpen }: AppHeaderProps) {
  const { language, setLanguage, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const navigate = useNavigate();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // Fetch signed URL for avatar
  useEffect(() => {
    const fetchAvatarUrl = async () => {
      if (user?.avatar) {
        try {
          const { data } = await supabase.storage
            .from('avatars')
            .createSignedUrl(user.avatar, 3600);
          if (data?.signedUrl) {
            setAvatarUrl(data.signedUrl);
          }
        } catch (error) {
          console.error('Error fetching avatar URL:', error);
        }
      } else {
        setAvatarUrl(null);
      }
    };
    fetchAvatarUrl();
  }, [user?.avatar]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'super_admin': return 'default';
      case 'admin': return 'info';
      case 'warehouse': return 'success';
      case 'sales': return 'warning';
      default: return 'secondary';
    }
  };

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'low_stock':
        return <Package className="w-4 h-4 text-warning" />;
      case 'expiring_soon':
        return <Calendar className="w-4 h-4 text-warning" />;
      case 'expired':
        return <AlertTriangle className="w-4 h-4 text-destructive" />;
      case 'approval_pending':
        return <ClipboardList className="w-4 h-4 text-info" />;
      case 'approved':
        return <CheckCircle className="w-4 h-4 text-success" />;
      case 'cancelled':
        return <AlertTriangle className="w-4 h-4 text-destructive" />;
      case 'new_order':
        return <FileText className="w-4 h-4 text-primary" />;
      default:
        return <Bell className="w-4 h-4 text-info" />;
    }
  };

  const getNotificationBg = (type: Notification['type'], read: boolean) => {
    if (read) return 'bg-muted/30';
    switch (type) {
      case 'expired':
      case 'cancelled':
        return 'bg-destructive/10';
      case 'low_stock':
      case 'expiring_soon':
        return 'bg-warning/10';
      case 'approved':
        return 'bg-success/10';
      case 'approval_pending':
      case 'new_order':
        return 'bg-primary/10';
      default:
        return 'bg-info/10';
    }
  };

  const handleNotificationClick = (notif: Notification) => {
    markAsRead(notif.id);
    if (notif.type === 'low_stock') {
      navigate('/data-stock');
    } else if (notif.type === 'expiring_soon' || notif.type === 'expired') {
      navigate('/reports/expiry');
    } else if (notif.module === 'plan_order') {
      navigate('/plan-order');
    } else if (notif.module === 'sales_order') {
      navigate('/sales-order');
    } else if (notif.module === 'stock_adjustment') {
      navigate('/stock-adjustment');
    } else if (notif.module === 'stock_in') {
      navigate('/stock-in');
    } else if (notif.module === 'stock_out') {
      navigate('/stock-out');
    } else if (notif.module === 'delivery') {
      navigate('/request-delivery');
    }
  };

  return (
    <header className="flex-shrink-0 border-b border-border bg-card header-shadow flex items-center justify-between px-4 lg:px-6 z-50 relative" style={{ height: 'calc(64px + env(safe-area-inset-top, 0px))', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      {/* Left side - Logo and hamburger */}
      <div className="flex items-center gap-3">
        {/* Hamburger menu - visible on mobile */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuClick}
          className="lg:hidden flex-shrink-0"
        >
          {isMobileDrawerOpen ? (
            <X className="w-5 h-5" />
          ) : (
            <Menu className="w-5 h-5" />
          )}
        </Button>

        {/* Company logo and name */}
        <div className="flex items-center gap-3">
          <img 
            src={logoImage} 
            alt="Kemika Logo" 
            className="h-9 w-auto object-contain flex-shrink-0"
          />
          <div className="hidden sm:flex flex-col">
            <span className="font-display font-bold text-foreground text-sm leading-tight">
              PT. KEMIKA KARYA PRATAMA
            </span>
            <span className="text-[10px] text-muted-foreground leading-tight">
              Warehouse Management System
            </span>
          </div>
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Language Toggle */}
        <div className="hidden sm:flex items-center border rounded-lg p-1 bg-muted/50">
          <button
            onClick={() => setLanguage('en')}
            className={`px-2 py-1 text-xs rounded transition-all ${
              language === 'en'
                ? 'bg-background shadow-sm text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            EN
          </button>
          <button
            onClick={() => setLanguage('id')}
            className={`px-2 py-1 text-xs rounded transition-all ${
              language === 'id'
                ? 'bg-background shadow-sm text-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            ID
          </button>
        </div>

        {/* WMS Assistant */}
        <WmsAssistant />

        {/* Theme Toggle */}
        <Button variant="ghost" size="icon" onClick={toggleTheme}>
          {theme === 'light' ? (
            <Moon className="w-5 h-5" />
          ) : (
            <Sun className="w-5 h-5" />
          )}
        </Button>

        {/* Notifications */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-destructive rounded-full animate-pulse" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="end">
            <div className="flex items-center justify-between p-3 border-b">
              <h4 className="font-semibold text-sm">
                {language === 'en' ? 'Notifications' : 'Notifikasi'}
              </h4>
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" className="text-xs h-7" onClick={markAllAsRead}>
                  {language === 'en' ? 'Mark all as read' : 'Tandai semua dibaca'}
                </Button>
              )}
            </div>
            <ScrollArea className="h-[300px]">
              {notifications.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  {language === 'en' ? 'No notifications' : 'Tidak ada notifikasi'}
                </div>
              ) : (
                <div className="divide-y">
                  {notifications.slice(0, 20).map((notif) => (
                    <div
                      key={notif.id}
                      className={cn(
                        'p-3 cursor-pointer hover:bg-muted/50 transition-colors',
                        getNotificationBg(notif.type, notif.read)
                      )}
                      onClick={() => handleNotificationClick(notif)}
                    >
                      <div className="flex gap-3">
                        <div className="flex-shrink-0 mt-0.5">
                          {getNotificationIcon(notif.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            'text-sm',
                            !notif.read && 'font-medium'
                          )}>
                            {notif.title}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {notif.message}
                          </p>
                        </div>
                        {!notif.read && (
                          <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-1.5" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
            <div className="p-2 border-t">
              <Button 
                variant="ghost" 
                className="w-full text-sm h-8"
                onClick={() => navigate('/notifications')}
              >
                {language === 'en' ? 'View all notifications' : 'Lihat semua notifikasi'}
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 px-2">
              <Avatar className="w-8 h-8">
                <AvatarImage src={avatarUrl || undefined} alt={user?.name} />
                <AvatarFallback className="bg-primary/10 text-primary text-sm">
                  {user?.name?.charAt(0)?.toUpperCase() || <User className="w-4 h-4" />}
                </AvatarFallback>
              </Avatar>
              <div className="hidden md:flex flex-col items-start">
                <span className="text-sm font-medium">{user?.name}</span>
                <Badge variant={getRoleBadgeVariant(user?.role || '')} className="text-[10px] px-1.5 py-0">
                  {user?.role?.replace('_', ' ')}
                </Badge>
              </div>
              <ChevronDown className="w-4 h-4 text-muted-foreground hidden md:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/profile')}>
              <User className="w-4 h-4 mr-2" />
              {t('auth.profile')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/settings')}>
              <Settings className="w-4 h-4 mr-2" />
              {language === 'en' ? 'Settings' : 'Pengaturan'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
              <LogOut className="w-4 h-4 mr-2" />
              {t('auth.logout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
