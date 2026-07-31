"use client";

import { useMemo, useState } from "react";
import StatusChip from "@/components/ui/StatusChip";
import styles from "./ParentReportsScreen.module.css";

export type ParentReportItem = {
    id: string;
    content: string;
    keywords: string[];
    teacherName: string;
    periodStart: string;
    periodEnd: string;
    sentAt: string | null;
    parentReadAt: string | null;
};

export type ParentReportChild = {
    id: string;
    name: string;
    schoolName: string | null;
    grade: string | null;
    className: string | null;
    teacherName: string | null;
    reports: ParentReportItem[];
};

export default function ParentReportsScreen({
    childList,
}: {
    childList: ParentReportChild[];
}) {
    const [activeChildId, setActiveChildId] = useState<string | null>(
        childList[0]?.id ?? null,
    );
    const [activeReportId, setActiveReportId] = useState<string | null>(
        childList[0]?.reports[0]?.id ?? null,
    );

    const activeChild =
        childList.find((child) => child.id === activeChildId) ?? null;

    const activeReport = useMemo(() => {
        if (!activeChild) return null;
        return (
            activeChild.reports.find((report) => report.id === activeReportId) ??
            activeChild.reports[0] ??
            null
        );
    }, [activeChild, activeReportId]);

    const pastReports = useMemo(() => {
        if (!activeChild || !activeReport) return activeChild?.reports ?? [];
        return activeChild.reports.filter(
            (report) => report.id !== activeReport.id,
        );
    }, [activeChild, activeReport]);

    function selectChild(childId: string) {
        const next = childList.find((child) => child.id === childId);
        setActiveChildId(childId);
        setActiveReportId(next?.reports[0]?.id ?? null);
    }

    return (
        <section className={styles.page}>
            <header className={styles.heading}>
                <div>
                    <span>AI REPORT</span>
                    <h1>학습 리포트</h1>
                    <p>선생님이 전한 자녀의 성장 기록을 확인합니다.</p>
                </div>
            </header>

            {childList.length === 0 ? (
                <div className={styles.emptyPanel}>
                    <h2>연결된 자녀가 없습니다</h2>
                    <p>
                        학원에서 학부모-학생 연결을 완료하면 이곳에 학습
                        리포트가 표시됩니다.
                    </p>
                </div>
            ) : (
                <>
                    {childList.length > 1 && (
                        <div className={styles.childTabs} role="tablist">
                            {childList.map((child) => (
                                <button
                                    key={child.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={child.id === activeChildId}
                                    className={
                                        child.id === activeChildId
                                            ? styles.activeTab
                                            : undefined
                                    }
                                    onClick={() => selectChild(child.id)}
                                >
                                    {child.name}
                                </button>
                            ))}
                        </div>
                    )}

                    {!activeReport ? (
                        <div className={styles.emptyPanel}>
                            <h2>아직 받은 리포트가 없습니다</h2>
                            <p>
                                선생님이 작성하고 원장 승인 후 발송되면 여기에서
                                확인할 수 있습니다.
                            </p>
                        </div>
                    ) : (
                        <div className={styles.content}>
                            <article className={styles.hero}>
                                <StatusChip tone="success">
                                    {formatPeriodLabel(
                                        activeReport.periodStart,
                                        activeReport.periodEnd,
                                    )}{" "}
                                    리포트
                                </StatusChip>
                                <h2>
                                    {activeChild?.className
                                        ? `${activeChild.className} 학습 보고서`
                                        : `${activeChild?.name} 학습 보고서`}
                                </h2>
                                <p>{activeReport.content || "(내용 없음)"}</p>
                                <div className={styles.heroMeta}>
                                    <span>
                                        {activeReport.teacherName}
                                        {activeReport.sentAt
                                            ? ` · ${formatDate(activeReport.sentAt)}`
                                            : ""}
                                    </span>
                                    <StatusChip
                                        tone={
                                            activeReport.parentReadAt
                                                ? "neutral"
                                                : "warning"
                                        }
                                    >
                                        {activeReport.parentReadAt
                                            ? "읽음"
                                            : "새 리포트"}
                                    </StatusChip>
                                </div>
                            </article>

                            {activeReport.keywords.length > 0 && (
                                <article className={styles.panel}>
                                    <h3>평가 키워드</h3>
                                    <ul className={styles.keywordList}>
                                        {activeReport.keywords.map((keyword) => (
                                            <li key={keyword}>{keyword}</li>
                                        ))}
                                    </ul>
                                </article>
                            )}

                            <article className={styles.panel}>
                                <h3>선생님 코멘트</h3>
                                <p>{activeReport.content}</p>
                            </article>

                            <article className={styles.panel}>
                                <div className={styles.panelHead}>
                                    <h3>지난 보고서</h3>
                                    <StatusChip>
                                        {pastReports.length}건
                                    </StatusChip>
                                </div>
                                {pastReports.length === 0 ? (
                                    <p className={styles.empty}>
                                        이전 보고서가 없습니다.
                                    </p>
                                ) : (
                                    <ul className={styles.reportList}>
                                        {pastReports.map((report) => (
                                            <li key={report.id}>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setActiveReportId(
                                                            report.id,
                                                        )
                                                    }
                                                >
                                                    <span>
                                                        <strong>
                                                            {formatPeriodLabel(
                                                                report.periodStart,
                                                                report.periodEnd,
                                                            )}{" "}
                                                            학습 보고서
                                                        </strong>
                                                        <small>
                                                            {report.teacherName}
                                                        </small>
                                                    </span>
                                                    <span>보기</span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </article>
                        </div>
                    )}
                </>
            )}
        </section>
    );
}

function formatPeriodLabel(startIso: string, endIso: string) {
    const end = new Date(endIso);
    return new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        month: "long",
    }).format(end);
}

function formatDate(iso: string) {
    return new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        month: "numeric",
        day: "numeric",
    }).format(new Date(iso));
}