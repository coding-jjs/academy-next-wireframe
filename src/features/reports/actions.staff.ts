"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { gemini } from "@/lib/ai";

type StaffActionResult =
    | { ok: true; reportId: string; status: "DRAFTING" | "PENDING_APPROVAL" }
    | { ok: false; message: string };

type SaveDraftInput = {
    studentId: string; // Student.id
    content: string;
    keywords: string[];
    periodStart: string; // YYYY-MM-DD
    periodEnd: string; // YYYY-MM-DD
};

type RegenerateDraftInput = {
    studentId: string; // Student.id
    keywords: string[];
    tone: string;
    periodStart: string; // YYYY-MM-DD
    periodEnd: string; // YYYY-MM-DD
};

type RequestApprovalInput = {
    reportId: string;
};

async function assertStaffPermission() {
    const session = await auth();

    if (!session?.user?.id || !session.user.role) {
        throw new Error("로그인이 필요합니다.");
    }

    const role = session.user.role;
    if (role !== "TEACHER" && role !== "STAFF" && role !== "DIRECTOR") {
        throw new Error("리포트를 작성할 권한이 없습니다.");
    }

    // DIRECTOR는 전체 권한으로 예외 허용
    if (role !== "DIRECTOR") {
        const grant = await prisma.permissionGrant.findUnique({
            where: { userId: session.user.id },
            select: { writeAiReport: true },
        });

        if (!grant?.writeAiReport) {
            throw new Error("AI 리포트 작성 권한이 없습니다.");
        }
    }

    return session.user;
}

function parseDateOnly(yyyyMmDd: string) {
    const d = new Date(`${yyyyMmDd}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) {
        throw new Error("날짜 형식이 올바르지 않습니다.");
    }
    return d;
}

function sanitizeKeywords(keywords: string[]) {
    return keywords
        .map((k) => k.trim())
        .filter(Boolean)
        .slice(0, 10);
}

async function findOrCreateDraft(params: {
    studentId: string;
    authorUserId: string;
    periodStart: Date;
    periodEnd: Date;
    content: string;
    keywords: string[];
}) {
    const existing = await prisma.aiReport.findFirst({
        where: {
            studentId: params.studentId,
            periodStart: params.periodStart,
            periodEnd: params.periodEnd,
            authorUserId: params.authorUserId,
            status: { in: ["UNWRITTEN", "DRAFTING", "REJECTED"] },
        },
        orderBy: { createdAt: "desc" },
        select: { id: true },
    });

    if (existing) {
        return prisma.aiReport.update({
            where: { id: existing.id },
            data: {
                content: params.content,
                keywords: params.keywords,
                status: "DRAFTING",
                rejectionReason: null,
            },
            select: { id: true, status: true },
        });
    }

    return prisma.aiReport.create({
        data: {
            studentId: params.studentId,
            authorUserId: params.authorUserId,
            periodStart: params.periodStart,
            periodEnd: params.periodEnd,
            content: params.content,
            keywords: params.keywords,
            status: "DRAFTING",
        },
        select: { id: true, status: true },
    });
}

/**
 * 수동 초안 저장
 */
export async function saveDraftReport(
    input: SaveDraftInput,
): Promise<StaffActionResult> {
    try {
        const user = await assertStaffPermission();

        const periodStart = parseDateOnly(input.periodStart);
        const periodEnd = parseDateOnly(input.periodEnd);

        if (periodEnd < periodStart) {
            return { ok: false, message: "기간 종료일은 시작일 이후여야 합니다." };
        }

        const student = await prisma.student.findUnique({
            where: { id: input.studentId },
            select: { id: true },
        });

        if (!student) {
            return { ok: false, message: "학생 정보를 찾을 수 없습니다." };
        }

        const report = await findOrCreateDraft({
            studentId: input.studentId,
            authorUserId: user.id,
            periodStart,
            periodEnd,
            content: input.content.trim(),
            keywords: sanitizeKeywords(input.keywords),
        });

        revalidatePath("/staff/reports");
        revalidatePath("/director/reports");

        return { ok: true, reportId: report.id, status: "DRAFTING" };
    } catch (error) {
        return {
            ok: false,
            message:
                error instanceof Error
                    ? error.message
                    : "초안 저장 중 오류가 발생했습니다.",
        };
    }
}

/**
 * Gemini로 초안 재생성 후 DRAFTING 저장
 */
export async function regenerateDraftWithAi(
    input: RegenerateDraftInput,
): Promise<StaffActionResult> {
    try {
        const user = await assertStaffPermission();

        const periodStart = parseDateOnly(input.periodStart);
        const periodEnd = parseDateOnly(input.periodEnd);

        if (periodEnd < periodStart) {
            return { ok: false, message: "기간 종료일은 시작일 이후여야 합니다." };
        }

        const student = await prisma.student.findUnique({
            where: { id: input.studentId },
            select: {
                id: true,
                name: true,
                grade: true,
                schoolName: true,
                learningRecords: {
                    orderBy: { recordDate: "desc" },
                    take: 5,
                    select: {
                        recordDate: true,
                        type: true,
                        title: true,
                        content: true,
                    },
                },
                attendance: {
                    orderBy: { createdAt: "desc" },
                    take: 5,
                    select: {
                        status: true,
                        createdAt: true,
                        session: {
                            select: {
                                startsAt: true,
                            },
                        },
                    },
                },
                gradeRecords: {
                    orderBy: { assessedAt: "desc" },
                    take: 5,
                    select: {
                        title: true,
                        subject: true,
                        score: true,
                        maxScore: true,
                        assessedAt: true,
                    },
                },
            },
        });

        if (!student) {
            return { ok: false, message: "학생 정보를 찾을 수 없습니다." };
        }

        const keywords = sanitizeKeywords(input.keywords);

        const learningEvidence = student.learningRecords.map((r) => {
            const day = r.recordDate.toISOString().slice(0, 10);
            return `학습기록(${day}) [${r.type}] ${r.title}: ${r.content}`;
        });

        const attendanceEvidence = student.attendance.map((a) => {
            const day = a.session.startsAt.toISOString().slice(0, 10);
            return `출결(${day}): ${a.status}`;
        });

        const gradeEvidence = student.gradeRecords.map((g) => {
            const day = g.assessedAt.toISOString().slice(0, 10);
            return `성적(${day}) ${g.subject}/${g.title}: ${g.score.toString()}/${g.maxScore.toString()}`;
        });

        const evidence = [
            ...learningEvidence,
            ...attendanceEvidence,
            ...gradeEvidence,
        ];

        const prompt = [
            "너는 학원 교사의 리포트 작성 보조자다.",
            "학부모에게 전달할 월간 학습 리포트를 한국어로 작성해라.",
            "",
            "작성 규칙:",
            "- 사실 기반, 과장/허위 금지",
            "- 제공된 근거 데이터만 사용",
            "- 존댓말, 부드러운 교육기관 톤",
            "- 4~6문장",
            `- 톤: ${input.tone}`,
            `- 키워드: ${keywords.join(", ") || "없음"}`,
            "",
            `학생: ${student.name}`,
            `학년: ${student.grade ?? "미입력"}`,
            `학교: ${student.schoolName ?? "미입력"}`,
            `기간: ${input.periodStart} ~ ${input.periodEnd}`,
            "",
            "근거 데이터:",
            ...(evidence.length > 0 ? evidence : ["- 근거 데이터 없음"]),
            "",
            "출력 형식:",
            "- 본문만 출력 (제목/머리말/불릿/마크다운 금지)",
        ].join("\n");

        const model = gemini.getGenerativeModel({
            model: "gemini-1.5-flash",
        });

        const result = await model.generateContent(prompt);
        const text = result.response.text().trim();

        if (!text) {
            return { ok: false, message: "AI 초안 생성 결과가 비어 있습니다." };
        }

        const report = await findOrCreateDraft({
            studentId: student.id,
            authorUserId: user.id,
            periodStart,
            periodEnd,
            content: text,
            keywords,
        });

        revalidatePath("/staff/reports");
        revalidatePath("/director/reports");

        return { ok: true, reportId: report.id, status: "DRAFTING" };
    } catch (error) {
        return {
            ok: false,
            message:
                error instanceof Error
                    ? error.message
                    : "AI 재생성 중 오류가 발생했습니다.",
        };
    }
}

/**
 * 승인 요청 (DRAFTING/REJECTED -> PENDING_APPROVAL)
 */
export async function requestReportApproval(
    input: RequestApprovalInput,
): Promise<StaffActionResult> {
    try {
        const user = await assertStaffPermission();

        const target = await prisma.aiReport.findUnique({
            where: { id: input.reportId },
            select: {
                id: true,
                authorUserId: true,
                status: true,
                content: true,
            },
        });

        if (!target) {
            return { ok: false, message: "리포트를 찾을 수 없습니다." };
        }

        if (target.authorUserId !== user.id && user.role !== "DIRECTOR") {
            return {
                ok: false,
                message: "본인이 작성한 리포트만 요청할 수 있습니다.",
            };
        }

        if (!target.content.trim()) {
            return { ok: false, message: "내용이 비어 있어 승인 요청할 수 없습니다." };
        }

        if (!["DRAFTING", "REJECTED"].includes(target.status)) {
            return {
                ok: false,
                message: `현재 상태(${target.status})에서는 승인 요청할 수 없습니다.`,
            };
        }

        const updated = await prisma.aiReport.update({
            where: { id: target.id },
            data: {
                status: "PENDING_APPROVAL",
                rejectionReason: null,
            },
            select: { id: true, status: true },
        });

        revalidatePath("/staff/reports");
        revalidatePath("/director/reports");

        return { ok: true, reportId: updated.id, status: "PENDING_APPROVAL" };
    } catch (error) {
        return {
            ok: false,
            message:
                error instanceof Error
                    ? error.message
                    : "승인 요청 중 오류가 발생했습니다.",
        };
    }
}