"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

type DirectorActionResult =
    | { ok: true; reportId: string; status: "SENT" | "REJECTED" }
    | { ok: false; message: string };

type ApproveInput = {
    reportId: string;
};

type RejectInput = {
    reportId: string;
    rejectionReason: string;
};

async function assertDirector() {
    const session = await auth();

    if (!session?.user?.id || session.user.role !== "DIRECTOR") {
        throw new Error("원장 권한이 필요합니다.");
    }

    return session.user;
}

/**
 * 승인 + 발송
 * PENDING_APPROVAL -> SENT
 */
export async function approveAndSendReport(
    input: ApproveInput,
): Promise<DirectorActionResult> {
    try {
        const user = await assertDirector();

        const target = await prisma.aiReport.findUnique({
            where: { id: input.reportId },
            select: {
                id: true,
                status: true,
                content: true,
                studentId: true,
            },
        });

        if (!target) {
            return { ok: false, message: "리포트를 찾을 수 없습니다." };
        }

        if (target.status !== "PENDING_APPROVAL") {
            return {
                ok: false,
                message: `현재 상태(${target.status})에서는 승인할 수 없습니다.`,
            };
        }

        if (!target.content.trim()) {
            return { ok: false, message: "내용이 비어 있어 발송할 수 없습니다." };
        }

        const now = new Date();

        const updated = await prisma.aiReport.update({
            where: { id: target.id },
            data: {
                status: "SENT",
                approverUserId: user.id,
                approvedAt: now,
                sentAt: now,
                rejectionReason: null,
            },
            select: {
                id: true,
                status: true,
                student: {
                    select: {
                        name: true,
                        parentLinks: {
                            where: { endedAt: null },
                            select: { parentUserId: true },
                        },
                    },
                },
            },
        });

        // 선택: 메시지 알림 생성 (부모 연결이 있을 때)
        const parentIds = updated.student.parentLinks.map((l) => l.parentUserId);

        if (parentIds.length > 0) {
            await prisma.$transaction(async (tx) => {
                const message = await tx.message.create({
                    data: {
                        senderUserId: user.id,
                        reportId: updated.id,
                        title: `${updated.student.name} 학습 리포트가 도착했어요`,
                        content:
                            "새로운 AI 학습 리포트가 발송되었습니다. 리포트 화면에서 확인해 주세요.",
                        deepLink: "/parent/reports",
                    },
                    select: { id: true },
                });

                await tx.messageRecipient.createMany({
                    data: parentIds.map((parentUserId) => ({
                        messageId: message.id,
                        recipientUserId: parentUserId,
                    })),
                    skipDuplicates: true,
                });
            });
        }

        revalidatePath("/director/reports");
        revalidatePath("/staff/reports");
        revalidatePath("/parent/reports");

        return { ok: true, reportId: updated.id, status: "SENT" };
    } catch (error) {
        return {
            ok: false,
            message:
                error instanceof Error
                    ? error.message
                    : "승인 처리 중 오류가 발생했습니다.",
        };
    }
}

/**
 * 반려
 * PENDING_APPROVAL -> REJECTED
 */
export async function rejectReport(
    input: RejectInput,
): Promise<DirectorActionResult> {
    try {
        await assertDirector();

        const reason = input.rejectionReason.trim();
        if (!reason) {
            return { ok: false, message: "반려 사유를 입력해 주세요." };
        }

        const target = await prisma.aiReport.findUnique({
            where: { id: input.reportId },
            select: { id: true, status: true },
        });

        if (!target) {
            return { ok: false, message: "리포트를 찾을 수 없습니다." };
        }

        if (target.status !== "PENDING_APPROVAL") {
            return {
                ok: false,
                message: `현재 상태(${target.status})에서는 반려할 수 없습니다.`,
            };
        }

        const updated = await prisma.aiReport.update({
            where: { id: target.id },
            data: {
                status: "REJECTED",
                rejectionReason: reason,
            },
            select: { id: true, status: true },
        });

        revalidatePath("/director/reports");
        revalidatePath("/staff/reports");

        return { ok: true, reportId: updated.id, status: "REJECTED" };
    } catch (error) {
        return {
            ok: false,
            message:
                error instanceof Error
                    ? error.message
                    : "반려 처리 중 오류가 발생했습니다.",
        };
    }
}