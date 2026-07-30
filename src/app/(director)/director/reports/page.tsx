import { prisma } from "@/lib/db";
import DirectorReportsScreen from "@/features/reports/DirectorReportsScreen";
import type { DirectorReportStudent } from "@/features/reports/DirectorReportsScreen";

export const dynamic = "force-dynamic";

export default async function DirectorReportsPage() {
    const users = await prisma.user.findMany({
        where: {
            role: "STUDENT",
            status: "ACTIVE",
        },
        select: {
            id: true,
            name: true,
            email: true,
            schoolName: true,
            grade: true,
            createdAt: true,
            studentProfile: {
                select: {
                    id: true,
                    status: true,
                    enrollments: {
                        where: { status: "ACTIVE", endedAt: null },
                        select: {
                            class: {
                                select: {
                                    name: true,
                                    teacher: { select: { name: true } },
                                },
                            },
                        },
                        take: 1,
                    },
                    reports: {
                        orderBy: { createdAt: "desc" },
                        take: 1,
                        select: {
                            id: true,
                            status: true,
                            content: true,
                            periodStart: true,
                            periodEnd: true,
                            author: { select: { name: true } },
                        },
                    },
                },
            },
        },
        orderBy: { name: "asc" },
    });

    const students: DirectorReportStudent[] = users.map((user) => {
        const enrollment = user.studentProfile?.enrollments[0];
        const latestReport = user.studentProfile?.reports[0];

        return {
            id: user.id,
            studentProfileId: user.studentProfile?.id ?? null,
            name: user.name,
            email: user.email,
            schoolName: user.schoolName,
            grade: user.grade,
            className: enrollment?.class.name ?? null,
            teacherName: enrollment?.class.teacher?.name ?? null,
            report: latestReport
                ? {
                      id: latestReport.id,
                      status: latestReport.status,
                      content: latestReport.content,
                      teacherName: latestReport.author.name,
                      periodStart: latestReport.periodStart.toISOString(),
                      periodEnd: latestReport.periodEnd.toISOString(),
                  }
                : null,
        };
    });

    return <DirectorReportsScreen students={students} />;
}