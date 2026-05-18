import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const cronSecret = Deno.env.get('CRON_SECRET')
    const incoming = req.headers.get('x-cron-secret')
    if (!cronSecret || incoming !== cronSecret) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const RETENTION_DAYS = 90
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS)

    // Find attachments older than 90 days in the documents bucket
    const { data: oldAttachments, error: fetchError } = await supabase
      .from('attachments')
      .select('id, file_key, url, module_name, ref_id, uploaded_at')
      .lt('uploaded_at', cutoffDate.toISOString())

    if (fetchError) {
      console.error('Error fetching old attachments:', fetchError)
      return new Response(JSON.stringify({ success: false, error: fetchError.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    if (!oldAttachments || oldAttachments.length === 0) {
      return new Response(JSON.stringify({ success: true, deleted: 0, message: 'No old documents found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Filter only document files (from the 'documents' bucket based on file_key patterns)
    const documentAttachments = oldAttachments.filter(att => {
      // Documents bucket files - delivery notes, PO docs, adjustment attachments
      const isDocument = ['plan_order', 'sales_order', 'stock_adjustment', 'stock_in', 'stock_out'].includes(att.module_name)
      return isDocument
    })

    let deletedCount = 0
    const errors: string[] = []

    for (const attachment of documentAttachments) {
      try {
        // Delete from storage
        const { error: storageError } = await supabase.storage
          .from('documents')
          .remove([attachment.file_key])

        if (storageError) {
          console.error(`Failed to delete file ${attachment.file_key}:`, storageError)
          errors.push(`Storage: ${attachment.file_key}`)
          continue
        }

        // Delete attachment record
        const { error: dbError } = await supabase
          .from('attachments')
          .delete()
          .eq('id', attachment.id)

        if (dbError) {
          console.error(`Failed to delete attachment record ${attachment.id}:`, dbError)
          errors.push(`DB: ${attachment.id}`)
          continue
        }

        // Clear reference URL in parent tables
        if (attachment.module_name === 'plan_order') {
          await supabase.from('plan_order_headers')
            .update({ po_document_url: null })
            .eq('id', attachment.ref_id)
        } else if (attachment.module_name === 'sales_order') {
          await supabase.from('sales_order_headers')
            .update({ po_document_url: null })
            .eq('id', attachment.ref_id)
        } else if (attachment.module_name === 'stock_adjustment') {
          await supabase.from('stock_adjustments')
            .update({ attachment_url: null })
            .eq('id', attachment.ref_id)
        }

        deletedCount++
      } catch (err) {
        console.error(`Error processing attachment ${attachment.id}:`, err)
        errors.push(`Process: ${attachment.id}`)
      }
    }

    // Log cleanup to audit_logs
    await supabase.from('audit_logs').insert({
      module: 'system',
      action: 'cleanup_documents',
      ref_table: 'attachments',
      new_data: {
        deleted_count: deletedCount,
        total_found: documentAttachments.length,
        retention_days: RETENTION_DAYS,
        errors: errors.length > 0 ? errors : undefined,
      },
    })

    return new Response(
      JSON.stringify({
        success: true,
        deleted: deletedCount,
        total_found: documentAttachments.length,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Cleanup error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
