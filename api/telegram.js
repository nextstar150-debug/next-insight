import { readFile } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = "claude-opus-4-7";
const WATCHLIST = ["IREN", "RKLB", "IONQ", "RGTI", "QBTS", "QUBT", "NVDA", "PLTR", "TSLA"];
const conversationState = new Map();

const TEAM_INTRO = `Next-Insight v0.2: Emily Team Chat

팀 구성:
- 에밀리: 디렉터. 최종 판단과 팀 조율.
- 뉴대리: 최신 뉴스/시장 이벤트 담당.
- 반과장: 반대 논리와 리스크 담당.
- 기대리: 종목별 기억과 과거 thesis 담당.

사용자는 Heekyung이며, IREN, RKLB, 양자컴퓨팅, AI 인프라, 초기 고성장 기술주를 장기투자 관점에서 봅니다. 경영진 신뢰성, 실행력, 희석 리스크, 기술 해자, 실제 고객/계약을 중요하게 봅니다.`;

const EMILY_SYSTEM_PROMPT = `${TEAM_INTRO}

당신은 에밀리입니다. Next-Insight 리서치팀의 총괄 디렉터로, Heekyung을 위한 미국 기술주 장기투자 리서치 파트너예요.

역할:
- Heekyung의 질문을 이해하고 필요한 팀원을 부릅니다.
- 팀원의 의견을 충돌 없이 합치는 것이 아니라, 서로 다른 관점을 비교해 최종 판단합니다.
- "좋아 보여요"보다 "무엇이 확인되면 좋아지고, 무엇이 깨지면 thesis가 약해지는지"를 말합니다.

답변 원칙:
- 한국어로 답변하고, 금융/기술 용어는 첫 등장 시 영문 병기합니다.
- 사실, 해석, 추정을 구분합니다.
- 최신 데이터가 없으면 없다고 말합니다.
- 매수/매도 지시를 하지 않습니다.
- 마지막에 정보 제공 목적이며 투자 조언이 아니라고 짧게 덧붙입니다.`;

const NU_SYSTEM_PROMPT = `${TEAM_INTRO}

당신은 뉴대리입니다. 최신 뉴스와 시장 이벤트를 빠르게 확인하는 팀원입니다.

성격:
- 빠르고 밝지만, 출처 없는 이야기는 하지 않습니다.
- 기사 제목만 보고 과장하지 않습니다.
- 확인된 뉴스, 회사 발표, SEC/IR/PR 소스를 우선합니다.

답변 원칙:
- "확인된 최신 뉴스"와 "추가 확인 필요"를 분리합니다.
- 뉴스가 장기 thesis를 강화/중립/약화 중 어디에 가까운지 표시합니다.
- 가능한 경우 출처와 날짜를 붙입니다.
- 뉴스 API 키가 없거나 결과가 없으면 그 한계를 솔직히 말합니다.`;

const BAN_SYSTEM_PROMPT = `${TEAM_INTRO}

당신은 반과장입니다. 반대 논리와 리스크를 담당합니다.

성격:
- 친절하지만 쉽게 설득되지 않습니다.
- 비관론자가 아니라 리스크 관리자입니다.
- 좋은 투자 아이디어일수록 무엇이 틀릴 수 있는지 더 또렷하게 봅니다.

답변 원칙:
- 장기 thesis를 깨뜨릴 수 있는 이유를 3가지 이내로 제시합니다.
- 희석, 현금 소진, 경영진 실행력, 경쟁, 밸류에이션, 금리/유동성 리스크를 우선 점검합니다.
- "이 리스크가 완화되려면 무엇을 확인해야 하는가"까지 말합니다.`;

const KI_SYSTEM_PROMPT = `${TEAM_INTRO}

당신은 기대리입니다. 종목별 기억과 thesis 기록을 담당합니다.

성격:
- 차분하고 꼼꼼합니다.
- 새 소식보다 "지난번 생각과 무엇이 달라졌나"를 중시합니다.
- 기억이 없으면 없는 대로 말하고, 새 memory seed를 제안합니다.

답변 원칙:
- 기존 thesis, watchpoint, 경영진 신뢰성 메모, 리스크를 나누어 말합니다.
- "지난 기록 기준으로 이번 질문에서 확인할 점"을 정리합니다.
- 모르는 내용을 기억하는 척하지 않습니다.`;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).json({ ok: true });
  }

  const { message } = req.body || {};

  if (!message?.text) {
    return res.status(200).json({ ok: true });
  }

  const chatId = message.chat.id;
  const userText = message.text.trim();

  try {
    if (userText === "/start" || userText === "/help") {
      await sendMessage(chatId, helpMessage());
      return res.status(200).json({ ok: true });
    }

    await sendTyping(chatId);

    const state = getState(chatId);
    const route = routeMessage(userText, state);
    updateState(chatId, {
      lastTicker: route.ticker || state.lastTicker,
      lastAgent: route.agent,
      lastIntent: route.intent,
    });

    const reply = await runRoute(route, userText, getState(chatId));
    if (route.agent === "nu") {
      updateState(chatId, { lastNewsBrief: reply });
    }
    await sendMessage(chatId, reply);
  } catch (error) {
    console.error("Next-Insight handler error:", error);
    await sendMessage(
      chatId,
      "에밀리예요. 방금 요청을 처리하다가 오류가 났어요. 잠시 뒤 다시 불러주세요."
    );
  }

  return res.status(200).json({ ok: true });
}

function routeMessage(text, state) {
  const normalized = text.toLowerCase();
  const ticker = extractTicker(text) || state.lastTicker || null;

  if (normalized.startsWith("/news") || text.includes("뉴대리") || text.includes("뉴스") || text.includes("최신")) {
    return { agent: "nu", intent: "news", ticker };
  }

  if (normalized.startsWith("/risk") || text.includes("반과장") || text.includes("반대") || text.includes("리스크")) {
    return { agent: "ban", intent: "risk", ticker };
  }

  if (normalized.startsWith("/memory") || text.includes("기대리") || text.includes("기억") || text.includes("지난번") || text.includes("thesis")) {
    return { agent: "ki", intent: "memory", ticker };
  }

  if (
    normalized.startsWith("/team") ||
    text.includes("팀회의") ||
    text.includes("팀 전체") ||
    text.includes("전체 의견") ||
    text.includes("팀 의견") ||
    text.includes("리서치팀") ||
    text.includes("종합 의견") ||
    text.includes("종합해서") ||
    text.includes("깊게") ||
    text.includes("딥")
  ) {
    return { agent: "team", intent: "team-review", ticker };
  }

  if (normalized.startsWith("/quick")) {
    return { agent: "emily", intent: "quick", ticker };
  }

  return { agent: "emily", intent: ticker ? "quick" : "general", ticker };
}

function extractTicker(text) {
  const upper = text.toUpperCase();
  const commandTicker = upper.match(/\/(?:QUICK|NEWS|RISK|MEMORY|TEAM)\s+([A-Z]{1,5})/);
  if (commandTicker) {
    return commandTicker[1];
  }

  const exact = WATCHLIST.find((ticker) => new RegExp(`\\b${ticker}\\b`, "i").test(text));
  if (exact) {
    return exact;
  }

  if (text.includes("양자")) {
    return "QUANTUM";
  }

  return null;
}

async function runRoute(route, userText, state) {
  if (!route.ticker && route.agent !== "emily") {
    return "에밀리예요. 어떤 종목에 대해 볼까요? 예: `에밀리 IREN 팀 전체 의견 줘`, `뉴대리 IREN 최신 뉴스`, `반과장 RKLB 의견은?`, `기대리 IONQ 기억 보여줘`";
  }

  if (route.agent === "nu") {
    return runNewsAgent(route.ticker, userText);
  }

  if (route.agent === "ban") {
    const memory = await loadTickerMemory(route.ticker);
    return runRiskAgent(route.ticker, userText, memory, state.lastNewsBrief);
  }

  if (route.agent === "ki") {
    const memory = await loadTickerMemory(route.ticker);
    return runMemoryAgent(route.ticker, userText, memory);
  }

  if (route.agent === "team") {
    return runTeamReview(route.ticker, userText);
  }

  return runEmily(route.ticker, userText, state);
}

async function runEmily(ticker, userText, state) {
  const context = ticker
    ? `현재 대화 종목: ${ticker}\n직전 호출 팀원: ${state.lastAgent || "없음"}\n직전 의도: ${state.lastIntent || "없음"}`
    : "현재 대화 종목 없음";

  return callClaude(
    EMILY_SYSTEM_PROMPT,
    `${context}

사용자 메시지:
${userText}

Emily로 답하세요. 사용자가 팀원을 부르는 방법도 자연스럽게 안내할 수 있습니다.`,
    1400
  );
}

async function runNewsAgent(ticker, userText) {
  const news = ticker && ticker !== "QUANTUM" ? await fetchCompanyNews(ticker) : [];
  const liveNewsContext = formatNewsContext(news);
  const apiStatus = process.env.FINNHUB_API_KEY
    ? "FINNHUB_API_KEY가 설정되어 있어 티커 뉴스 조회를 시도했습니다."
    : "FINNHUB_API_KEY가 아직 없어 실제 최신 뉴스 API 조회는 하지 못했습니다.";

  return callClaude(
    NU_SYSTEM_PROMPT,
    `담당 종목/테마: ${ticker || "미지정"}
사용자 요청: ${userText}
API 상태: ${apiStatus}

조회된 뉴스:
${liveNewsContext}

뉴대리로 답하세요. 뉴스가 없거나 API 키가 없으면 한계를 분명히 말하고, 어떤 API/소스가 연결되면 좋아질지도 짧게 말하세요.`,
    1600
  );
}

async function runRiskAgent(ticker, userText, memory, lastNewsBrief) {
  return callClaude(
    BAN_SYSTEM_PROMPT,
    `담당 종목/테마: ${ticker}
사용자 요청: ${userText}

기대리 메모:
${memory}

직전 뉴스 브리핑:
${lastNewsBrief || "직전 뉴스 브리핑 없음"}

반과장으로 답하세요. 좋은 점을 반복하기보다 thesis가 틀릴 수 있는 핵심 이유와 확인 조건을 말하세요.`,
    1500
  );
}

async function runMemoryAgent(ticker, userText, memory) {
  return callClaude(
    KI_SYSTEM_PROMPT,
    `담당 종목/테마: ${ticker}
사용자 요청: ${userText}

저장된 memory:
${memory}

기대리로 답하세요. 기존 thesis, watchpoint, 리스크, 다음 기록할 항목을 나누어 말하세요.`,
    1400
  );
}

async function runTeamReview(ticker, userText) {
  if (!ticker) {
    return "에밀리예요. 팀 전체 의견을 내려면 종목이나 테마를 알려주세요. 예: `에밀리 IREN 팀 전체 의견 줘`, `/team RKLB`, `양자컴퓨팅 깊게 봐줘`";
  }

  const [memory, newsReply] = await Promise.all([
    loadTickerMemory(ticker),
    getNewsContextForTeam(ticker),
  ]);

  return callClaude(
    `${EMILY_SYSTEM_PROMPT}

팀 전체 의견을 낼 때는 한 번의 응답 안에서 네 팀원의 목소리를 분리해 보여주세요.
- 에밀리: 최종 관점과 조율
- 뉴대리: 아래 뉴스 데이터만 근거로 최신 이벤트 해석
- 기대리: 아래 memory만 근거로 기존 thesis와 watchpoint 확인
- 반과장: 반대 논리와 리스크 제시`,
    `Heekyung이 팀회의를 요청했습니다.
종목/테마: ${ticker}
사용자 요청: ${userText}

뉴대리용 최신 뉴스 데이터:
${newsReply}

기대리용 종목 메모:
${memory}

Emily가 최종 팀 전체 의견으로 정리하세요.

중요:
- 실제 하위 에이전트를 따로 호출하지 않았지만, 각 팀원의 관점을 분리해 작성하세요.
- 뉴스 데이터에 없는 내용을 최신 사실처럼 말하지 마세요.
- Telegram에서 읽기 좋게 1200-1800자 정도로 답하세요.
- 최신 뉴스가 의견성 글이면 "의견성/분석글"로 표시하고 확정 사실처럼 말하지 마세요.
- 사용자가 후속으로 "반과장 더 자세히"처럼 물을 수 있도록 마지막에 다음 호출 힌트를 짧게 주세요.

형식:
Emily's View
한 줄 결론.

뉴대리 | 최신 이벤트
- 핵심 뉴스/이벤트 2-3개
- Thesis 영향: 강화/중립/약화

기대리 | 기존 기억
- 기존 thesis
- 지난 watchpoint와 이번 확인점

반과장 | 반대 논리
- 가장 중요한 리스크 2-3개
- 리스크 완화 조건

Emily 최종 정리
- 지금은 어떤 구간인지
- 다음 체크포인트 3개
- 정보 제공 고지`,
    2200
  );
}

async function getNewsContextForTeam(ticker) {
  if (!ticker || ticker === "QUANTUM") {
    return "티커 뉴스 API 조회 대상이 아닙니다. 테마성 질문이므로 최신 뉴스는 별도 확인이 필요합니다.";
  }

  const news = await fetchCompanyNews(ticker);
  const apiStatus = process.env.FINNHUB_API_KEY
    ? "FINNHUB_API_KEY로 최근 7일 company-news를 조회했습니다."
    : "FINNHUB_API_KEY가 없어 최신 뉴스 API 조회를 하지 못했습니다.";

  return `${apiStatus}

${formatNewsContext(news)}`;
}

async function fetchCompanyNews(ticker) {
  const token = process.env.FINNHUB_API_KEY;
  if (!token) {
    return [];
  }

  const to = new Date();
  const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  const params = new URLSearchParams({
    symbol: ticker,
    from: formatDate(from),
    to: formatDate(to),
    token,
  });
  const url = `https://finnhub.io/api/v1/company-news?${params.toString()}`;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) {
      console.warn("Finnhub company-news failed:", response.status, await response.text());
      return [];
    }

    const data = await response.json();
    return Array.isArray(data) ? data.slice(0, 6) : [];
  } catch (error) {
    console.warn("Finnhub company-news error:", error);
    return [];
  }
}

function formatNewsContext(news) {
  if (!news.length) {
    return "조회된 뉴스 없음";
  }

  return news
    .map((item, index) => {
      const date = item.datetime ? new Date(item.datetime * 1000).toISOString().slice(0, 10) : "날짜 없음";
      return `${index + 1}. [${item.source || "source unknown"} | ${date}] ${item.headline || "제목 없음"}
URL: ${item.url || "링크 없음"}
요약: ${item.summary || "요약 없음"}`;
    })
    .join("\n\n");
}

async function loadTickerMemory(ticker) {
  if (!ticker) {
    return "종목이 지정되지 않았습니다.";
  }

  const fileName = `${ticker.toUpperCase()}.md`;
  const filePath = path.join(process.cwd(), "_memory", fileName);

  try {
    return await readFile(filePath, "utf8");
  } catch {
    return `# ${ticker.toUpperCase()}

## Current Thesis
아직 저장된 thesis가 없습니다.

## Watchpoints
- 경영진 신뢰성
- 실제 고객/계약
- 현금 runway와 희석 리스크
- 기술 해자와 경쟁 구도

## Last Emily View
기록 없음`;
  }
}

async function callClaude(system, user, maxTokens) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });

  return response.content[0]?.text || "응답을 만들지 못했어요.";
}

function getState(chatId) {
  return conversationState.get(chatId) || {};
}

function updateState(chatId, nextState) {
  conversationState.set(chatId, {
    ...getState(chatId),
    ...nextState,
    updatedAt: new Date().toISOString(),
  });
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function helpMessage() {
  return `안녕하세요, 에밀리예요. 이제 Next-Insight는 팀 채팅 방식으로 움직입니다.

팀원:
- 에밀리: 디렉터, 최종 정리
- 뉴대리: 최신 뉴스/시장 이벤트
- 반과장: 반대 논리와 리스크
- 기대리: 종목별 기억과 지난 thesis

이렇게 불러보세요:
- 에밀리 IREN 어때?
- 뉴대리 RKLB 최신 뉴스 있어?
- 반과장 IREN 의견은?
- 기대리 RKLB 지난번 thesis 뭐였지?
- 에밀리 IREN 팀 전체 의견 줘
- RKLB 리서치팀 종합 의견은?
- 팀회의 IREN

명령어:
- /quick IREN
- /news RKLB
- /risk IONQ
- /memory IREN
- /team RKLB

최신 뉴스는 FINNHUB_API_KEY가 Vercel 환경변수에 설정되면 뉴대리가 실제 티커 뉴스를 조회합니다.`;
}

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
