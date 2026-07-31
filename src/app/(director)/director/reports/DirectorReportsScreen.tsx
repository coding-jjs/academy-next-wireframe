"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import StatusChip from "@/components/ui/StatusChip";
import { approveAndSendReport, rejectReport } from "./actions.director";
import styles from "./DirectorReportsScreen.module.css";

export type ReportStatus =
    | "UNWRITTEN"
    | "DRAFTING"
    | "PENDING_APPROVAL"
    | "REJECTED"
    | "SENT"
    | "FAILED";

export type DirectorReportStudent = {
    id: string;
    studentProfileId: string | null;
    name: string;
    email: string;
    schoolName: string | null;
    grade: string | null;
    className: string | null;
    teacherName: string | null;
    report: {
        id: string;
        status: ReportStatus;
        content: string;
        teacherName: string;
        periodStart: string;
        periodEnd: string;
    } | null;
};

const statusMeta: Record<
    ReportStatus,
    { label: string; tone: "neutral" | "success" | "warning" | "danger" }
> = {
    UNWRITTEN: { label: "미작성", tone: "neutral" },
    DRAFTING: { label: "작성 중", tone: "neutral" },
    PENDING_APPROVAL: { label: "승인 대기", tone: "warning" },
    REJECTED: { label: "반려", tone: "danger" },
    SENT: { label: "발송됨", tone: "success" },
    FAILED: { label: "실패", tone: "danger" },
};

function getStatus(student: DirectorReportStudent): ReportStatus {
    return student.report?.status ?? "UNWRITTEN";
}

export default function DirectorReportsScreen({
    students,
}: {
    students: DirectorReportStudent[];
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const [activeId, setActiveId] = useState<string | null>(
        students[0]?.id ?? null,
    );
    const [rejectionReason, setRejectionReason] = useState("");
    const [feedback, setFeedback] = useState<string | null>(null);

    const stats = useMemo(() => {
        const counts = {
            PENDING_APPROVAL: 0,
            REJECTED: 0,
            SENT: 0,
            UNWRITTEN: 0,
        };
        for (const student of students) {
            const status = getStatus(student);
            if (status in counts) {
                counts[status as keyof typeof counts] += 1;
            } else if (status === "DRAFTING" || status === "FAILED") {
                counts.UNWRITTEN += 1;
            }
        }
        return [
            {
                label: "승인 대기",
                value: `${counts.PENDING_APPROVAL}건`,
                detail: "교사 작성 완료",
                tone: "warning" as const,
            },
            {
                label: "반려",
                value: `${counts.REJECTED}건`,
                detail: "재작성 중",
                tone: "danger" as const,
            },
            {
                label: "발송·미작성",
                value: `${counts.SENT} / ${counts.UNWRITTEN}`,
                detail: `학생 ${students.length}명`,
                tone: "success" as const,
            },
        ];
    }, [students]);

    const active = students.find((s) => s.id === activeId) ?? null;
    const activeStatus = active ? getStatus(active) : null;

    function handleApprove() {
        if (!active?.report?.id) return;

        setFeedback(null);

        startTransition(async () => {
            const result = await approveAndSendReport({
                reportId: active.report!.id,
            });

            if (!result.ok) {
                setFeedback(result.message);
                return;
            }

            setFeedback("승인·발송 완료");
            router.refresh();
        });
    }

    function handleReject() {
        if (!active?.report?.id) return;

        if (!rejectionReason.trim()) {
            setFeedback("반려 사유를 입력해 주세요.");
            return;
        }

        setFeedback(null);

        startTransition(async () => {
            const result = await rejectReport({
                reportId: active.report!.id,
                rejectionReason,
            });

            if (!result.ok) {
                setFeedback(result.message);
                return;
            }

            setFeedback("반려 처리 완료");
            setRejectionReason("");
            router.refresh();
        });
    }

    return (
        <section className={styles.page}>
            <header className={styles.heading}>
                <div>
                    <span>AI REPORT</span>
                    <h1>리포트 승인</h1>
                    <p>역할이 학생인 사용자를 기준으로 리포트 상태를 확인합니다.</p>
                </div>
            </header>

            <div className={styles.metrics}>
                {stats.map((item) => (
                    <article key={item.label}>
                        <StatusChip tone={item.tone}>{item.label}</StatusChip>
                        <strong>{item.value}</strong>
                        <p>{item.detail}</p>
                    </article>
                ))}
            </div>

            {students.length === 0 ? (
                <div className={styles.emptyPanel}>
                    <h2>표시할 학생이 없습니다</h2>
                    <p>가입 사용자에서 역할을 학생으로 부여하면 이곳에 나타납니다.</p>
                </div>
            ) : (
                <div className={styles.layout}>
                    <article className={styles.tablePanel}>
                        <div className={styles.panelHead}>
                            <h2>학생 목록</h2>
                            <StatusChip>{students.length}명</StatusChip>
                        </div>

                        <div className={styles.tableWrap}>
                            <table>
                                <thead>
                                    <tr>
                                        <th>학생</th>
                                        <th>학교·학년</th>
                                        <th>반</th>
                                        <th>상태</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {students.map((student) => {
                                        const status = getStatus(student);
                                        const meta = statusMeta[status];
                                        return (
                                            <tr
                                                key={student.id}
                                                className={
                                                    student.id === activeId
                                                        ? styles.activeRow
                                                        : undefined
                                                }
                                                onClick={() => {
                                                    setActiveId(student.id);
                                                    setFeedback(null);
                                                    setRejectionReason("");
                                                }}
                                            >
                                                <td>
                                                    <strong>{student.name}</strong>
                                                    <small>{student.email}</small>
                                                </td>
                                                <td>
                                                    {formatSchool(
                                                        student.schoolName,
                                                        student.grade,
                                                    )}
                                                </td>
                                                <td>{student.className ?? "—"}</td>
                                                <td>
                                                    <StatusChip tone={meta.tone}>
                                                        {meta.label}
                                                    </StatusChip>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </article>

                    <article className={styles.detailPanel}>
                        <div className={styles.panelHead}>
                            <h2>상세</h2>
                            {activeStatus && (
                                <StatusChip tone={statusMeta[activeStatus].tone}>
                                    {statusMeta[activeStatus].label}
                                </StatusChip>
                            )}
                        </div>

                        {!active ? (
                            <p className={styles.empty}>학생을 선택하세요.</p>
                        ) : (
                            <>
                                <div className={styles.meta}>
                                    <div>
                                        <span>학생</span>
                                        <strong>{active.name}</strong>
                                    </div>
                                    <div>
                                        <span>학교·학년</span>
                                        <strong>
                                            {formatSchool(
                                                active.schoolName,
                                                active.grade,
                                            )}
                                        </strong>
                                    </div>
                                    <div>
                                        <span>반 · 교사</span>
                                        <strong>
                                            {active.className ?? "미배정"}
                                            {" · "}
                                            {active.teacherName ??
                                                active.report?.teacherName ??
                                                "—"}
                                        </strong>
                                    </div>
                                </div>

                                <div className={styles.contentBox}>
                                    <h3>최근 리포트</h3>
                                    {active.report ? (
                                        <p>{active.report.content || "(내용 없음)"}</p>
                                    ) : (
                                        <p className={styles.empty}>
                                            아직 작성된 AI 리포트가 없습니다.
                                            {!active.studentProfileId &&
                                                " (students 프로필도 아직 없습니다)"}
                                        </p>
                                    )}
                                </div>

                                {active.report &&
                                    activeStatus === "PENDING_APPROVAL" && (
                                        <div className={styles.reviewBox}>
                                            <label className={styles.field}>
                                                반려 사유
                                                <textarea
                                                    value={rejectionReason}
                                                    onChange={(e) =>
                                                        setRejectionReason(
                                                            e.target.value,
                                                        )
                                                    }
                                                    rows={3}
                                                    placeholder="교사에게 전달할 반려 사유를 입력하세요."
                                                />
                                            </label>
                                            <div className={styles.actions}>
                                                <button
                                                    type="button"
                                                    className={styles.secondary}
                                                    onClick={handleReject}
                                                    disabled={isPending}
                                                >
                                                    {isPending
                                                        ? "처리 중..."
                                                        : "반려"}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={handleApprove}
                                                    disabled={isPending}
                                                >
                                                    {isPending
                                                        ? "처리 중..."
                                                        : "승인·발송"}
                                                </button>
                                            </div>
                                            {feedback && (
                                                <p className={styles.hint}>
                                                    {feedback}
                                                </p>
                                            )}
                                        </div>
                                    )}

                                {active.report &&
                                    activeStatus !== "PENDING_APPROVAL" &&
                                    feedback && (
                                        <p className={styles.hint}>{feedback}</p>
                                    )}
                            </>
                        )}
                    </article>
                </div>
            )}
        </section>
    );
}

function formatSchool(schoolName: string | null, grade: string | null) {
    if (!schoolName && !grade) return "미입력";
    if (!schoolName) return `${grade}학년`;
    if (!grade) return schoolName;
    return `${schoolName} · ${grade}학년`;
}