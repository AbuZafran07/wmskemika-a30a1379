import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Loader2, Shield, Clock, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth, UserRole } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getUserFriendlyError } from '@/lib/errorHandler';

interface ApprovalWorkflowProps {
  type: 'plan_order' | 'sales_order';
  orderId: string;
  orderNumber: string;
  currentStatus: string;
  onStatusChange: () => void;
}

// Roles that can approve
const APPROVAL_ROLES: UserRole[] = ['super_admin', 'admin'];

export function ApprovalWorkflow({
  type,
  orderId,
  orderNumber,
  currentStatus,
  onStatusChange,
}: ApprovalWorkflowProps) {
  const { language } = useLanguage();
  const { user, hasPermission } = useAuth();
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [allowAdminApprove, setAllowAdminApprove] = useState(false);

  // Check settings for allow_admin_approve
  useEffect(() => {
    const checkSettings = async () => {
      const { data } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'allow_admin_approve')
        .single();
      
      if (data?.value) {
        setAllowAdminApprove(data.value === true);
      }
    };
    checkSettings();
  }, []);

  const canApprove = () => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    if (user.role === 'admin' && allowAdminApprove) return true;
    return false;
  };

  const tableName = type === 'plan_order' ? 'plan_order_headers' : 'sales_order_headers';

  const handleApprove = async () => {
    if (!canApprove()) {
      toast.error(language === 'en' ? 'You do not have permission to approve' : 'Anda tidak memiliki izin untuk menyetujui');
      return;
    }

    setIsLoading(true);

    const { error } = await supabase
      .from(tableName)
      .update({
        status: 'approved',
        approved_by: user?.id,
        approved_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (error) {
      toast.error(getUserFriendlyError(error, 'Failed to approve order. Please try again.'));
    } else {
      toast.success(language === 'en' ? `${orderNumber} approved successfully` : `${orderNumber} berhasil disetujui`);
      onStatusChange();
    }

    setIsLoading(false);
    setIsApproveDialogOpen(false);
  };

  const handleReject = async () => {
    if (!canApprove()) {
      toast.error(language === 'en' ? 'You do not have permission to reject' : 'Anda tidak memiliki izin untuk menolak');
      return;
    }

    if (!rejectReason.trim()) {
      toast.error(language === 'en' ? 'Please provide a rejection reason' : 'Harap berikan alasan penolakan');
      return;
    }

    setIsLoading(true);

    const { error } = await supabase
      .from(tableName)
      .update({
        status: 'cancelled',
        notes: rejectReason,
      })
      .eq('id', orderId);

    if (error) {
      toast.error(getUserFriendlyError(error, 'Failed to reject order. Please try again.'));
    } else {
      toast.success(language === 'en' ? `${orderNumber} rejected` : `${orderNumber} ditolak`);
      onStatusChange();
    }

    setIsLoading(false);
    setIsRejectDialogOpen(false);
    setRejectReason('');
  };

  if (currentStatus !== 'draft') {
    return null;
  }

  return (
    <>
      <div className="flex gap-2">
        {canApprove() && (
          <>
            <Button 
              size="sm" 
              className="bg-success text-success-foreground hover:bg-success/90"
              onClick={() => setIsApproveDialogOpen(true)}
              disabled={isLoading}
            >
              {isLoading && isApproveDialogOpen && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {!(isLoading && isApproveDialogOpen) && <CheckCircle className="w-4 h-4 mr-1" />}
              {language === 'en' ? 'Approve' : 'Setujui'}
            </Button>
            <Button 
              size="sm" 
              variant="destructive"
              onClick={() => setIsRejectDialogOpen(true)}
              disabled={isLoading}
            >
              {isLoading && isRejectDialogOpen && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {!(isLoading && isRejectDialogOpen) && <XCircle className="w-4 h-4 mr-1" />}
              {language === 'en' ? 'Reject' : 'Tolak'}
            </Button>
          </>
        )}
        {!canApprove() && (
          <Badge variant="pending" className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {language === 'en' ? 'Pending Approval' : 'Menunggu Persetujuan'}
          </Badge>
        )}
      </div>

      {/* Approve Dialog */}
      <AlertDialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {language === 'en' ? 'Approve Order' : 'Setujui Order'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {language === 'en' 
                ? `Are you sure you want to approve ${orderNumber}? This action cannot be undone.`
                : `Apakah Anda yakin ingin menyetujui ${orderNumber}? Tindakan ini tidak dapat dibatalkan.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>
              {language === 'en' ? 'Cancel' : 'Batal'}
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleApprove} 
              disabled={isLoading}
              className="bg-success text-success-foreground hover:bg-success/90"
            >
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {language === 'en' ? 'Approve' : 'Setujui'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Dialog */}
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {language === 'en' ? 'Reject Order' : 'Tolak Order'}
            </DialogTitle>
            <DialogDescription>
              {language === 'en' 
                ? `Please provide a reason for rejecting ${orderNumber}.`
                : `Harap berikan alasan untuk menolak ${orderNumber}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Rejection Reason' : 'Alasan Penolakan'} *</Label>
              <Textarea
                placeholder={language === 'en' ? 'Enter reason...' : 'Masukkan alasan...'}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectDialogOpen(false)} disabled={isLoading}>
              {language === 'en' ? 'Cancel' : 'Batal'}
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={isLoading}>
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {language === 'en' ? 'Reject' : 'Tolak'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Component to display approval info
export function ApprovalInfo({ 
  status, 
  approvedBy, 
  approvedAt 
}: { 
  status: string; 
  approvedBy: string | null; 
  approvedAt: string | null;
}) {
  const { language } = useLanguage();
  const [approverName, setApproverName] = useState<string | null>(null);

  useEffect(() => {
    const fetchApprover = async () => {
      if (!approvedBy) return;
      
      const { data } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', approvedBy)
        .single();
      
      if (data) {
        setApproverName(data.full_name || '');
      }
    };

    fetchApprover();
  }, [approvedBy]);

  if (status !== 'approved' || !approvedAt) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Shield className="w-4 h-4 text-success" />
      <span>
        {language === 'en' ? 'Approved by' : 'Disetujui oleh'} {approverName || '-'} 
        {' '}
        {language === 'en' ? 'on' : 'pada'} {new Date(approvedAt).toLocaleDateString('id-ID')}
      </span>
    </div>
  );
}

// Cancel workflow component with required reason
interface CancelWorkflowProps {
  type: 'plan_order' | 'sales_order';
  orderId: string;
  orderNumber: string;
  currentStatus: string;
  onStatusChange: () => void;
}

export function CancelWorkflow({
  type,
  orderId,
  orderNumber,
  currentStatus,
  onStatusChange,
}: CancelWorkflowProps) {
  const { language } = useLanguage();
  const { user } = useAuth();
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const tableName = type === 'plan_order' ? 'plan_order_headers' : 'sales_order_headers';

  const canCancel = () => {
    if (!user) return false;
    // Only draft or approved orders can be cancelled
    if (currentStatus !== 'draft' && currentStatus !== 'approved') return false;
    // Super admin and admin can cancel
    if (user.role === 'super_admin' || user.role === 'admin') return true;
    return false;
  };

  const handleCancel = async () => {
    if (!cancelReason.trim()) {
      toast.error(language === 'en' ? 'Please provide a cancellation reason' : 'Harap berikan alasan pembatalan');
      return;
    }

    setIsLoading(true);

    const { error } = await supabase
      .from(tableName)
      .update({
        status: 'cancelled',
        notes: cancelReason,
      })
      .eq('id', orderId);

    if (error) {
      toast.error(getUserFriendlyError(error, 'Failed to cancel order. Please try again.'));
    } else {
      toast.success(language === 'en' ? `${orderNumber} cancelled successfully` : `${orderNumber} berhasil dibatalkan`);
      onStatusChange();
    }

    setIsLoading(false);
    setIsCancelDialogOpen(false);
    setCancelReason('');
  };

  if (!canCancel()) {
    return null;
  }

  return (
    <>
      <Button 
        size="sm" 
        variant="outline"
        className="text-warning border-warning hover:bg-warning/10"
        onClick={() => setIsCancelDialogOpen(true)}
        disabled={isLoading}
      >
        {isLoading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
        {!isLoading && <Ban className="w-4 h-4 mr-1" />}
        {language === 'en' ? 'Cancel Order' : 'Batalkan Order'}
      </Button>

      {/* Cancel Dialog */}
      <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {language === 'en' ? 'Cancel Order' : 'Batalkan Order'}
            </DialogTitle>
            <DialogDescription>
              {language === 'en' 
                ? `Are you sure you want to cancel ${orderNumber}? This action cannot be undone.`
                : `Apakah Anda yakin ingin membatalkan ${orderNumber}? Tindakan ini tidak dapat dibatalkan.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{language === 'en' ? 'Cancellation Reason' : 'Alasan Pembatalan'} *</Label>
              <Textarea
                placeholder={language === 'en' ? 'Enter reason for cancellation...' : 'Masukkan alasan pembatalan...'}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCancelDialogOpen(false)} disabled={isLoading}>
              {language === 'en' ? 'Close' : 'Tutup'}
            </Button>
            <Button 
              variant="warning" 
              onClick={handleCancel} 
              disabled={isLoading || !cancelReason.trim()}
            >
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {language === 'en' ? 'Confirm Cancel' : 'Konfirmasi Batalkan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
