export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      attachments: {
        Row: {
          file_key: string
          file_name: string | null
          file_size: number | null
          id: string
          mime_type: string | null
          module_name: string
          ref_id: string
          ref_table: string
          uploaded_at: string | null
          uploaded_by: string | null
          url: string
        }
        Insert: {
          file_key: string
          file_name?: string | null
          file_size?: number | null
          id?: string
          mime_type?: string | null
          module_name: string
          ref_id: string
          ref_table: string
          uploaded_at?: string | null
          uploaded_by?: string | null
          url: string
        }
        Update: {
          file_key?: string
          file_name?: string | null
          file_size?: number | null
          id?: string
          mime_type?: string | null
          module_name?: string
          ref_id?: string
          ref_table?: string
          uploaded_at?: string | null
          uploaded_by?: string | null
          url?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          id: string
          ip_address: string | null
          module: string
          new_data: Json | null
          old_data: Json | null
          ref_id: string | null
          ref_no: string | null
          ref_table: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          module: string
          new_data?: Json | null
          old_data?: Json | null
          ref_id?: string | null
          ref_no?: string | null
          ref_table?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          module?: string
          new_data?: Json | null
          old_data?: Json | null
          ref_id?: string | null
          ref_no?: string | null
          ref_table?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          code: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          created_at: string
          edited_at: string | null
          file_name: string | null
          file_size: number | null
          file_type: string | null
          file_url: string | null
          id: string
          is_global: boolean | null
          is_pinned: boolean | null
          mentions: string[] | null
          message: string
          read_at: string | null
          receiver_id: string | null
          reply_to_id: string | null
          sender_id: string
        }
        Insert: {
          created_at?: string
          edited_at?: string | null
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_global?: boolean | null
          is_pinned?: boolean | null
          mentions?: string[] | null
          message: string
          read_at?: string | null
          receiver_id?: string | null
          reply_to_id?: string | null
          sender_id: string
        }
        Update: {
          created_at?: string
          edited_at?: string | null
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_global?: boolean | null
          is_pinned?: boolean | null
          mentions?: string[] | null
          message?: string
          read_at?: string | null
          receiver_id?: string | null
          reply_to_id?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          city: string | null
          code: string
          created_at: string | null
          created_by: string | null
          credit_limit: number | null
          customer_type: string | null
          deleted_at: string | null
          email: string | null
          id: string
          is_active: boolean | null
          jabatan: string | null
          name: string
          notes: string | null
          npwp: string | null
          phone: string | null
          pic: string | null
          terms_payment: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          code: string
          created_at?: string | null
          created_by?: string | null
          credit_limit?: number | null
          customer_type?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          jabatan?: string | null
          name: string
          notes?: string | null
          npwp?: string | null
          phone?: string | null
          pic?: string | null
          terms_payment?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          code?: string
          created_at?: string | null
          created_by?: string | null
          credit_limit?: number | null
          customer_type?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          jabatan?: string | null
          name?: string
          notes?: string | null
          npwp?: string | null
          phone?: string | null
          pic?: string | null
          terms_payment?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      delivery_card_labels: {
        Row: {
          created_at: string
          delivery_request_id: string
          id: string
          label_id: string
        }
        Insert: {
          created_at?: string
          delivery_request_id: string
          id?: string
          label_id: string
        }
        Update: {
          created_at?: string
          delivery_request_id?: string
          id?: string
          label_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_card_labels_delivery_request_id_fkey"
            columns: ["delivery_request_id"]
            isOneToOne: false
            referencedRelation: "delivery_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_card_labels_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "delivery_labels"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_checklists: {
        Row: {
          checked_at: string | null
          checked_by: string | null
          created_at: string
          delivery_request_id: string
          id: string
          is_checked: boolean
          label: string
        }
        Insert: {
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          delivery_request_id: string
          id?: string
          is_checked?: boolean
          label: string
        }
        Update: {
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          delivery_request_id?: string
          id?: string
          is_checked?: boolean
          label?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_checklists_delivery_request_id_fkey"
            columns: ["delivery_request_id"]
            isOneToOne: false
            referencedRelation: "delivery_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_comments: {
        Row: {
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          delivery_request_id: string
          id: string
          label_request_id: string | null
          message: string
          rejected_reason: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          delivery_request_id: string
          id?: string
          label_request_id?: string | null
          message: string
          rejected_reason?: string | null
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          delivery_request_id?: string
          id?: string
          label_request_id?: string | null
          message?: string
          rejected_reason?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_comments_delivery_request_id_fkey"
            columns: ["delivery_request_id"]
            isOneToOne: false
            referencedRelation: "delivery_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_labels: {
        Row: {
          color: string
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      delivery_orders: {
        Row: {
          created_at: string
          created_by: string | null
          do_number: string
          id: string
          notes: string | null
          sales_order_id: string
          stock_out_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          do_number: string
          id?: string
          notes?: string | null
          sales_order_id: string
          stock_out_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          do_number?: string
          id?: string
          notes?: string | null
          sales_order_id?: string
          stock_out_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_orders_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_order_headers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_orders_stock_out_id_fkey"
            columns: ["stock_out_id"]
            isOneToOne: false
            referencedRelation: "stock_out_headers"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_requests: {
        Row: {
          assigned_to: string | null
          board_status: string
          created_at: string
          created_by: string | null
          delivery_date_target: string | null
          id: string
          moved_at: string | null
          moved_by: string | null
          notes: string | null
          sales_order_id: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          board_status?: string
          created_at?: string
          created_by?: string | null
          delivery_date_target?: string | null
          id?: string
          moved_at?: string | null
          moved_by?: string | null
          notes?: string | null
          sales_order_id: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          board_status?: string
          created_at?: string
          created_by?: string | null
          delivery_date_target?: string | null
          id?: string
          moved_at?: string | null
          moved_by?: string | null
          notes?: string | null
          sales_order_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_requests_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_order_headers"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_batches: {
        Row: {
          batch_no: string
          created_at: string | null
          expired_date: string | null
          id: string
          product_id: string
          qty_on_hand: number
          updated_at: string | null
        }
        Insert: {
          batch_no: string
          created_at?: string | null
          expired_date?: string | null
          id?: string
          product_id: string
          qty_on_hand?: number
          updated_at?: string | null
        }
        Update: {
          batch_no?: string
          created_at?: string | null
          expired_date?: string | null
          id?: string
          product_id?: string
          qty_on_hand?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      national_holidays: {
        Row: {
          created_at: string
          created_by: string | null
          holiday_date: string
          id: string
          name: string
          year: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          holiday_date: string
          id?: string
          name: string
          year?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          holiday_date?: string
          id?: string
          name?: string
          year?: number | null
        }
        Relationships: []
      }
      plan_order_headers: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          discount: number | null
          expected_delivery_date: string | null
          grand_total: number | null
          id: string
          is_deleted: boolean | null
          notes: string | null
          plan_date: string
          plan_number: string
          po_document_url: string | null
          reference_no: string | null
          shipping_cost: number | null
          status: string
          supplier_id: string
          tax_rate: number | null
          total_amount: number | null
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          discount?: number | null
          expected_delivery_date?: string | null
          grand_total?: number | null
          id?: string
          is_deleted?: boolean | null
          notes?: string | null
          plan_date?: string
          plan_number: string
          po_document_url?: string | null
          reference_no?: string | null
          shipping_cost?: number | null
          status?: string
          supplier_id: string
          tax_rate?: number | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          discount?: number | null
          expected_delivery_date?: string | null
          grand_total?: number | null
          id?: string
          is_deleted?: boolean | null
          notes?: string | null
          plan_date?: string
          plan_number?: string
          po_document_url?: string | null
          reference_no?: string | null
          shipping_cost?: number | null
          status?: string
          supplier_id?: string
          tax_rate?: number | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_order_headers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_order_headers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers_public_view"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_order_items: {
        Row: {
          created_at: string | null
          id: string
          notes: string | null
          plan_order_id: string
          planned_qty: number
          product_id: string
          qty_received: number | null
          qty_remaining: number | null
          subtotal: number | null
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          notes?: string | null
          plan_order_id: string
          planned_qty: number
          product_id: string
          qty_received?: number | null
          qty_remaining?: number | null
          subtotal?: number | null
          unit_price: number
        }
        Update: {
          created_at?: string | null
          id?: string
          notes?: string | null
          plan_order_id?: string
          planned_qty?: number
          product_id?: string
          qty_received?: number | null
          qty_remaining?: number | null
          subtotal?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_order_items_plan_order_id_fkey"
            columns: ["plan_order_id"]
            isOneToOne: false
            referencedRelation: "plan_order_headers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          category_id: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          location_rack: string | null
          max_stock: number | null
          min_stock: number | null
          name: string
          photo_url: string | null
          purchase_price: number
          selling_price: number | null
          sku: string | null
          supplier_id: string | null
          unit_id: string | null
          updated_at: string | null
        }
        Insert: {
          barcode?: string | null
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          location_rack?: string | null
          max_stock?: number | null
          min_stock?: number | null
          name: string
          photo_url?: string | null
          purchase_price?: number
          selling_price?: number | null
          sku?: string | null
          supplier_id?: string | null
          unit_id?: string | null
          updated_at?: string | null
        }
        Update: {
          barcode?: string | null
          category_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          location_rack?: string | null
          max_stock?: number | null
          min_stock?: number | null
          name?: string
          photo_url?: string | null
          purchase_price?: number
          selling_price?: number | null
          sku?: string | null
          supplier_id?: string | null
          unit_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers_public_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          is_active: boolean | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      proforma_invoice_items: {
        Row: {
          created_at: string | null
          discount: number | null
          id: string
          notes: string | null
          product_id: string
          product_name: string
          proforma_invoice_id: string
          qty: number
          subtotal: number
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          discount?: number | null
          id?: string
          notes?: string | null
          product_id: string
          product_name: string
          proforma_invoice_id: string
          qty: number
          subtotal?: number
          unit_price: number
        }
        Update: {
          created_at?: string | null
          discount?: number | null
          id?: string
          notes?: string | null
          product_id?: string
          product_name?: string
          proforma_invoice_id?: string
          qty?: number
          subtotal?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "proforma_invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proforma_invoice_items_proforma_invoice_id_fkey"
            columns: ["proforma_invoice_id"]
            isOneToOne: false
            referencedRelation: "proforma_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      proforma_invoices: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string | null
          created_by: string | null
          customer_id: string
          customer_type: string | null
          delivery_request_id: string | null
          discount: number | null
          grand_total: number
          id: string
          materai_amount: number | null
          notes: string | null
          other_costs: number | null
          payment_terms: string | null
          pi_number: string
          rejected_reason: string | null
          sales_order_id: string
          shipping_cost: number | null
          status: string
          subtotal: number
          tax_amount: number | null
          tax_rate: number | null
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id: string
          customer_type?: string | null
          delivery_request_id?: string | null
          discount?: number | null
          grand_total?: number
          id?: string
          materai_amount?: number | null
          notes?: string | null
          other_costs?: number | null
          payment_terms?: string | null
          pi_number: string
          rejected_reason?: string | null
          sales_order_id: string
          shipping_cost?: number | null
          status?: string
          subtotal?: number
          tax_amount?: number | null
          tax_rate?: number | null
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string
          customer_type?: string | null
          delivery_request_id?: string | null
          discount?: number | null
          grand_total?: number
          id?: string
          materai_amount?: number | null
          notes?: string | null
          other_costs?: number | null
          payment_terms?: string | null
          pi_number?: string
          rejected_reason?: string | null
          sales_order_id?: string
          shipping_cost?: number | null
          status?: string
          subtotal?: number
          tax_amount?: number | null
          tax_rate?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proforma_invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proforma_invoices_delivery_request_id_fkey"
            columns: ["delivery_request_id"]
            isOneToOne: false
            referencedRelation: "delivery_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proforma_invoices_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_order_headers"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string | null
          device_type: string | null
          id: string
          token: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          device_type?: string | null
          id?: string
          token: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          device_type?: string | null
          id?: string
          token?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      sales_order_headers: {
        Row: {
          allocation_type: string
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          created_by: string | null
          customer_id: string
          customer_po_number: string
          deleted_at: string | null
          deleted_by: string | null
          delivery_deadline: string
          discount: number | null
          grand_total: number | null
          id: string
          is_deleted: boolean | null
          notes: string | null
          order_date: string
          po_document_url: string | null
          project_instansi: string
          sales_name: string
          sales_order_number: string
          sales_pulse_reference_number: string | null
          ship_to_address: string | null
          shipping_cost: number | null
          status: string
          tax_rate: number | null
          total_amount: number | null
          updated_at: string | null
        }
        Insert: {
          allocation_type: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id: string
          customer_po_number: string
          deleted_at?: string | null
          deleted_by?: string | null
          delivery_deadline: string
          discount?: number | null
          grand_total?: number | null
          id?: string
          is_deleted?: boolean | null
          notes?: string | null
          order_date?: string
          po_document_url?: string | null
          project_instansi: string
          sales_name: string
          sales_order_number: string
          sales_pulse_reference_number?: string | null
          ship_to_address?: string | null
          shipping_cost?: number | null
          status?: string
          tax_rate?: number | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          allocation_type?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string
          customer_po_number?: string
          deleted_at?: string | null
          deleted_by?: string | null
          delivery_deadline?: string
          discount?: number | null
          grand_total?: number | null
          id?: string
          is_deleted?: boolean | null
          notes?: string | null
          order_date?: string
          po_document_url?: string | null
          project_instansi?: string
          sales_name?: string
          sales_order_number?: string
          sales_pulse_reference_number?: string | null
          ship_to_address?: string | null
          shipping_cost?: number | null
          status?: string
          tax_rate?: number | null
          total_amount?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_headers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_items: {
        Row: {
          created_at: string | null
          discount: number | null
          id: string
          notes: string | null
          ordered_qty: number
          product_id: string
          qty_delivered: number | null
          qty_remaining: number | null
          sales_order_id: string
          subtotal: number | null
          tax_rate: number | null
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          discount?: number | null
          id?: string
          notes?: string | null
          ordered_qty: number
          product_id: string
          qty_delivered?: number | null
          qty_remaining?: number | null
          sales_order_id: string
          subtotal?: number | null
          tax_rate?: number | null
          unit_price: number
        }
        Update: {
          created_at?: string | null
          discount?: number | null
          id?: string
          notes?: string | null
          ordered_qty?: number
          product_id?: string
          qty_delivered?: number | null
          qty_remaining?: number | null
          sales_order_id?: string
          subtotal?: number | null
          tax_rate?: number | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_items_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_order_headers"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_pulse_sync_logs: {
        Row: {
          created_at: string
          direction: string
          endpoint: string
          error_message: string | null
          http_method: string
          id: string
          reference_number: string | null
          request_payload: Json | null
          response_payload: Json | null
          retry_count: number
          sales_order_id: string | null
          status: string
          status_code: number | null
          triggered_by: string | null
        }
        Insert: {
          created_at?: string
          direction?: string
          endpoint: string
          error_message?: string | null
          http_method?: string
          id?: string
          reference_number?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          retry_count?: number
          sales_order_id?: string | null
          status?: string
          status_code?: number | null
          triggered_by?: string | null
        }
        Update: {
          created_at?: string
          direction?: string
          endpoint?: string
          error_message?: string | null
          http_method?: string
          id?: string
          reference_number?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          retry_count?: number
          sales_order_id?: string | null
          status?: string
          status_code?: number | null
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_pulse_sync_logs_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_order_headers"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          created_at: string | null
          id: string
          key: string
          updated_at: string | null
          value: Json | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          key: string
          updated_at?: string | null
          value?: Json | null
        }
        Update: {
          created_at?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          value?: Json | null
        }
        Relationships: []
      }
      stock_adjustment_items: {
        Row: {
          adjustment_id: string
          adjustment_qty: number
          batch_id: string
          created_at: string | null
          id: string
          new_batch_no: string | null
          new_expired_date: string | null
          notes: string | null
          product_id: string
        }
        Insert: {
          adjustment_id: string
          adjustment_qty: number
          batch_id: string
          created_at?: string | null
          id?: string
          new_batch_no?: string | null
          new_expired_date?: string | null
          notes?: string | null
          product_id: string
        }
        Update: {
          adjustment_id?: string
          adjustment_qty?: number
          batch_id?: string
          created_at?: string | null
          id?: string
          new_batch_no?: string | null
          new_expired_date?: string | null
          notes?: string | null
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustment_items_adjustment_id_fkey"
            columns: ["adjustment_id"]
            isOneToOne: false
            referencedRelation: "stock_adjustments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustment_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "available_stock"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "stock_adjustment_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustment_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_adjustments: {
        Row: {
          adjustment_date: string
          adjustment_number: string
          approved_at: string | null
          approved_by: string | null
          attachment_url: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          is_deleted: boolean | null
          reason: string
          rejected_reason: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          adjustment_date?: string
          adjustment_number: string
          approved_at?: string | null
          approved_by?: string | null
          attachment_url?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_deleted?: boolean | null
          reason: string
          rejected_reason?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          adjustment_date?: string
          adjustment_number?: string
          approved_at?: string | null
          approved_by?: string | null
          attachment_url?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          is_deleted?: boolean | null
          reason?: string
          rejected_reason?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      stock_in_headers: {
        Row: {
          created_at: string | null
          created_by: string | null
          delivery_note_url: string | null
          id: string
          notes: string | null
          plan_order_id: string
          received_date: string
          stock_in_number: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          delivery_note_url?: string | null
          id?: string
          notes?: string | null
          plan_order_id: string
          received_date?: string
          stock_in_number: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          delivery_note_url?: string | null
          id?: string
          notes?: string | null
          plan_order_id?: string
          received_date?: string
          stock_in_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_in_headers_plan_order_id_fkey"
            columns: ["plan_order_id"]
            isOneToOne: false
            referencedRelation: "plan_order_headers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_in_items: {
        Row: {
          batch_no: string
          created_at: string | null
          expired_date: string | null
          id: string
          plan_order_item_id: string
          product_id: string
          qty_received: number
          stock_in_id: string
        }
        Insert: {
          batch_no: string
          created_at?: string | null
          expired_date?: string | null
          id?: string
          plan_order_item_id: string
          product_id: string
          qty_received: number
          stock_in_id: string
        }
        Update: {
          batch_no?: string
          created_at?: string | null
          expired_date?: string | null
          id?: string
          plan_order_item_id?: string
          product_id?: string
          qty_received?: number
          stock_in_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_in_items_plan_order_item_id_fkey"
            columns: ["plan_order_item_id"]
            isOneToOne: false
            referencedRelation: "plan_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_in_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_in_items_stock_in_id_fkey"
            columns: ["stock_in_id"]
            isOneToOne: false
            referencedRelation: "stock_in_headers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_out_headers: {
        Row: {
          booking_status: string
          created_at: string | null
          created_by: string | null
          delivered_at: string | null
          delivery_actual_date: string | null
          delivery_date: string
          delivery_note_url: string | null
          delivery_number: string | null
          id: string
          notes: string | null
          released_at: string | null
          released_reason: string | null
          sales_order_id: string
          skip_stock_deduction: boolean
          stock_out_number: string
        }
        Insert: {
          booking_status?: string
          created_at?: string | null
          created_by?: string | null
          delivered_at?: string | null
          delivery_actual_date?: string | null
          delivery_date?: string
          delivery_note_url?: string | null
          delivery_number?: string | null
          id?: string
          notes?: string | null
          released_at?: string | null
          released_reason?: string | null
          sales_order_id: string
          skip_stock_deduction?: boolean
          stock_out_number: string
        }
        Update: {
          booking_status?: string
          created_at?: string | null
          created_by?: string | null
          delivered_at?: string | null
          delivery_actual_date?: string | null
          delivery_date?: string
          delivery_note_url?: string | null
          delivery_number?: string | null
          id?: string
          notes?: string | null
          released_at?: string | null
          released_reason?: string | null
          sales_order_id?: string
          skip_stock_deduction?: boolean
          stock_out_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_out_headers_sales_order_id_fkey"
            columns: ["sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_order_headers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_out_items: {
        Row: {
          batch_id: string
          created_at: string | null
          id: string
          product_id: string
          qty_out: number
          sales_order_item_id: string
          stock_out_id: string
        }
        Insert: {
          batch_id: string
          created_at?: string | null
          id?: string
          product_id: string
          qty_out: number
          sales_order_item_id: string
          stock_out_id: string
        }
        Update: {
          batch_id?: string
          created_at?: string | null
          id?: string
          product_id?: string
          qty_out?: number
          sales_order_item_id?: string
          stock_out_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_out_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "available_stock"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "stock_out_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_out_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_out_items_sales_order_item_id_fkey"
            columns: ["sales_order_item_id"]
            isOneToOne: false
            referencedRelation: "sales_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_out_items_stock_out_id_fkey"
            columns: ["stock_out_id"]
            isOneToOne: false
            referencedRelation: "stock_out_headers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_transactions: {
        Row: {
          batch_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          notes: string | null
          product_id: string
          quantity: number
          reference_id: string | null
          reference_number: string | null
          reference_type: string | null
          transaction_type: string
        }
        Insert: {
          batch_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          product_id: string
          quantity: number
          reference_id?: string | null
          reference_number?: string | null
          reference_type?: string | null
          transaction_type: string
        }
        Update: {
          batch_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          reference_id?: string | null
          reference_number?: string | null
          reference_type?: string | null
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_transactions_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "available_stock"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "stock_transactions_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          city: string | null
          code: string
          contact_person: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          email: string | null
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          npwp: string | null
          phone: string | null
          terms_payment: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          code: string
          contact_person?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          npwp?: string | null
          phone?: string | null
          terms_payment?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          code?: string
          contact_person?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          npwp?: string | null
          phone?: string | null
          terms_payment?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      units: {
        Row: {
          code: string
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_signatures: {
        Row: {
          created_at: string
          id: string
          signature_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          signature_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          signature_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      available_stock: {
        Row: {
          batch_id: string | null
          batch_no: string | null
          expired_date: string | null
          product_id: string | null
          qty_available: number | null
          qty_booked: number | null
          qty_on_hand: number | null
        }
        Insert: {
          batch_id?: string | null
          batch_no?: string | null
          expired_date?: string | null
          product_id?: string | null
          qty_available?: never
          qty_booked?: never
          qty_on_hand?: number | null
        }
        Update: {
          batch_id?: string | null
          batch_no?: string | null
          expired_date?: string | null
          product_id?: string | null
          qty_available?: never
          qty_booked?: never
          qty_on_hand?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles_chat_view: {
        Row: {
          avatar_url: string | null
          full_name: string | null
          id: string | null
          is_active: boolean | null
        }
        Insert: {
          avatar_url?: string | null
          full_name?: string | null
          id?: string | null
          is_active?: boolean | null
        }
        Update: {
          avatar_url?: string | null
          full_name?: string | null
          id?: string | null
          is_active?: boolean | null
        }
        Relationships: []
      }
      suppliers_public_view: {
        Row: {
          city: string | null
          code: string | null
          created_at: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
          updated_at: string | null
        }
        Insert: {
          city?: string | null
          code?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          updated_at?: string | null
        }
        Update: {
          city?: string | null
          code?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      cleanup_old_chat_messages: { Args: never; Returns: undefined }
      get_sanitized_error_message: {
        Args: { p_sqlerrm: string; p_sqlstate: string }
        Returns: string
      }
      get_user_email: { Args: { _user_id: string }; Returns: string }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      plan_order_approve: {
        Args: { approve_reason?: string; order_id: string }
        Returns: Json
      }
      plan_order_approve_revision: { Args: { order_id: string }; Returns: Json }
      plan_order_cancel: { Args: { order_id: string }; Returns: Json }
      plan_order_create: {
        Args: { attachment_meta?: Json; header_data: Json; items_data: Json }
        Returns: Json
      }
      plan_order_reject_revision: {
        Args: { order_id: string; reject_reason?: string }
        Returns: Json
      }
      plan_order_request_revision: {
        Args: { order_id: string; revision_reason: string }
        Returns: Json
      }
      plan_order_soft_delete: { Args: { order_id: string }; Returns: Json }
      plan_order_update: {
        Args: { header_data: Json; items_data: Json; order_id: string }
        Returns: Json
      }
      sales_order_approve: {
        Args: { approve_reason?: string; order_id: string }
        Returns: Json
      }
      sales_order_approve_revision: {
        Args: { order_id: string }
        Returns: Json
      }
      sales_order_cancel: { Args: { order_id: string }; Returns: Json }
      sales_order_create: {
        Args: { attachment_meta?: Json; header_data: Json; items_data: Json }
        Returns: Json
      }
      sales_order_reject_revision: {
        Args: { order_id: string; reject_reason?: string }
        Returns: Json
      }
      sales_order_request_revision: {
        Args: { order_id: string; revision_reason: string }
        Returns: Json
      }
      sales_order_soft_delete: { Args: { order_id: string }; Returns: Json }
      sales_order_update: {
        Args: { header_data: Json; items_data: Json; order_id: string }
        Returns: Json
      }
      stock_adjustment_approve: {
        Args: { p_adjustment_id: string }
        Returns: Json
      }
      stock_adjustment_create: {
        Args: { attachment_meta?: Json; header_data: Json; items_data: Json }
        Returns: Json
      }
      stock_adjustment_reject: {
        Args: { p_adjustment_id: string; reject_reason?: string }
        Returns: Json
      }
      stock_adjustment_soft_delete: {
        Args: { p_adjustment_id: string }
        Returns: Json
      }
      stock_adjustment_update: {
        Args: { adjustment_id: string; header_data: Json; items_data: Json }
        Returns: Json
      }
      stock_in_create: {
        Args: { header_data: Json; items_data: Json }
        Returns: Json
      }
      stock_out_confirm_delivery: {
        Args: { p_stock_out_id: string }
        Returns: Json
      }
      stock_out_create: {
        Args: { header_data: Json; items_data: Json }
        Returns: Json
      }
      stock_out_release_booking: {
        Args: { p_reason: string; p_stock_out_id: string }
        Returns: Json
      }
      validate_adjustment_quantity: { Args: { qty: number }; Returns: boolean }
      validate_date_range: {
        Args: { end_date: string; start_date: string }
        Returns: boolean
      }
      validate_date_reasonable: { Args: { dt: string }; Returns: boolean }
      validate_percentage: { Args: { pct: number }; Returns: boolean }
      validate_price: { Args: { price: number }; Returns: boolean }
      validate_quantity: { Args: { qty: number }; Returns: boolean }
      validate_quantity_allow_zero: { Args: { qty: number }; Returns: boolean }
      validate_string_length: {
        Args: { max_length: number; str: string }
        Returns: boolean
      }
      validate_uuid_exists: {
        Args: { table_name: string; uuid_val: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "admin"
        | "finance"
        | "purchasing"
        | "warehouse"
        | "sales"
        | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "super_admin",
        "admin",
        "finance",
        "purchasing",
        "warehouse",
        "sales",
        "viewer",
      ],
    },
  },
} as const
