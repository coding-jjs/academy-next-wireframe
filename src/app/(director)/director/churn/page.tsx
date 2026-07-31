import { prisma } from "@/lib/db";
import DirectorChurnScreen from "./DirectorChurnScreen";
import type {
    ChurnCaseStatus,
    ChurnSignalType,
    DirectorChurnCase,
} from "./DirectorChurnScreen";

export const dynamic = "force-dynamic";

const SIGNAL_LABEL: Record<ChurnSignalType, string> = {
    ATTENDANCE_DROP: "출석 하락",
    SCORE_DROP: "성적 하락",
    CONSECUTIVE_ABSENCE: "연속 결석",
    UNPAID_DAYS: "미납",
};

function formatReason(
    signals: { type: ChurnSignalType; value: { toString(): string } | null }[],
    summary: string | null,
) {
    if (summary?.trim()) return summary;
    if (signals.length === 0) return "신호 없음";
    return signals
        .map((s) => {
            const label = SIGNAL_LABEL[s.type];
            return s.value != null ? `${label} (${s.value})` : label;
        })
        .join(" · ");
}

export default async function DirectorChurnPage() {
    const [students, thresholdRow] = await Promise.all([
        prisma.student.findMany({
            where: { status: "ENROLLED" },
            select: {
                id: true,
                name: true,
                schoolName: true,
                grade: true,
                enrollments: {
                    where: { status: "ACTIVE", endedAt: null },
                    take: 1,
                    select: {
                        class: {
                            select: {
                                name: true,
                                teacher: { select: { name: true } },
                            },
                        },
                    },
                },
                churnCases: {
                    orderBy: { detectedAt: "desc" },
                    take: 1,
                    select: {
                        id: true,
                        status: true,
                        summary: true,
                        detectedAt: true,
                        assignee: { select: { name: true } },
                        signals: {
                            orderBy: { detectedAt: "desc" },
                            take: 3,
                            select: {
                                type: true,
                                value: true,
                            },
                        },
                    },
                },
            },
            orderBy: { name: "asc" },
        }),
        prisma.churnThresholdConfig.findUnique({ where: { id: 1 } }),
    ]);

    const cases: DirectorChurnCase[] = students.map((student) => {
        const enrollment = student.enrollments[0];
        const churn = student.churnCases[0] ?? null;

        return {
            id: churn?.id ?? student.id,
            studentId: student.id,
            studentName: student.name,
            schoolName: student.schoolName,
            grade: student.grade,
            className: enrollment?.class.name ?? null,
            teacherName:
                churn?.assignee?.name ??
                enrollment?.class.teacher?.name ??
                null,
            reason: churn
                ? formatReason(churn.signals, churn.summary)
                : "이탈 신호 없음",
            status: (churn?.status as ChurnCaseStatus | null) ?? null,
            detectedAt: churn?.detectedAt.toISOString() ?? null,
        };
    });

    const threshold = {
        attendanceDropPercentPoint: Number(
            thresholdRow?.attendanceDropPercentPoint ?? 15,
        ),
        scoreDropPoints: Number(thresholdRow?.scoreDropPoints ?? 10),
        consecutiveAbsences: thresholdRow?.consecutiveAbsences ?? 2,
        unpaidDays: thresholdRow?.unpaidDays ?? 3,
    };

    return <DirectorChurnScreen cases={cases} threshold={threshold} />;
}