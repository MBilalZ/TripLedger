-- Remove expense receipts (table, realtime, storage bucket + policies).

do $$ begin
  alter publication supabase_realtime drop table public.expense_receipts;
exception
  when undefined_object then null;
  when undefined_table then null;
end $$;

drop policy if exists expense_receipts_select on public.expense_receipts;
drop policy if exists expense_receipts_insert on public.expense_receipts;
drop policy if exists expense_receipts_delete on public.expense_receipts;

drop table if exists public.expense_receipts;

drop policy if exists receipts_storage_select on storage.objects;
drop policy if exists receipts_storage_insert on storage.objects;
drop policy if exists receipts_storage_delete on storage.objects;

delete from storage.objects where bucket_id = 'receipts';
delete from storage.buckets where id = 'receipts';
