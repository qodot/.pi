import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

const CUSTOM_INPUT_LABEL = "✏️ 직접 입력...";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "ask",
    label: "Ask User",
    description: `사용자에게 객관식 질문을 하고 답변을 받습니다. 마지막 옵션은 항상 '직접 입력'이 자동 추가되어 사용자가 주관식으로 답변할 수 있습니다.

사용 예시:
- 브랜드 카테고리 선택: ["화장품", "F&B", "패션", "테크", "라이프스타일"]
- 국가 선택: ["한국", "미국", "일본", "동남아"]
- 예/아니오 질문: ["예", "아니오"]

주의: options에 '직접 입력' 옵션을 넣지 마세요. 자동으로 추가됩니다.`,
    parameters: Type.Object({
      question: Type.String({ description: "사용자에게 보여줄 질문" }),
      options: Type.Array(Type.String(), { 
        description: "선택지 목록 (마지막에 '직접 입력' 옵션이 자동 추가됨)",
        minItems: 1 
      }),
      context: Type.Optional(Type.String({ 
        description: "질문에 대한 추가 설명이나 컨텍스트 (선택사항)" 
      })),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const { question, options, context } = params;

      // 선택지에 "직접 입력" 옵션 추가
      const allOptions = [...options, CUSTOM_INPUT_LABEL];

      // 질문 제목 구성
      let title = question;
      if (context) {
        title = `${question}\n${context}`;
      }

      // 사용자에게 선택 요청
      const selected = await ctx.ui.select(title, allOptions);

      // 취소된 경우
      if (selected === undefined) {
        return {
          content: [{ type: "text", text: "사용자가 취소했습니다." }],
          details: { cancelled: true, answer: null },
        };
      }

      let answer: string;

      // "직접 입력" 선택 시 멀티라인 에디터로 텍스트 입력 받기
      if (selected === CUSTOM_INPUT_LABEL) {
        const customInputValue = await ctx.ui.editor(`${question} (직접 입력)`, "");
        
        if (customInputValue === undefined || customInputValue.trim() === "") {
          return {
            content: [{ type: "text", text: "사용자가 취소했거나 빈 값을 입력했습니다." }],
            details: { cancelled: true, answer: null },
          };
        }
        
        answer = customInputValue.trim();
      } else {
        answer = selected;
      }

      return {
        content: [{ type: "text", text: `사용자 답변: ${answer}` }],
        details: { 
          cancelled: false, 
          answer,
          question,
          wasCustomInput: selected === CUSTOM_INPUT_LABEL,
        },
      };
    },
  });

  // 여러 질문을 한 번에 할 수 있는 도구
  pi.registerTool({
    name: "ask_multi",
    label: "Ask User Multiple",
    description: `사용자에게 여러 개의 객관식 질문을 순차적으로 하고 답변을 받습니다. 각 질문의 마지막 옵션은 '직접 입력'이 자동 추가됩니다.

사용 예시:
questions: [
  { key: "country", question: "대상 국가는?", options: ["한국", "미국", "일본"] },
  { key: "platform", question: "주요 플랫폼은?", options: ["TikTok", "Instagram", "YouTube"] }
]`,
    parameters: Type.Object({
      questions: Type.Array(
        Type.Object({
          key: Type.String({ description: "응답을 저장할 키 이름" }),
          question: Type.String({ description: "질문 내용" }),
          options: Type.Array(Type.String(), { description: "선택지 목록" }),
          context: Type.Optional(Type.String({ description: "추가 설명" })),
        }),
        { description: "질문 목록", minItems: 1 }
      ),
    }),

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const { questions } = params;
      const answers: Record<string, string> = {};
      const results: Array<{ key: string; question: string; answer: string; wasCustomInput: boolean }> = [];

      for (const q of questions) {
        const allOptions = [...q.options, CUSTOM_INPUT_LABEL];
        
        let title = q.question;
        if (q.context) {
          title = `${q.question}\n${q.context}`;
        }

        const selected = await ctx.ui.select(title, allOptions);

        if (selected === undefined) {
          return {
            content: [{ type: "text", text: `'${q.question}' 질문에서 사용자가 취소했습니다.` }],
            details: { cancelled: true, answers, completedQuestions: results },
          };
        }

        let answer: string;
        let wasCustomInput = false;

        if (selected === CUSTOM_INPUT_LABEL) {
          const customInputValue = await ctx.ui.editor(`${q.question} (직접 입력)`, "");
          
          if (customInputValue === undefined || customInputValue.trim() === "") {
            return {
              content: [{ type: "text", text: `'${q.question}' 질문에서 사용자가 취소했습니다.` }],
              details: { cancelled: true, answers, completedQuestions: results },
            };
          }
          
          answer = customInputValue.trim();
          wasCustomInput = true;
        } else {
          answer = selected;
        }

        answers[q.key] = answer;
        results.push({ key: q.key, question: q.question, answer, wasCustomInput });
      }

      // 결과 포맷팅
      const summaryLines = results.map(r => `- ${r.question}: ${r.answer}`);
      const summary = `사용자 답변:\n${summaryLines.join("\n")}`;

      return {
        content: [{ type: "text", text: summary }],
        details: { 
          cancelled: false, 
          answers,
          results,
        },
      };
    },
  });
}
