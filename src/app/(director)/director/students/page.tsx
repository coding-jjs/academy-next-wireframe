import { prisma } from "@/lib/db";
import DirectorStudentsScreen from "@/app/(director)/director/students/DirectorStudentsScreen";
import type {
    DirectorStudent,
    DirectorClassOption,
    StudentStatus,
} from "@/app/(director)/director/students/DirectorStudentsScreen";

export const dynamic = "force-dynamic";

export default async function DirectorStudentsPage() {
    const [students, classes] = await Promise.all([
        prisma.student.findMany({
            select: {
                id: true,
                name: true,
                schoolName: true,
                grade: true,
                status: true,
                user: {
                    select: {
                        id: true,
                        email: true,
                    },
                },
                enrollments: {
                    where: {
                        status: "ACTIVE",
                        endedAt: null,
                    },
                    select: {
                        id: true,
                        enrolledAt: true,
                        class: {
                            select: {
                                id: true,
                                name: true,
                                teacher: { select: { name: true } },
                            },
                        },
                    },
                    orderBy: { enrolledAt: "asc" },
                },
                parentLinks: {
                    where: { endedAt: null },
                    select: {
                        id: true,
                        relationship: true,
                        parent: {
                            select: { name: true },
                        },
                    },
                },
            },
            orderBy: { name: "asc" },
        }),
        prisma.class.findMany({
            where: { active: true },
            select: {
                id: true,
                name: true,
                teacher: { select: { name: true } },
            },
            orderBy: { name: "asc" },
        }),
    ]);

    const endedByStudent = await prisma.classEnrollment.findMany({
        where: {
            studentId: { in: students.map((s) => s.id) },
            endedAt: { not: null },
        },
        select: {
            id: true,
            studentId: true,
            endedAt: true,
            status: true,
            class: { select: { name: true } },
        },
        orderBy: { endedAt: "desc" },
    });

    const endedMap = new Map<string, typeof endedByStudent>();
    for (const row of endedByStudent) {
        const list = endedMap.get(row.studentId) ?? [];
        if (list.length < 5) {
            list.push(row);
            endedMap.set(row.studentId, list);
        }
    }

    const rows: DirectorStudent[] = students.map((student) => ({
        id: student.id,
        name: student.name,
        schoolName: student.schoolName,
        grade: student.grade,
        status: student.status as StudentStatus,
        googleLinked: Boolean(student.user),
        email: student.user?.email ?? null,
        parentCount: student.parentLinks.length,
        parentNames: student.parentLinks.map(
            (link) =>
                `${link.parent.name}${link.relationship ? ` (${link.relationship})` : ""}`,
        ),
        classes: student.enrollments.map((enrollment) => ({
            enrollmentId: enrollment.id,
            classId: enrollment.class.id,
            className: enrollment.class.name,
            teacherName: enrollment.class.teacher?.name ?? null,
            enrolledAt: enrollment.enrolledAt.toISOString(),
        })),
        recentChanges: (endedMap.get(student.id) ?? []).map((row) => ({
            id: row.id,
            className: row.class.name,
            endedAt: row.endedAt!.toISOString(),
            status: row.status,
        })),
    }));

    const classOptions: DirectorClassOption[] = classes.map((item) => ({
        id: item.id,
        name: item.name,
        teacherName: item.teacher?.name ?? null,
    }));

    return (
        <DirectorStudentsScreen students={rows} classOptions={classOptions} />
    );
}