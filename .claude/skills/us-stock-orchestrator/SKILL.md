---
name: us-stock-orchestrator
description: "미국주식 투자 분석 하네스 오케스트레이터. 공시·시장감성·뉴스 에이전트를 병렬 실행하고 한국어 종합 리포트를 텔레그램으로 전송한다. '미국주식 리포트', '데일리 인사이트', '오늘 미장 어때', '리포트 실행', '하네스 실행', '다시 실행', '재실행', '업데이트' 등 요청 시 반드시 이 스킬을 사용할 것."
---

# 미국주식 분석 오케스트레이터

**실행 모드:** 하이브리드
- Phase 2: 서브 에이전트 병렬 (수집)
- Phase 3: 서브 에이전트 순차 (번역/요약)
- Phase 4: 스킬 직접 실행 (텔레그램 전송)

## Phase 0: 컨텍스트 확인

실행 시작 시 기존 산출물 존재 여부를 확인한다:

```
_workspace/ 폴더 확인:
- 오늘 날짜 파일 존재 → 부분 재실행 또는 스킵
- 어제 날짜 파일만 존재 → 신규 실행
- 폴더 없음 → 초기 실행 (mkdir _workspace)
```

사용자가 "특정 섹션만 다시"를 요청하면 해당 에이전트만 재실행한다.

## Phase 1: 초기화

1. 오늘 날짜 확인 (KST 기준: `date +%Y-%m-%d`)
2. `_workspace/` 디렉토리 생성 (없으면)
3. 관심 종목 리스트 확인 (`_workspace/watchlist.txt`)
4. 텔레그램 설정 확인 (환경변수 `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`)
5. Heekyung 관심 프로필 확인:
   - 핵심 종목: IREN, RKLB
   - 핵심 테마: 양자컴퓨팅, 우주/방산 인프라, AI 인프라, 고성능 컴퓨팅
   - 핵심 평가축: 경영진 신뢰성, 실행력, 자본 배분, 희석 리스크, 기술 해자, 실제 고객/계약

## Phase 2: 병렬 데이터 수집 (서브 에이전트 모드)

3개 에이전트를 `run_in_background: true`로 동시 실행:

```
Agent(sec-disclosure-agent, run_in_background=true, model="opus")
  → 산출물: _workspace/{날짜}_sec_result.md

Agent(market-sentiment-agent, run_in_background=true, model="opus")
  → 산출물: _workspace/{날짜}_sentiment_result.md

Agent(news-agent, run_in_background=true, model="opus")
  → 산출물: _workspace/{날짜}_news_result.md
```

완료 신호 대기 (최대 5분). 미완료 항목은 "수집 불가"로 처리.

## Phase 3: 번역/요약 (서브 에이전트 순차)

Phase 2 완료 후 실행:

```
Agent(translate-summary-agent, model="opus")
  입력: _workspace/{날짜}_*_result.md (3개)
  → 산출물: _workspace/{날짜}_translated_report.md
```

요약 에이전트는 반드시 아래 표를 포함한다:

```markdown
## Heekyung 관심종목 체크
| 종목/테마 | Thesis 영향 | 경영진 신뢰성 | 리스크 | 다음 체크포인트 |
|---|---|---|---|---|
| IREN | 강화/중립/약화 | 긍정/중립/주의 | ... | ... |
| RKLB | 강화/중립/약화 | 긍정/중립/주의 | ... | ... |
| 양자컴퓨팅 | 강화/중립/약화 | 긍정/중립/주의 | ... | ... |
```

그리고 최종 섹션에 Emily 점수표를 붙인다:

```markdown
## Emily Scorecard
- 장기 thesis: /10
- 경영진 신뢰성: /10
- 기술/시장 해자: /10
- 재무 runway: /10
- 현재 리스크 관리 필요도: 낮음/보통/높음
```

## Phase 4: 텔레그램 전송

번역된 리포트를 텔레그램으로 전송:

1. `_workspace/{날짜}_translated_report.md` 읽기
2. 텔레그램 메시지 길이 제한(4096자) 확인 → 필요 시 분할
3. 텔레그램 전송 스킬 실행:
   ```bash
   REPORT=$(cat _workspace/{날짜}_translated_report.md)
   # translate-summarize 스킬의 telegram-send 참조
   ```
4. 전송 성공 시 `_workspace/{날짜}_report.md`로 최종본 복사

## Phase 5: 마무리

1. 실행 로그 저장 (`_workspace/{날짜}_run_log.txt`)
2. 7일 이상 된 `_workspace/` 파일 정리 제안
3. 오케스트레이터 피드백 요청:
   - "오늘 리포트에서 개선할 부분이 있나요?"

## 에러 핸들링

| 상황 | 처리 |
|------|------|
| 에이전트 타임아웃 (5분) | 해당 섹션 "수집 불가"로 처리 후 계속 |
| 텔레그램 전송 실패 | 1회 재시도, 재실패 시 로컬 파일만 저장 |
| 번역 에이전트 실패 | 영문 원본으로 텔레그램 전송 |
| 전체 실패 | 에러 메시지를 텔레그램으로 전송 |

## 품질 기준

8.7점 이상의 리포트로 인정하려면 다음 조건을 충족해야 한다.
- Heekyung 관심종목/테마가 본문에 직접 반영되어 있다.
- 경영진 신뢰성 신호가 최소 1회 검토되어 있다.
- 좋은 뉴스와 리스크를 균형 있게 다룬다.
- "사실/해석/추정"이 섞이지 않도록 표현한다.
- 마지막에 다음 체크포인트가 남아 있다.
- 투자 조언이 아닌 정보 제공임을 명시한다.

## 테스트 시나리오

### 정상 흐름
1. "오늘 미장 리포트 만들어줘" → Phase 0-5 전체 실행
2. "시장 감성만 다시 수집해줘" → Phase 0 확인 후 market-sentiment-agent만 재실행

### 에러 흐름
1. SEC EDGAR 접속 불가 → 공시 섹션 "수집 불가" 처리 후 나머지 진행
2. 텔레그램 토큰 미설정 → 에러 메시지 출력, 로컬 파일로 저장
