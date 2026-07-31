"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import StatusChip from "@/components/ui/StatusChip";
import {
    addStudentEnrollment,
    endStudentEnrollment,
} from "./actions";
import styles from "./DirectorStudentsScreen.module.css";

export type StudentStatus = "ENROLLED" | "PAUSED" | "WITHDRAWN";

export type DirectorStudentClass = {
    enrollmentId: string;
    classId: string;
    className: string;
    teacherName: string | null;
    enrolledAt: string;
};

export type DirectorStudentChange = {
    id: string;
    className: string;
    endedAt: string;
    status: string;
};

export type DirectorStudent = {
    id: string;
    name: string;
    schoolName: string | null;
    grade: string | null;
    status: StudentStatus;
    googleLinked: boolean;
    email: string | null;
    parentCount: number;
    parentNames: string[];
    classes: DirectorStudentClass[];
    recentChanges: DirectorStudentChange[];
};

export type DirectorClassOption = {
    id: string;
    name: string;
    teacherName: string | null;
};

const statusMeta: Record<
    StudentStatus,
    { label: string; tone: "neutral" | "success" | "warning" | "danger" }
> = {
    ENROLLED: { label: "재원", tone: "success" },
    PAUSED: { label: "휴원", tone: "warning" },
    WITHDRAWN: { label: "퇴원", tone: "neutral" },
};

function formatDate(value: string) {
    return new Date(value).toLocaleDateString("ko-KR", {
        month: "numeric",
        day: "numeric",
    });
}

export default function DirectorStudentsScreen({
    students,
    classOptions,
}: {
    students: DirectorStudent[];
    classOptions: DirectorClassOption[];
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [query, setQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<"ALL" | StudentStatus>(
        "ALL",
    );
    const [classFilter, setClassFilter] = useState("ALL");
    const [activeId, setActiveId] = useState<string | null>(null);
    const [selectedClassId, setSelectedClassId] = useState("");
    const [feedback, setFeedback] = useState<string | null>(null);

    const stats = useMemo(() => {
        let enrolled = 0;
        let paused = 0;
        let unlinked = 0;
        for (const student of students) {
            if (student.status === "ENROLLED") enrolled += 1;
            if (student.status === "PAUSED") paused += 1;
            if (student.parentCount === 0) unlinked += 1;
        }
        return [
            { label: "재원", value: `${enrolled}명`, detail: "ENROLLED" },
            { label: "휴원", value: `${paused}명`, detail: "PAUSED" },
            {
                label: "학부모 미연결",
                value: `${unlinked}명`,
                detail: "연결 필요",
            },
        ];
    }, [students]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return students.filter((student) => {
            if (statusFilter !== "ALL" && student.status !== statusFilter) {
                return false;
            }
            if (
                classFilter !== "ALL" &&
                !student.classes.some((c) => c.classId === classFilter)
            ) {
                return false;
            }
            if (!q) return true;
            const haystack = [
                student.name,
                student.schoolName,
                student.grade,
                ...student.classes.map((c) => c.className),
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
            return haystack.includes(q);
        });
    }, [students, query, statusFilter, classFilter]);

    const active =
        students.find((student) => student.id === activeId) ?? null;

    const addableClasses = useMemo(() => {
        if (!active) return classOptions;
        const taken = new Set(active.classes.map((c) => c.classId));
        return classOptions.filter((c) => !taken.has(c.id));
    }, [active, classOptions]);

    function openPanel(studentId: string) {
        setActiveId(studentId);
        setSelectedClassId("");
        setFeedback(null);
    }

    function closePanel() {
        setActiveId(null);
        setSelectedClassId("");
        setFeedback(null);
    }

    function handleAdd() {
        if (!active || !selectedClassId) return;
        setFeedback(null);
        startTransition(async () => {
            const result = await addStudentEnrollment({
                studentId: active.id,
                classId: selectedClassId,
            });
            setFeedback(result.message);
            if (result.ok) {
                setSelectedClassId("");
                router.refresh();
            }
        });
    }

    function handleEnd(enrollmentId: string, className: string) {
        const ok = window.confirm(
            `${className} 수강을 해제할까요?\n출결·성적 기록은 유지됩니다.`,
        );
        if (!ok) return;

        setFeedback(null);
        startTransition(async () => {
            const result = await endStudentEnrollment({ enrollmentId });
            setFeedback(result.message);
            if (result.ok) {
                router.refresh();
            }
        });
    }

    return (
        <section className={styles.page}>
            <header className={styles.heading}>
                <div>
                    <span>STUDENTS</span>
                    <h1>학생 관리</h1>
                    <p>
                        재원 상태, 반 배정, 출결과 학습 기록을 관리합니다.
                    </p>
                </div>
                <Link href="/director/users" className={styles.headerLink}>
                    가입 사용자로 이동
                </Link>
            </header>

            <div className={styles.metrics}>
                {stats.map((item) => (
                    <article key={item.label}>
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                        <p>{item.detail}</p>
                    </article>
                ))}
            </div>

            <div className={styles.layout} data-open={Boolean(active)}>
                <div className={styles.tablePanel}>
                    <div className={styles.filters}>
                        <label className={styles.field}>
                            학생 검색
                            <input
                                type="search"
                                placeholder="이름 또는 반"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                            />
                        </label>
                        <label className={styles.field}>
                            상태
                            <select
                                value={statusFilter}
                                onChange={(e) =>
                                    setStatusFilter(
                                        e.target.value as "ALL" | StudentStatus,
                                    )
                                }
                            >
                                <option value="ALL">전체</option>
                                <option value="ENROLLED">재원</option>
                                <option value="PAUSED">휴원</option>
                                <option value="WITHDRAWN">퇴원</option>
                            </select>
                        </label>
                        <label className={styles.field}>
                            반
                            <select
                                value={classFilter}
                                onChange={(e) =>
                                    setClassFilter(e.target.value)
                                }
                            >
                                <option value="ALL">전체 반</option>
                                {classOptions.map((item) => (
                                    <option key={item.id} value={item.id}>
                                        {item.name}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>

                    {filtered.length === 0 ? (
                        <div className={styles.emptyPanel}>
                            <h2>
                                {students.length === 0
                                    ? "등록된 학생이 없습니다"
                                    : "조건에 맞는 학생이 없습니다"}
                            </h2>
                            <p>
                                {students.length === 0
                                    ? "가입 사용자에서 학생 역할을 부여하면 여기에 표시됩니다."
                                    : "검색어나 필터를 바꿔보세요."}
                            </p>
                            {students.length === 0 ? (
                                <Link
                                    href="/director/users"
                                    className={styles.headerLink}
                                >
                                    가입 사용자 보기
                                </Link>
                            ) : null}
                        </div>
                    ) : (
                        <div className={styles.tableWrap}>
                            <table>
                                <thead>
                                    <tr>
                                        <th>학생</th>
                                        <th>반</th>
                                        <th>연동</th>
                                        <th>학부모</th>
                                        <th>상태</th>
                                        <th>조치</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((student) => {
                                        const meta = statusMeta[student.status];
                                        return (
                                            <tr
                                                key={student.id}
                                                className={
                                                    activeId === student.id
                                                        ? styles.activeRow
                                                        : undefined
                                                }
                                            >
                                                <td>
                                                    <strong>
                                                        {student.name}
                                                    </strong>
                                                    <small>
                                                        {[
                                                            student.schoolName,
                                                            student.grade,
                                                        ]
                                                            .filter(Boolean)
                                                            .join(" · ") ||
                                                            "학교·학년 미입력"}
                                                    </small>
                                                </td>
                                                <td>
                                                    {student.classes.length ===
                                                    0 ? (
                                                        <span
                                                            className={
                                                                styles.muted
                                                            }
                                                        >
                                                            반 미배정
                                                        </span>
                                                    ) : (
                                                        <div
                                                            className={
                                                                styles.chips
                                                            }
                                                        >
                                                            {student.classes.map(
                                                                (item) => (
                                                                    <span
                                                                        key={
                                                                            item.enrollmentId
                                                                        }
                                                                        className={
                                                                            styles.classChip
                                                                        }
                                                                    >
                                                                        {
                                                                            item.className
                                                                        }
                                                                    </span>
                                                                ),
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                                <td>
                                                    <StatusChip
                                                        tone={
                                                            student.googleLinked
                                                                ? "success"
                                                                : "neutral"
                                                        }
                                                    >
                                                        {student.googleLinked
                                                            ? "연동"
                                                            : "미연동"}
                                                    </StatusChip>
                                                </td>
                                                <td>
                                                    {student.parentCount > 0
                                                        ? `${student.parentCount}명`
                                                        : "—"}
                                                </td>
                                                <td>
                                                    <StatusChip
                                                        tone={meta.tone}
                                                    >
                                                        {meta.label}
                                                    </StatusChip>
                                                </td>
                                                <td>
                                                    <button
                                                        type="button"
                                                        className={
                                                            styles.actionBtn
                                                        }
                                                        onClick={() =>
                                                            openPanel(
                                                                student.id,
                                                            )
                                                        }
                                                    >
                                                        반 관리
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {active ? (
                    <aside className={styles.detailPanel}>
                        <div className={styles.panelHead}>
                            <div>
                                <h2>{active.name}</h2>
                                <p>
                                    {[active.schoolName, active.grade]
                                        .filter(Boolean)
                                        .join(" · ") || "학교·학년 미입력"}
                                </p>
                            </div>
                            <button
                                type="button"
                                className={styles.secondaryBtn}
                                onClick={closePanel}
                            >
                                닫기
                            </button>
                        </div>

                        <div className={styles.meta}>
                            <div>
                                <span>Google 연동</span>
                                <strong>
                                    {active.googleLinked
                                        ? (active.email ?? "연동됨")
                                        : "미연동"}
                                </strong>
                            </div>
                            <div>
                                <span>학부모</span>
                                <strong>
                                    {active.parentNames.length > 0
                                        ? active.parentNames.join(", ")
                                        : "미연결"}
                                </strong>
                            </div>
                        </div>

                        <section className={styles.block}>
                            <h3>현재 수강</h3>
                            {active.classes.length === 0 ? (
                                <p className={styles.muted}>
                                    배정된 반이 없습니다.
                                </p>
                            ) : (
                                <ul className={styles.enrollmentList}>
                                    {active.classes.map((item) => (
                                        <li key={item.enrollmentId}>
                                            <div>
                                                <strong>
                                                    {item.className}
                                                </strong>
                                                <small>
                                                    {item.teacherName ??
                                                        "담당 미지정"}{" "}
                                                    · 활성
                                                </small>
                                            </div>
                                            <button
                                                type="button"
                                                className={styles.dangerBtn}
                                                disabled={isPending}
                                                onClick={() =>
                                                    handleEnd(
                                                        item.enrollmentId,
                                                        item.className,
                                                    )
                                                }
                                            >
                                                해제
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>

                        <section className={styles.block}>
                            <h3>반 추가</h3>
                            {classOptions.length === 0 ? (
                                <p className={styles.muted}>
                                    등록된 활성 반이 없습니다.
                                </p>
                            ) : addableClasses.length === 0 ? (
                                <p className={styles.muted}>
                                    추가할 수 있는 반이 없습니다.
                                </p>
                            ) : (
                                <div className={styles.addRow}>
                                    <select
                                        value={selectedClassId}
                                        onChange={(e) =>
                                            setSelectedClassId(e.target.value)
                                        }
                                        disabled={isPending}
                                    >
                                        <option value="">반 선택</option>
                                        {addableClasses.map((item) => (
                                            <option
                                                key={item.id}
                                                value={item.id}
                                            >
                                                {item.name}
                                                {item.teacherName
                                                    ? ` · ${item.teacherName}`
                                                    : ""}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        className={styles.actionBtn}
                                        disabled={
                                            isPending || !selectedClassId
                                        }
                                        onClick={handleAdd}
                                    >
                                        추가
                                    </button>
                                </div>
                            )}
                        </section>

                        <section className={styles.block}>
                            <h3>최근 변경</h3>
                            {active.recentChanges.length === 0 ? (
                                <p className={styles.muted}>
                                    최근 해제 이력이 없습니다.
                                </p>
                            ) : (
                                <ul className={styles.historyList}>
                                    {active.recentChanges.map((item) => (
                                        <li key={item.id}>
                                            {formatDate(item.endedAt)}{" "}
                                            {item.className} 해제
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>

                        {feedback ? (
                            <p className={styles.hint}>{feedback}</p>
                        ) : null}
                    </aside>
                ) : null}
            </div>
        </section>
    );
}