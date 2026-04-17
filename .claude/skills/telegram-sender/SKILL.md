---
name: telegram-sender
description: "텔레그램 봇으로 메시지를 전송하는 스킬. 미국주식 리포트를 텔레그램 채팅으로 발송한다. 환경변수 TELEGRAM_BOT_TOKEN과 TELEGRAM_CHAT_ID를 사용한다."
---

# 텔레그램 전송 스킬

## 역할
환경변수에서 봇 토큰과 채팅 ID를 읽어 텔레그램으로 메시지를 전송한다.

## 환경변수 설정 방법

**중요:** 봇 토큰은 절대 코드/파일에 하드코딩하지 않는다. 환경변수로 설정한다:

```bash
# ~/.zshrc 또는 ~/.bashrc에 추가
export TELEGRAM_BOT_TOKEN="BotFather에서_재발급받은_새_토큰"
export TELEGRAM_CHAT_ID="8791606761"
```

설정 후 터미널 재시작 또는 `source ~/.zshrc` 실행.

## 전송 스크립트

메시지 전송 시 아래 방식으로 실행한다:

```bash
#!/bin/bash
# 환경변수 확인
if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
  echo "ERROR: TELEGRAM_BOT_TOKEN 환경변수가 설정되지 않았습니다."
  echo "~/.zshrc에 export TELEGRAM_BOT_TOKEN='토큰값' 을 추가하세요."
  exit 1
fi

if [ -z "$TELEGRAM_CHAT_ID" ]; then
  echo "ERROR: TELEGRAM_CHAT_ID 환경변수가 설정되지 않았습니다."
  exit 1
fi

# 메시지 전송 함수 (4096자 분할)
send_telegram() {
  local message="$1"
  local max_length=4096
  
  if [ ${#message} -le $max_length ]; then
    curl -s -X POST \
      "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
      -d "chat_id=${TELEGRAM_CHAT_ID}" \
      -d "text=${message}" \
      -d "parse_mode=Markdown"
  else
    # 분할 전송: 섹션(---) 기준으로 나눔
    echo "$message" | awk -v max=$max_length '
      { chunk = chunk $0 "\n" }
      length(chunk) > max { print chunk; chunk = "" }
      END { if (chunk) print chunk }
    ' | while IFS= read -r part; do
      curl -s -X POST \
        "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
        -d "chat_id=${TELEGRAM_CHAT_ID}" \
        -d "text=${part}" \
        -d "parse_mode=Markdown"
      sleep 0.5  # rate limit 방지
    done
  fi
}

# 리포트 파일 읽기
REPORT_FILE="_workspace/$(date +%Y-%m-%d)_translated_report.md"
if [ -f "$REPORT_FILE" ]; then
  MESSAGE=$(cat "$REPORT_FILE")
  send_telegram "$MESSAGE"
  echo "✅ 텔레그램 전송 완료"
else
  echo "ERROR: 리포트 파일을 찾을 수 없습니다: $REPORT_FILE"
  exit 1
fi
```

## 전송 검증
전송 후 API 응답의 `"ok": true` 여부로 성공 확인.
실패 시 응답 메시지를 로그에 기록하고 1회 재시도.

## 보안 주의사항
- 봇 토큰을 `.env` 파일, 코드, Git에 절대 저장하지 않는다
- 채팅 ID는 민감 정보가 아니지만 환경변수 관리를 권장한다
- 토큰이 노출된 경우 즉시 BotFather에서 `/revoke` 후 재발급한다
