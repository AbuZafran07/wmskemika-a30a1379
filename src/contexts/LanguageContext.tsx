import React, { createContext, useContext, useState, useEffect } from "react";

type Language = "en" | "id";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const translations: Record<Language, Record<string, string>> = {
  en: {
    // General
    "app.name": "WMS KEMIKA",
    "app.subtitle": "Warehouse Management System",
    "app.company": "PT. KEMIKA KARYA PRATAMA",
    "app.tagline": "SPREADING SOLUTION",

    // Auth
    "auth.signIn": "Sign In",
    "auth.signInTitle": "Sign In to Your Account",
    "auth.signInSubtitle": "Use the email and password provided by administrator",
    "auth.email": "Email",
    "auth.password": "Password",
    "auth.emailPlaceholder": "name@kemika.co.id",
    "auth.passwordPlaceholder": "Enter password",
    "auth.noAccount": "Don't have an account?",
    "auth.contactAdmin": "Contact Super Admin to create an account.",
    "auth.logout": "Logout",
    "auth.profile": "Profile",

    // Login page
    "login.title": "Warehouse Management System",
    "login.subtitle": "Manage inbound, outbound, batch tracking, and FEFO in one integrated platform.",
    "login.roles": "Role",
    "login.paperless": "Paperless",
    "login.tracking": "Real-time Tracking",
    "login.copyright": "© 2026 PT. KEMIKA KARYA PRATAMA. All rights reserved.",

    // Menu Groups
    "menu.summary": "SUMMARY",
    "menu.transactions": "TRANSACTIONS",
    "menu.masterData": "MASTER DATA",
    "menu.reports": "REPORTS",

    // Menu Items
    "menu.dashboard": "Dashboard",
    "menu.requestDelivery": "Request Delivery",
    "menu.requestDeliverySub": "Delivery Schedule",
    "menu.trackerPO": "Tracker PO",
    "menu.trackerPOSub": "Purchase Order Tracker",
    "menu.dualBoard": "Dual Board",
    "menu.dualBoardSub": "Request & PO Side by Side",
    "menu.planOrder": "Plan Order",
    "menu.planOrderSub": "Inbound Plan",
    "menu.stockIn": "Stock In",
    "menu.stockInSub": "Inbound",
    "menu.salesOrder": "Sales Order",
    "menu.salesOrderSub": "Outbound Plan",
    "menu.proformaInvoice": "Proforma Invoice",
    "menu.proformaInvoiceSub": "Invoice CBD",
    "menu.stockOut": "Stock Out",
    "menu.stockOutSub": "Outbound",
    "menu.stockAdjustment": "Stock Adjustment",
    "menu.deliveryOrder": "Delivery Order",
    "menu.deliveryOrderSub": "Surat Jalan",
    "menu.dataProduct": "Data Product",
    "menu.products": "Products",
    "menu.categories": "Categories",
    "menu.units": "Units",
    "menu.suppliers": "Suppliers",
    "menu.customers": "Customers",
    "menu.userManagement": "User Management",
    "menu.settings": "Settings",
    "menu.stockReport": "Stock Report",
    "menu.inboundReport": "Inbound Report",
    "menu.outboundReport": "Outbound Report",
    "menu.adjustmentLog": "Adjustment Log",
    "menu.auditLog": "Audit Log",
    "menu.dataStock": "Data Stock",
    "menu.stockMovement": "Stock Movement",
    "menu.expiryAlert": "Expiry Alert",

    // Dashboard
    "dashboard.welcome": "Welcome back",
    "dashboard.totalProducts": "Total Products",
    "dashboard.totalSuppliers": "Total Suppliers",
    "dashboard.totalCustomers": "Total Customers",
    "dashboard.lowStock": "Low Stock Items",
    "dashboard.stockValue": "Stock Value",
    "dashboard.inbound30": "Inbound (30 days)",
    "dashboard.outbound30": "Outbound (30 days)",
    "dashboard.recentActivity": "Recent Activity",
    "dashboard.topMoving": "Top Moving Products",
    "dashboard.stockMovement": "Stock Movement (7 days)",
    "dashboard.stockByCategory": "Stock Value by Category",

    // Common
    "common.search": "Search",
    "common.filter": "Filter",
    "common.export": "Export",
    "common.import": "Import",
    "common.add": "Add",
    "common.edit": "Edit",
    "common.delete": "Delete",
    "common.save": "Save",
    "common.cancel": "Cancel",
    "common.actions": "Actions",
    "common.status": "Status",
    "common.date": "Date",
    "common.loading": "Loading...",
    "common.noData": "No data available",
    "common.comingSoon": "Coming Soon",

    // Status
    "status.draft": "Draft",
    "status.approved": "Approved",
    "status.partiallyReceived": "Partially Received",
    "status.received": "Received",
    "status.cancelled": "Cancelled",
    "status.partiallyDelivered": "Partially Delivered",
    "status.delivered": "Delivered",
    "status.submitted": "Submitted",
    "status.rejected": "Rejected",
    "status.posted": "Posted",
    "status.active": "Active",
    "status.inactive": "Inactive",
  },
  id: {
    // General
    "app.name": "WMS KEMIKA",
    "app.subtitle": "Sistem Manajemen Gudang",
    "app.company": "PT. KEMIKA KARYA PRATAMA",
    "app.tagline": "SPREADING SOLUTION",

    // Auth
    "auth.signIn": "Masuk",
    "auth.signInTitle": "Masuk ke Akun Anda",
    "auth.signInSubtitle": "Gunakan email dan password yang diberikan oleh administrator",
    "auth.email": "Email",
    "auth.password": "Kata Sandi",
    "auth.emailPlaceholder": "nama@kemika.co.id",
    "auth.passwordPlaceholder": "Masukkan kata sandi",
    "auth.noAccount": "Belum punya akun?",
    "auth.contactAdmin": "Hubungi Super Admin untuk membuat akun.",
    "auth.logout": "Keluar",
    "auth.profile": "Profil",

    // Login page
    "login.title": "Sistem Manajemen Gudang",
    "login.subtitle": "Kelola inbound, outbound, pelacakan batch, dan FEFO dalam satu platform terintegrasi.",
    "login.roles": "Peran",
    "login.paperless": "Tanpa Kertas",
    "login.tracking": "Pelacakan Real-time",
    "login.copyright": "© 2026 PT. KEMIKA KARYA PRATAMA. Hak cipta dilindungi.",

    // Menu Groups
    "menu.summary": "RINGKASAN",
    "menu.transactions": "TRANSAKSI",
    "menu.masterData": "MASTER DATA",
    "menu.reports": "LAPORAN",

    // Menu Items
    "menu.dashboard": "Dashboard",
    "menu.requestDelivery": "Request Delivery",
    "menu.requestDeliverySub": "Jadwal Pengiriman",
    "menu.trackerPO": "Tracker PO",
    "menu.trackerPOSub": "Purchase Order Tracker",
    "menu.dualBoard": "Dual Board",
    "menu.dualBoardSub": "Request & PO Berdampingan",
    "menu.planOrder": "Plan Order",
    "menu.planOrderSub": "Rencana Masuk",
    "menu.stockIn": "Stock In",
    "menu.stockInSub": "Penerimaan",
    "menu.salesOrder": "Sales Order",
    "menu.salesOrderSub": "Rencana Keluar",
    "menu.proformaInvoice": "Proforma Invoice",
    "menu.proformaInvoiceSub": "Invoice CBD",
    "menu.stockOut": "Stock Out",
    "menu.stockOutSub": "Pengeluaran",
    "menu.stockAdjustment": "Penyesuaian Stok",
    "menu.deliveryOrder": "Delivery Order",
    "menu.deliveryOrderSub": "Surat Jalan",
    "menu.dataProduct": "Data Produk",
    "menu.products": "Produk",
    "menu.categories": "Kategori",
    "menu.units": "Satuan",
    "menu.suppliers": "Supplier",
    "menu.customers": "Customer",
    "menu.userManagement": "Manajemen Pengguna",
    "menu.settings": "Pengaturan",
    "menu.stockReport": "Laporan Stok",
    "menu.inboundReport": "Laporan Masuk",
    "menu.outboundReport": "Laporan Keluar",
    "menu.adjustmentLog": "Log Penyesuaian",
    "menu.auditLog": "Log Audit",
    "menu.dataStock": "Data Stok",
    "menu.stockMovement": "Pergerakan Stok",
    "menu.expiryAlert": "Peringatan Kadaluarsa",

    // Dashboard
    "dashboard.welcome": "Selamat datang",
    "dashboard.totalProducts": "Total Produk",
    "dashboard.totalSuppliers": "Total Supplier",
    "dashboard.totalCustomers": "Total Customer",
    "dashboard.lowStock": "Stok Rendah",
    "dashboard.stockValue": "Nilai Stok",
    "dashboard.inbound30": "Masuk (30 hari)",
    "dashboard.outbound30": "Keluar (30 hari)",
    "dashboard.recentActivity": "Aktivitas Terkini",
    "dashboard.topMoving": "Produk Terlaris",
    "dashboard.stockMovement": "Pergerakan Stok (7 hari)",
    "dashboard.stockByCategory": "Nilai Stok per Kategori",

    // Common
    "common.search": "Cari",
    "common.filter": "Filter",
    "common.export": "Ekspor",
    "common.import": "Impor",
    "common.add": "Tambah",
    "common.edit": "Edit",
    "common.delete": "Hapus",
    "common.save": "Simpan",
    "common.cancel": "Batal",
    "common.actions": "Aksi",
    "common.status": "Status",
    "common.date": "Tanggal",
    "common.loading": "Memuat...",
    "common.noData": "Tidak ada data",
    "common.comingSoon": "Segera Hadir",

    // Status
    "status.draft": "Draft",
    "status.approved": "Disetujui",
    "status.partiallyReceived": "Diterima Sebagian",
    "status.received": "Diterima",
    "status.cancelled": "Dibatalkan",
    "status.partiallyDelivered": "Dikirim Sebagian",
    "status.delivered": "Terkirim",
    "status.submitted": "Diajukan",
    "status.rejected": "Ditolak",
    "status.posted": "Diposting",
    "status.active": "Aktif",
    "status.inactive": "Tidak Aktif",
  },
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem("wms-language");
    return (saved as Language) || "en";
  });

  useEffect(() => {
    localStorage.setItem("wms-language", language);
  }, [language]);

  const t = (key: string): string => {
    return translations[language][key] || key;
  };

  return <LanguageContext.Provider value={{ language, setLanguage, t }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    // Fallback for HMR / hot-reload edge cases
    return {
      language: 'id' as const,
      setLanguage: () => {},
      t: (key: string) => key,
    };
  }
  return context;
}
