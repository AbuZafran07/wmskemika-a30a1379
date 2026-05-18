import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Get Google OAuth2 access token from service account
async function getAccessToken(serviceAccount: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const encoder = new TextEncoder();
  const headerB64 = btoa(String.fromCharCode(...encoder.encode(JSON.stringify(header))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const claimsB64 = btoa(String.fromCharCode(...encoder.encode(JSON.stringify(claims))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const signInput = `${headerB64}.${claimsB64}`;

  // Import the private key
  const pemContent = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '');
  
  const binaryKey = Uint8Array.from(atob(pemContent), c => c.charCodeAt(0));
  
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    encoder.encode(signInput)
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const jwt = `${signInput}.${signatureB64}`;

  // Exchange JWT for access token
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok) {
    throw new Error(`Failed to get access token: ${JSON.stringify(tokenData)}`);
  }
  
  return tokenData.access_token;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const cronSecret = Deno.env.get('CRON_SECRET');

    // Allow internal cron callers via shared secret header
    const incomingCronSecret = req.headers.get('x-cron-secret');
    const isCronCaller = !!cronSecret && incomingCronSecret === cronSecret;

    if (!isCronCaller) {
      // Otherwise require a valid user JWT with a privileged role
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const token = authHeader.replace('Bearer ', '');
      const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims?.sub) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      const userId = claimsData.claims.sub;
      // Check role via service client
      const adminClient = createClient(supabaseUrl, supabaseServiceKey);
      const { data: roleRows } = await adminClient
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);
      const roles = (roleRows || []).map((r: any) => r.role);
      const allowed = roles.some((r: string) =>
        ['super_admin', 'admin', 'sales', 'warehouse', 'finance', 'purchasing'].includes(r)
      );
      if (!allowed) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    const serviceAccountJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_JSON');

    if (!serviceAccountJson) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON not configured');
    }

    const serviceAccount = JSON.parse(serviceAccountJson);
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { title, body, data, user_ids, exclude_user_id } = await req.json();

    if (!title || !body) {
      return new Response(JSON.stringify({ error: 'title and body are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get FCM tokens for target users
    let query = supabase.from('push_tokens').select('token, user_id');
    
    if (user_ids && user_ids.length > 0) {
      query = query.in('user_id', user_ids);
    }

    if (exclude_user_id) {
      query = query.neq('user_id', exclude_user_id);
    }

    const { data: tokens, error: tokensError } = await query;

    if (tokensError) {
      throw new Error(`Failed to fetch tokens: ${tokensError.message}`);
    }

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0, message: 'No tokens found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get FCM access token
    const accessToken = await getAccessToken(serviceAccount);
    const projectId = serviceAccount.project_id;

    let sent = 0;
    let failed = 0;
    const invalidTokens: string[] = [];

    // Send to each token
    for (const { token } of tokens) {
      try {
        const fcmResponse = await fetch(
          `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: {
                token,
                notification: { title, body },
                webpush: {
                  notification: {
                    title,
                    body,
                    icon: '/logo-kemika.png',
                    badge: '/favicon.png',
                    tag: data?.tag || 'default',
                    requireInteraction: data?.requireInteraction || false,
                  },
                  fcm_options: {
                    link: data?.link || '/',
                  },
                },
                data: data ? Object.fromEntries(
                  Object.entries(data).map(([k, v]) => [k, String(v)])
                ) : undefined,
              },
            }),
          }
        );

        if (fcmResponse.ok) {
          sent++;
        } else {
          const errorData = await fcmResponse.json();
          console.error('FCM send error:', errorData);
          
          // If token is invalid, mark for cleanup
          if (errorData?.error?.code === 404 || 
              errorData?.error?.details?.some((d: any) => d.errorCode === 'UNREGISTERED')) {
            invalidTokens.push(token);
          }
          failed++;
        }
      } catch (e) {
        console.error('Error sending to token:', e);
        failed++;
      }
    }

    // Cleanup invalid tokens
    if (invalidTokens.length > 0) {
      await supabase
        .from('push_tokens')
        .delete()
        .in('token', invalidTokens);
      console.log(`Cleaned up ${invalidTokens.length} invalid tokens`);
    }

    return new Response(JSON.stringify({ success: true, sent, failed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Push notification error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
