
// npm install @google/generative-ai <-- 설치 필요
import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
    throw new Error("GEMINI_API_KEY가 설정되지 않았습니다.");
}

const globalForAi = globalThis as unknown as {
    gemini: GoogleGenerativeAI | undefined;
};

export const gemini =
    globalForAi.gemini ?? new GoogleGenerativeAI(apiKey);

if (process.env.NODE_ENV !== "production") {
    globalForAi.gemini = gemini;
}