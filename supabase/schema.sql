create table if not exists ticker_memories (
  id uuid primary key default gen_random_uuid(),
  ticker text not null unique,
  company_name text,
  current_thesis text,
  management_trust text,
  key_risks text,
  watchpoints text,
  last_emily_view text,
  updated_at timestamptz default now()
);

create table if not exists memory_events (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  event_type text not null,
  title text not null,
  body text,
  source_url text,
  agent text,
  importance text default 'medium',
  created_at timestamptz default now()
);

create table if not exists conversation_summaries (
  id uuid primary key default gen_random_uuid(),
  chat_id text not null,
  ticker text,
  summary text not null,
  agents text[],
  created_at timestamptz default now()
);

create index if not exists memory_events_ticker_created_at_idx
  on memory_events (ticker, created_at desc);

insert into ticker_memories (
  ticker,
  company_name,
  current_thesis,
  management_trust,
  key_risks,
  watchpoints,
  last_emily_view
) values
(
  'IREN',
  'Iris Energy',
  '비트코인 채굴 기반의 전력/데이터센터 운영 역량을 AI 인프라와 고성능 컴퓨팅(HPC) 수요로 확장할 수 있는지가 핵심 thesis입니다.',
  '경영진이 AI/HPC 전환을 실제 고객 계약, 설비 전환, 매출 품질로 증명하는지 확인해야 합니다. 대규모 capex와 자금 조달 과정에서 주주 희석이 얼마나 발생하는지가 핵심입니다.',
  '비트코인 가격과 채굴 경제성 의존도, AI 데이터센터 전환 지연, 전력 비용, 설비 투자, 추가 증자/전환사채 가능성.',
  'AI/HPC 고객 계약의 규모와 기간, 데이터센터 가동률과 gross margin 변화, 현금 runway, capex 계획, 주식 발행 여부.',
  'IREN은 장기 성장 story가 흥미롭지만, AI 인프라 기업으로 재평가받으려면 채굴 기업에서 데이터센터/HPC 기업으로 전환되는 실적 증거가 필요합니다.'
),
(
  'RKLB',
  'Rocket Lab',
  '발사 서비스와 우주 시스템을 함께 제공하는 우주 인프라 기업으로 성장할 수 있는지가 핵심 thesis입니다.',
  'Peter Beck 중심의 기술 실행력과 장기 제품 로드맵은 강점입니다. Neutron 개발 일정, 정부/상업 고객 수주, 수익성 개선을 약속한 대로 실행하는지 확인해야 합니다.',
  'Neutron 개발 지연 또는 비용 초과, 정부 계약 의존도, 발사 실패 리스크, 높은 성장 기대가 이미 주가에 반영될 가능성.',
  'Neutron 개발 milestone과 첫 발사 일정, Space Systems 매출 비중과 margin 개선, 수주잔고 품질과 고객 다변화, 현금 소진 속도.',
  'RKLB는 장기적으로 우주 인프라 플랫폼 thesis가 살아 있지만, Neutron 실행력과 Space Systems 수익성이 핵심 확인 지점입니다.'
),
(
  'QUANTUM',
  'Quantum Computing Theme',
  '장기 잠재력은 크지만 상용화 시점, 실제 고객 가치, 하드웨어 방식별 승자 예측이 아직 불확실한 초기 테마입니다.',
  '경영진의 과학적 신뢰성뿐 아니라 상업화 로드맵, 고객 PoC 전환율, 자본 조달 방식이 중요합니다.',
  '기술 방식 간 경쟁, 상용화까지 긴 시간과 높은 현금 소진, 잦은 주식 발행과 희석, narrative에 민감한 주가.',
  '실제 고객 계약과 반복 매출, error correction/logical qubit/gate fidelity milestone, 현금 runway와 증자 가능성, 대형 기업과의 경쟁 또는 파트너십.',
  '양자컴퓨팅은 portfolio의 optionality로는 흥미롭지만, 개별 기업은 기술 증거와 재무 runway를 매우 엄격하게 봐야 합니다.'
)
on conflict (ticker) do update set
  company_name = excluded.company_name,
  current_thesis = excluded.current_thesis,
  management_trust = excluded.management_trust,
  key_risks = excluded.key_risks,
  watchpoints = excluded.watchpoints,
  last_emily_view = excluded.last_emily_view,
  updated_at = now();
