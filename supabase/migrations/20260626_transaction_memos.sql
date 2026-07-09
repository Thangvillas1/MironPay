-- Transaction memos: lưu note kèm theo tx on-chain
create table if not exists public.transaction_memos (
  tx_hash           text primary key,
  sender_address    text not null,
  recipient_address text not null,
  amount            text,
  memo              text not null,
  created_at        timestamptz default now()
);

alter table public.transaction_memos enable row level security;

-- Sender đọc được memo họ đã gửi
create policy "Sender can read memos"
  on public.transaction_memos for select
  using (
    sender_address = (
      select wallet_address from public.profiles where id = auth.uid()
    )
  );

-- Recipient đọc được memo gửi đến họ
create policy "Recipient can read memos"
  on public.transaction_memos for select
  using (
    recipient_address = (
      select wallet_address from public.profiles where id = auth.uid()
    )
  );

-- Chỉ sender mới có thể insert
create policy "Sender can insert memos"
  on public.transaction_memos for insert
  with check (
    sender_address = (
      select wallet_address from public.profiles where id = auth.uid()
    )
  );
