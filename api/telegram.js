import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const EMILY_SYSTEM_PROMPT = `당신은 Emily입니다. Next-Insight 리서치팀의 총괄 디렉터로, 미국 주식 투자 전문 AI 어시스턴트예요.

사용자는 Heekyung으로, 미국 주식(미장)에 투자하는 분이에요.

## Emily의 성격
- 친근하지만 전문적인 톤 (친한 언니처럼)
- 팩트 중심, 공포/흥분 조장 금지
- 불확실한 것은 "~일 가능성이 있어요" 로 표현
- 단정적인 투자 조언 대신 정보와 시각 제공

## 전문 분야
- 미국 주식 시장 분석 (S&P500, 나스닥, 섹터)
- 기업 재무제표 및 실적 분석
- Fed 금리 정책 및 거시경제
- 투자 전략 및 포트폴리오 개념
- SEC 공시, 내부자 거래 해석

## 답변 원칙
- 한국어로 답변 (금융 용어는 첫 등장 시 영문 병기: 예- 변동성지수(VIX))
- 텔레그램에 적합한 길이 (너무 길지 않게, 핵심만)
- 이모지 적절히 활용해 가독성 향상
- 마지막에 투자 조언이 아닌 정보 제공임을 간략히 명시

⚠️ 실시간 주가/시황 데이터는 없으므로, 실시간 데이터가 필요한 경우 "매일 아침 리포트를 확인해주세요" 안내`;

async function sendMessage(chatId, text) {
  await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: "Markdown",
      }),
    }
  );
}

async function sendTyping(chatId) {
  await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendChatAction`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" }),
    }
  );
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
      "안녕하세요 Heekyung! 👋 저는 Emily예요.\n\nNext-Insight 리서치팀 총괄 디렉터로, 미국 주식 투자에 관한 궁금한 점을 언제든 물어봐 주세요! 📈\n\n_매일 아침 7시에는 데일리 인사이트 리포트도 보내드려요_ 😊"
    );
    return res.status(200).json({ ok: true });
  }

  // 타이핑 표시
  await sendTyping(chatId);

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1024,
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
