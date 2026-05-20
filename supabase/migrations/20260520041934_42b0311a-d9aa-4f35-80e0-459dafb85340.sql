UPDATE public.stock_out_headers
SET booking_status='released',
    released_at=now(),
    released_reason=COALESCE(released_reason,'Manual release: SO sudah dibatalkan')
WHERE id='7408340a-9bc9-4d68-94d6-5b10c3a40e37'
  AND booking_status='booked';

INSERT INTO public.audit_logs (user_id, user_email, action, module, ref_table, ref_id, ref_no, old_data, new_data)
VALUES (NULL, 'system', 'release_booking', 'stock_out', 'stock_out_headers',
  '7408340a-9bc9-4d68-94d6-5b10c3a40e37', 'DO/20260520.02',
  jsonb_build_object('booking_status','booked'),
  jsonb_build_object('booking_status','released','reason','Manual release karena SO sudah dibatalkan','released_at', now()));