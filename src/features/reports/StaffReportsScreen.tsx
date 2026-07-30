"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import StatusChip from "@/components/ui/StatusChip";
import {
    regenerateDraftWithAi,
    requestReportApproval,
    saveDraftReport,
} from "./actions.staff";
import styles from "./StaffReportsScreen.module.css";

export type ReportStatus =
    | "UNWRITTEN"
    | "DRAFTING"
    | "PENDING_APPROVAL"
    | "REJECTED"
    | "SENT"
    | "FAILED";

export type StaffReportStudent = {
    id: string;
    studentProfileId: string | null; // Student.id (현재 page.tsx 매핑 기준)
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
        keywords: string[];
        rejectionReason: string | null;
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

const keywordOptions = [
    "수업 태도 · 과제 · 이해도",
    "참여도 · 질문 · 복습",
    "성실도 · 집중력 · 성장",
];

const toneOptions = ["격려·칭찬", "전문적", "단호"];

function getStatus(student: StaffReportStudent): ReportStatus {
    return student.report?.status ?? "UNWRITTEN";
}

function toDateInputValue(date: Date) {
    return date.toISOString().slice(0, 10);
}

function getDefaultPeriod() {
    const now = new Date();
    const start = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const end = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
    );
    return {
        periodStart: toDateInputValue(start),
        periodEnd: toDateInputValue(end),
    };
}

export default function StaffReportsScreen({
    students,
}: {
    students: StaffReportStudent[];
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const [activeId, setActiveId] = useState<string | null>(
        students[0]?.id ?? null,
    );
    const [keyword, setKeyword] = useState(keywordOptions[0]);
    const [tone, setTone] = useState(toneOptions[0]);
    const [content, setContent] = useState("");
    const [feedback, setFeedback] = useState<string | null>(null);

    const active = students.find((s) => s.id === activeId) ?? null;
    const activeStatus = active ? getStatus(active) : null;

    const canEdit =
        activeStatus === "UNWRITTEN" ||
        activeStatus === "DRAFTING" ||
        activeStatus === "REJECTED";

    useEffect(() => {
        if (!active) {
            setContent("");
            setFeedback(null);
            return;
        }

        setContent(active.report?.content ?? "");
        if (active.report?.keywords[0]) {
            setKeyword(active.report.keywords[0]);
        } else {
            setKeyword(keywordOptions[0]);
        }
        setTone(toneOptions[0]);
        setFeedback(null);
    }, [active]);

    const stats = useMemo(() => {
        const counts = {
            UNWRITTEN: 0,
            DRAFTING: 0,
            PENDING_APPROVAL: 0,
            REJECTED: 0,
        };

        for (const student of students) {
            const status = getStatus(student);

            if (status === "UNWRITTEN" || status === "FAILED") {
                counts.UNWRITTEN += 1;
            } else if (status === "DRAFTING") {
                counts.DRAFTING += 1;
            } else if (status === "PENDING_APPROVAL") {
                counts.PENDING_APPROVAL += 1;
            } else if (status === "REJECTED") {
                counts.REJECTED += 1;
            }
        }

        return [
            {
                label: "미작성",
                value: `${counts.UNWRITTEN}명`,
                detail: "작성 필요",
                tone: "neutral" as const,
            },
            {
                label: "작성 중",
                value: `${counts.DRAFTING}명`,
                detail: "초안 편집",
                tone: "neutral" as const,
            },
            {
                label: "승인·반려",
                value: `${counts.PENDING_APPROVAL} / ${counts.REJECTED}`,
                detail: `학생 ${students.length}명`,
                tone: "warning" as const,
            },
        ];
    }, [students]);

    function getActivePeriod() {
        if (active?.report) {
            return {
                periodStart: active.report.periodStart.slice(0, 10),
                periodEnd: active.report.periodEnd.slice(0, 10),
            };
        }
        return getDefaultPeriod();
    }

    function handleSaveDraft() {
        if (!active) {
            setFeedback("학생을 선택해 주세요.");
            return;
        }

        const studentId = active.studentProfileId;
        if (!studentId) {
            setFeedback("학생 프로필이 없어 저장할 수 없습니다.");
            return;
        }

        const { periodStart, periodEnd } = getActivePeriod();
        setFeedback(null);

        startTransition(async () => {
            const result = await saveDraftReport({
                studentId,
                content,
                keywords: [keyword],
                periodStart,
                periodEnd,
            });

            if (!result.ok) {
                setFeedback(result.message);
                return;
            }

            setFeedback("초안을 저장했습니다.");
            router.refresh();
        });
    }

    function handleRegenerate() {
        if (!active) {
            setFeedback("학생을 선택해 주세요.");
            return;
        }

        const studentId = active.studentProfileId;
        if (!studentId) {
            setFeedback("학생 프로필이 없어 생성할 수 없습니다.");
            return;
        }

        const { periodStart, periodEnd } = getActivePeriod();
        setFeedback(null);

        startTransition(async () => {
            const result = await regenerateDraftWithAi({
                studentId,
                keywords: [keyword],
                tone,
                periodStart,
                periodEnd,
            });

            if (!result.ok) {
                setFeedback(result.message);
                return;
            }

            setFeedback("AI 초안을 생성했습니다.");
            router.refresh();
        });
    }

    function handleRequestApproval() {
        if (!active || !canEdit) return;

        setFeedback(null);

        startTransition(async () => {
            let reportId = active.report?.id;

            // report row가 없으면 먼저 저장
            if (!reportId) {
                const studentId = active.studentProfileId;
                if (!studentId) {
                    setFeedback("학생 프로필이 없어 승인 요청할 수 없습니다.");
                    return;
                }

                const { periodStart, periodEnd } = getActivePeriod();

                const saveResult = await saveDraftReport({
                    studentId,
                    content,
                    keywords: [keyword],
                    periodStart,
                    periodEnd,
                });

                if (!saveResult.ok) {
                    setFeedback(saveResult.message);
                    return;
                }

                reportId = saveResult.reportId;
            }

            const result = await requestReportApproval({ reportId });

            if (!result.ok) {
                setFeedback(result.message);
                return;
            }

            setFeedback("승인 요청을 보냈습니다.");
            router.refresh();
        });
    }

    return (
        <section className={styles.page}>
            <header className={styles.heading}>
                <div>
                    <span>AI REPORT</span>
                    <h1>AI 리포트 작성</h1>
                    <p>학습 기록을 바탕으로 리포트 초안을 만들고 검토합니다.</p>
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
                    <article className={styles.listPanel}>
                        <div className={styles.panelHead}>
                            <h2>학생 목록</h2>
                            <StatusChip>{students.length}명</StatusChip>
                        </div>

                        <ul className={styles.studentList}>
                            {students.map((student) => {
                                const status = getStatus(student);
                                const meta = statusMeta[status];

                                return (
                                    <li key={student.id}>
                                        <button
                                            type="button"
                                            className={
                                                student.id === activeId
                                                    ? styles.activeStudent
                                                    : undefined
                                            }
                                            onClick={() => setActiveId(student.id)}
                                        >
                                            <span>
                                                <strong>{student.name}</strong>
                                                <small>
                                                    {student.className ??
                                                        formatSchool(
                                                            student.schoolName,
                                                            student.grade,
                                                        )}
                                                </small>
                                            </span>
                                            <StatusChip tone={meta.tone}>
                                                {meta.label}
                                            </StatusChip>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </article>

                    <article className={styles.editorPanel}>
                        <div className={styles.panelHead}>
                            <h2>{active ? `${active.name} 보고서` : "보고서 작성"}</h2>
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
                                        <span>학교·학년</span>
                                        <strong>
                                            {formatSchool(
                                                active.schoolName,
                                                active.grade,
                                            )}
                                        </strong>
                                    </div>
                                    <div>
                                        <span>반</span>
                                        <strong>{active.className ?? "미배정"}</strong>
                                    </div>
                                </div>

                                {active.report?.rejectionReason && (
                                    <div className={styles.rejectBox}>
                                        <strong>반려 사유</strong>
                                        <p>{active.report.rejectionReason}</p>
                                    </div>
                                )}

                                <label className={styles.field}>
                                    평가 키워드
                                    <select
                                        value={keyword}
                                        onChange={(e) => setKeyword(e.target.value)}
                                        disabled={!canEdit || isPending}
                                    >
                                        {keywordOptions.map((option) => (
                                            <option key={option} value={option}>
                                                {option}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <label className={styles.field}>
                                    톤
                                    <select
                                        value={tone}
                                        onChange={(e) => setTone(e.target.value)}
                                        disabled={!canEdit || isPending}
                                    >
                                        {toneOptions.map((option) => (
                                            <option key={option} value={option}>
                                                {option}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <label className={styles.field}>
                                    초안
                                    <textarea
                                        value={content}
                                        onChange={(e) => setContent(e.target.value)}
                                        disabled={!canEdit || isPending}
                                        rows={8}
                                        placeholder="AI 초안이 여기에 표시됩니다."
                                    />
                                </label>

                                <div className={styles.actions}>
                                    <button
                                        type="button"
                                        className={styles.secondary}
                                        disabled={
                                            !canEdit ||
                                            isPending ||
                                            !active.studentProfileId
                                        }
                                        onClick={handleSaveDraft}
                                    >
                                        {isPending ? "처리 중..." : "초안 저장"}
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.secondary}
                                        disabled={
                                            !canEdit ||
                                            isPending ||
                                            !active.studentProfileId
                                        }
                                        onClick={handleRegenerate}
                                    >
                                        {isPending ? "처리 중..." : "AI 재생성"}
                                    </button>
                                    <button
                                        type="button"
                                        disabled={!canEdit || isPending}
                                        onClick={handleRequestApproval}
                                    >
                                        {isPending ? "처리 중..." : "승인 요청"}
                                    </button>
                                </div>

                                {feedback && <p className={styles.hint}>{feedback}</p>}

                                {!active.studentProfileId && (
                                    <p className={styles.hint}>
                                        students 프로필이 없어 아직 DB에 리포트를 저장할
                                        수 없습니다.
                                    </p>
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