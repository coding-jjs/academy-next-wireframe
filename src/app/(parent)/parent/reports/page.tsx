import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import ParentReportsScreen from "@/app/(parent)/parent/reports/ParentReportsScreen";
import type { ParentReportChild } from "@/app/(parent)/parent/reports/ParentReportsScreen";

export const dynamic = "force-dynamic";

export default async function ParentReportsPage() {
    const session = await auth();

    if (!session?.user?.id) {
        redirect("/login");
    }

    if (session.user.role !== "PARENT") {
        redirect("/post-login");
    }

    const links = await prisma.parentStudentLink.findMany({
        where: {
            parentUserId: session.user.id,
            endedAt: null,
        },
        select: {
            student: {
                select: {
                    id: true,
                    name: true,
                    schoolName: true,
                    grade: true,
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
                        where: { status: "SENT" },
                        orderBy: { periodEnd: "desc" },
                        select: {
                            id: true,
                            content: true,
                            keywords: true,
                            periodStart: true,
                            periodEnd: true,
                            sentAt: true,
                            parentReadAt: true,
                            author: { select: { name: true } },
                        },
                    },
                },
            },
        },
        orderBy: { linkedAt: "asc" },
    });

    const children: ParentReportChild[] = links.map(({ student }) => {
        const enrollment = student.enrollments[0];

        return {
            id: student.id,
            name: student.name,
            schoolName: student.schoolName,
            grade: student.grade,
            className: enrollment?.class.name ?? null,
            teacherName: enrollment?.class.teacher?.name ?? null,
            reports: student.reports.map((report) => {
                const keywords = report.keywords;
                return {
                    id: report.id,
                    content: report.content,
                    keywords: Array.isArray(keywords)
                        ? keywords.filter(
                              (item): item is string => typeof item === "string",
                          )
                        : [],
                    teacherName: report.author.name,
                    periodStart: report.periodStart.toISOString(),
                    periodEnd: report.periodEnd.toISOString(),
                    sentAt: report.sentAt?.toISOString() ?? null,
                    parentReadAt: report.parentReadAt?.toISOString() ?? null,
                };
            }),
        };
    });

    return <ParentReportsScreen childList={children} />;
}