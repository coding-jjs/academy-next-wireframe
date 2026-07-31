"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export type EnrollmentActionResult = {
    ok: boolean;
    message: string;
};

async function requireDirector() {
    const session = await auth();
    if (!session?.user || session.user.role !== "DIRECTOR") {
        return null;
    }
    return session;
}

export async function addStudentEnrollment(input: {
    studentId: string;
    classId: string;
}): Promise<EnrollmentActionResult> {
    try {
        const session = await requireDirector();
        if (!session) {
            return { ok: false, message: "권한이 없습니다." };
        }

        const { studentId, classId } = input;
        if (!studentId || !classId) {
            return { ok: false, message: "학생과 반을 확인해주세요." };
        }

        await prisma.$transaction(async (tx) => {
            const student = await tx.student.findFirst({
                where: { id: studentId },
                select: { id: true },
            });
            if (!student) {
                throw new Error("학생을 찾을 수 없습니다.");
            }

            const classRow = await tx.class.findFirst({
                where: { id: classId, active: true },
                select: { id: true },
            });
            if (!classRow) {
                throw new Error("추가할 수 없는 반입니다.");
            }

            const active = await tx.classEnrollment.findFirst({
                where: {
                    studentId,
                    classId,
                    status: "ACTIVE",
                    endedAt: null,
                },
                select: { id: true },
            });
            if (active) {
                throw new Error("이미 수강 중인 반입니다.");
            }

            await tx.classEnrollment.create({
                data: {
                    studentId,
                    classId,
                    status: "ACTIVE",
                },
            });
        });

        revalidatePath("/director/students");
        return { ok: true, message: "반이 추가되었습니다." };
    } catch (error) {
        console.error(error);
        return {
            ok: false,
            message:
                error instanceof Error
                    ? error.message
                    : "반 추가에 실패했습니다.",
        };
    }
}

export async function endStudentEnrollment(input: {
    enrollmentId: string;
}): Promise<EnrollmentActionResult> {
    try {
        const session = await requireDirector();
        if (!session) {
            return { ok: false, message: "권한이 없습니다." };
        }

        const { enrollmentId } = input;
        if (!enrollmentId) {
            return { ok: false, message: "수강 정보가 올바르지 않습니다." };
        }

        const enrollment = await prisma.classEnrollment.findFirst({
            where: {
                id: enrollmentId,
                status: "ACTIVE",
                endedAt: null,
            },
            select: { id: true },
        });

        if (!enrollment) {
            return {
                ok: false,
                message: "이미 해제됐거나 없는 수강입니다.",
            };
        }

        await prisma.classEnrollment.update({
            where: { id: enrollment.id },
            data: {
                status: "CANCELLED",
                endedAt: new Date(),
            },
        });

        revalidatePath("/director/students");
        return { ok: true, message: "수강이 해제되었습니다." };
    } catch (error) {
        console.error(error);
        return {
            ok: false,
            message:
                error instanceof Error
                    ? error.message
                    : "수강 해제에 실패했습니다.",
        };
    }
}