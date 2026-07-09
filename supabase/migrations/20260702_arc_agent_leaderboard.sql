-- Bảng xếp hạng reputation on-chain (ERC-8004) cho toàn bộ agent đã đăng ký trên ARC Testnet.
-- Không có sẵn bảng xếp hạng nào từ ARC/8004scan cho network này — tự build bằng cách
-- quét event NewFeedback/FeedbackRevoked của ReputationRegistry (0x8004B663...).

-- Điểm hiển thị (leaderboard) — mỗi agent 1 dòng, cập nhật dần bởi indexer/backfill.
create table if not exists arc_agent_leaderboard (
  agent_id            bigint primary key,        -- ERC-8004 agentId (IdentityRegistry tokenId)
  total_score          numeric not null default 0, -- sum(value / 10^value_decimals), đã trừ revoked
  feedback_count       integer not null default 0,
  owner_address        text,                       -- lazy-fill khi agent lọt vào top leaderboard
  last_feedback_block  bigint,
  updated_at           timestamptz not null default now()
);

create index if not exists arc_agent_leaderboard_score_idx
  on arc_agent_leaderboard (total_score desc);

-- Từng dòng feedback thô — PHẢI lưu vì FeedbackRevoked có thể đến ở block xa hơn rất
-- nhiều so với NewFeedback gốc, cần value/value_decimals gốc để trừ đúng khi gặp revoke.
create table if not exists arc_feedback_events (
  agent_id        bigint not null,
  feedback_index  bigint not null,
  client_address  text not null,
  value           bigint not null,
  value_decimals  smallint not null default 0,
  revoked         boolean not null default false,
  block_number    bigint not null,
  primary key (agent_id, feedback_index)
);

create index if not exists arc_feedback_events_agent_idx
  on arc_feedback_events (agent_id);

-- Tiến độ quét log on-chain, để backfill/cron chạy incremental thay vì quét lại từ đầu.
create table if not exists arc_index_state (
  contract_key         text primary key,   -- 'reputation_registry'
  last_scanned_block   bigint not null,
  updated_at           timestamptz not null default now()
);

-- RLS: arc_agent_leaderboard public-readable (trang leaderboard không cần đăng nhập),
-- nhưng chỉ service-role (bypass RLS) mới ghi được — không có policy insert/update/delete
-- cho anon/authenticated.
alter table arc_agent_leaderboard enable row level security;
create policy "arc_agent_leaderboard_public_read"
  on arc_agent_leaderboard for select
  to anon, authenticated
  using (true);

-- arc_feedback_events và arc_index_state: chỉ phục vụ nội bộ indexer, không public.
-- RLS bật nhưng không thêm policy nào cho anon/authenticated → deny-by-default,
-- chỉ service-role đọc/ghi được.
alter table arc_feedback_events enable row level security;
alter table arc_index_state enable row level security;
