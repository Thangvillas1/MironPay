-- Lưu thông tin Miron Agent sau khi đăng ký on-chain (ERC-8004)
create table if not exists miron_agent_identity (
  id          uuid primary key default gen_random_uuid(),
  agent_id    integer unique not null,        -- ERC-721 token ID từ IdentityRegistry
  owner_address text not null,               -- Project wallet address
  metadata_uri  text not null,               -- IPFS URI
  tx_hash       text not null,               -- TX đăng ký
  feedback_tx_hash text,                     -- TX chấm điểm đầu tiên
  initial_score integer default 80,          -- Điểm reputation ban đầu
  registered_at timestamptz default now()
);

-- Chỉ có 1 row (1 agent duy nhất)
-- RLS: không cần vì đây là data hệ thống, không phải data user
