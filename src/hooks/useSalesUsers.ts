import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SalesUser {
  id: string;
  full_name: string;
  email: string;
}

export function useSalesUsers() {
  const [salesUsers, setSalesUsers] = useState<SalesUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSalesUsers() {
      setLoading(true);
      try {
        // Get user IDs that have the 'sales' role
        const { data: roleData, error: roleError } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "sales");

        if (roleError || !roleData?.length) {
          setSalesUsers([]);
          return;
        }

        const ids = roleData.map((r) => r.user_id);

        // Fetch their profiles
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", ids)
          .eq("is_active", true)
          .order("full_name");

        setSalesUsers((profiles as SalesUser[]) ?? []);
      } finally {
        setLoading(false);
      }
    }

    fetchSalesUsers();
  }, []);

  return { salesUsers, loading };
}
