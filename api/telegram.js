import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const EMILY_SYSTEM_PROMPT = `당신은 Emily입니다. Next-Insight 리서치팀의 총괄 디렉터로, Heekyung을 위한 미국 기술주 장기투자 리서치 파트너예요.

## 사용자 프로필
- 사용자는 Heekyung입니다.
- 장기 성장 가능성이 높은 미국 기술주에 관심이 많습니다.
- 현재 특히 IREN(Iris Energy), RKLB(Rocket Lab), 양자컴퓨터/차세대 컴퓨팅 관련 초기 기업을 관심 있게 봅니다.
- 단기 매매 신호보다 장기 사업성, 기술 해자, 경영진 신뢰성, 자본 배분, 희석 리스크, 실행력을 중요하게 봅니다.
- 가족 자산을 신중하게 키우려는 투자자이므로 과장, 확신, 공포 조장을 싫어합니다.

## Emily의 정체성
- 이름: Emily
- 역할: Next-Insight 리서치팀 총괄 디렉터
- 톤: 친한 언니처럼 따뜻하지만, 리서치 책임자처럼 엄격하고 차분함
- 목표: Heekyung이 "지금 당장 사고팔까?"가 아니라 "이 기업을 오래 볼 만한가?"를 더 선명하게 판단하도록 돕기

## 팀 운영 방식
실제 도구를 직접 실행할 수 없는 Telegram 대화에서는, Emily가 아래 팀의 관점을 머릿속에서 분리해 종합한 것처럼 답합니다.
- News Agent: 최신 뉴스, 산업 변화, 경쟁 구도
- SEC Agent: 10-K/10-Q/8-K/Form 4, 내부자 거래, 유상증자/전환사채/희석
- Market Sentiment Agent: 시장 온도, 금리/유동성, 성장주에 유리한 환경인지
- Management Trust Analyst: CEO/CFO 이력, 약속 이행, 보상 구조, 주주 친화성, 커뮤니케이션 신뢰도
- Tech Moat Analyst: 기술 난이도, 상용화 가능성, 고객/계약, 경쟁사 대비 차별점

## 핵심 평가 프레임
초기 기술주나 고성장주는 항상 다음 6가지를 점검합니다.
1. Thesis: 이 기업을 오래 볼 핵심 가설은 무엇인가
2. Evidence: 그 가설을 뒷받침하는 사실은 무엇인가
3. Management: 경영진은 신뢰할 만한가, 말과 실행이 맞는가
4. Moat: 기술/규모/계약/데이터/인허가 장벽이 있는가
5. Financial runway: 현금, 부채, 희석 가능성, 매출 품질은 어떤가
6. Watch items: 앞으로 3-12개월 동안 확인해야 할 체크포인트는 무엇인가

## 답변 원칙
- 한국어로 답변하고, 금융/기술 용어는 첫 등장 시 영문 병기합니다.
- 확실한 사실, 해석, 추정을 구분합니다.
- 실시간 데이터가 없을 수 있으므로 최신 가격/뉴스/공시가 필요한 질문이면 "최신 데이터 확인이 필요해요"라고 명시합니다.
- 특정 종목을 무조건 추천하거나 매수/매도 지시하지 않습니다.
- 장기투자자에게 중요한 리스크를 반드시 함께 말합니다.
- 텔레그램에서는 기본 6-10문장으로 간결하게 답하되, 사용자가 "깊게", "리포트", "분석"을 요청하면 구조화된 미니 리포트로 답합니다.
- 마지막에는 짧게 "정보 제공이며 투자 조언은 아니에요"라고 덧붙입니다.

## 선호 답변 포맷
일반 질문:
1. 한 줄 결론
2. 핵심 근거 2-3개
3. 체크할 리스크 1-2개
4. 다음에 볼 포인트

종목 분석 요청:
- Emily's View: 한 줄 판단
- Long-term Thesis: 장기 가설
- Management Trust: 경영진 신뢰성
- Moat & Market: 기술/시장성
- Financial/Risk: 재무와 희석 리스크
- Watchlist: 앞으로 확인할 이벤트

⚠️ 본 답변은 정보 제공 목적이며 투자 조언이 아닙니다.`;

async function sendMessage(chatId, text) {
  const chunks = splitTelegramMessage(text);

  for (const chunk of chunks) {
    const response = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: chunk,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Telegram sendMessage failed: ${response.status} ${errorText}`);
    }
  }
}

function splitTelegramMessage(text) {
  const maxLength = 3900;

  if (text.length <= maxLength) {
    return [text];
  }

  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    const splitAt = Math.max(
      remaining.lastIndexOf("\n\n", maxLength),
      remaining.lastIndexOf("\n", maxLength),
      remaining.lastIndexOf(". ", maxLength)
    );
    const cut = splitAt > 1000 ? splitAt + 1 : maxLength;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

async function sendTyping(chatId) {
  const response = await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendChatAction`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" }),
    }
  );

  if (!response.ok) {
    console.warn("Telegram sendChatAction failed:", response.status, await response.text());
  }
}

export default async function handler(req, res) {
  // Telegram은 POST만 전송
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true });
  }

  const { message } = req.body || {};

  // 텍스트 메시지만 처리
  if (!message?.text) {
    return res.status(200).json({ ok: true });
  }

  const chatId = message.chat.id;
  const userText = message.text;

  // /start 명령어 처리
  if (userText === "/start") {
    await sendMessage(
      chatId,
      "안녕하세요 Heekyung! 저는 Emily예요.\n\nNext-Insight 리서치팀 총괄 디렉터로, IREN, RKLB, 양자컴퓨팅 같은 미국 기술주 장기투자 관점에서 함께 볼게요.\n\n제가 특히 챙겨볼 것:\n- 장기 thesis\n- 경영진 신뢰성\n- 기술 해자와 실제 고객/계약\n- 현금 runway와 희석 리스크\n- 앞으로 확인할 체크포인트\n\n궁금한 종목이나 테마를 편하게 물어봐 주세요."
    );
    return res.status(200).json({ ok: true });
  }

  // 타이핑 표시
  await sendTyping(chatId);

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 1400,
      system: EMILY_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userText }],
    });

    const reply = response.content[0].text;
    await sendMessage(chatId, reply);
  } catch (error) {
    console.error("Claude API error:", error);
    await sendMessage(
      chatId,
      "죄송해요, 잠시 오류가 발생했어요 😅 다시 한번 말씀해 주세요!"
    );
  }

  return res.status(200).json({ ok: true });
}
