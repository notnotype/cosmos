import { useCallback, useEffect, useState } from "react";
import { type StoryAgentCandidateRecordContract, type StoryAgentTask, type StoryDetail } from "@cosmos/contracts";

import { client, readError } from "@/app/home/page-runtime";
import { Button } from "@/components/ui/button";
import { messages } from "@/copy/messages";
import { selectReadingSources } from "../story-source-reader";
import { useStoryAgentGeneration, type GenerationClient } from "./use-story-agent-generation";

const copy = messages.reading.candidates;
const taskLabels: Record<StoryAgentTask, string> = copy.tasks;

function ProposalPreview({ record }: { record: StoryAgentCandidateRecordContract }) {
    const proposal = record.candidate.proposal;
    if (proposal.task === "story.summarize") return <div className="space-y-2">
        <h4 className="font-semibold">{proposal.title}</h4>
        <p className="whitespace-pre-wrap">{proposal.summary}</p>
        {proposal.keyFacts.length > 0 && <ul className="list-disc pl-5">{proposal.keyFacts.map((fact, index) => <li key={index}>{fact.text}</li>)}</ul>}
    </div>;
    if (proposal.task === "story.extract-relations") return <ul className="space-y-2">
        {proposal.relations.length === 0 && <li>{copy.noRelations}</li>}
        {proposal.relations.map((relation, index) => <li key={index}>
            <p>{relation.type} · {relation.sourceEntryId} → {relation.targetEntryId}</p>
            <p>{relation.reason}</p>
        </li>)}
    </ul>;
    return <ul className="space-y-2">
        {proposal.findings.length === 0 && <li>{copy.noFindings}</li>}
        {proposal.findings.map((finding, index) => <li key={index}>{finding.severity} · {finding.message}</li>)}
    </ul>;
}

type CandidateClient = Pick<typeof client, "storyAgentCandidates" | "revisionContent" | "decideStoryAgentCandidate"> & GenerationClient;
type PanelProps = { story: StoryDetail; unsavedEdit: boolean; onAccepted: () => Promise<void>; api?: CandidateClient };

export function StoryAgentCandidatesPanel(props: PanelProps) {
    return <CandidatesForStory key={props.story.story.id} {...props} />;
}

function CandidatesForStory({ story, unsavedEdit, onAccepted, api = client }: PanelProps) {
    const [records, setRecords] = useState<StoryAgentCandidateRecordContract[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const [task, setTask] = useState<StoryAgentTask>("story.summarize");
    const [includeSources, setIncludeSources] = useState(false);
    const storyId = story.story.id;
    const refresh = useCallback(() => setAttempt((value) => value + 1), []);
    const generation = useStoryAgentGeneration(storyId, api, refresh);
    const generating = busy || generation.active;
    useEffect(() => {
        let active = true;
        void api.storyAgentCandidates(storyId).then((value) => {
            if (!active) return;
            setRecords(value);
        }).catch((caught: unknown) => { if (active) setError(readError(caught)); });
        return () => { active = false; };
    }, [storyId, attempt, api]);

    const propose = async () => {
        setBusy(true);
        setError(null);
        try {
            const sources = [];
            if (includeSources) {
                const views = await Promise.all(selectReadingSources(story).map((entry) => api.revisionContent(entry.revisions[0]!.id)));
                for (const view of views) {
                    if (!view.representation || view.representation.status === "failed") throw new Error(copy.sourceUnavailable);
                    sources.push({ entryRevisionId: view.entryRevisionId, representationVersion: view.representation.representationVersion });
                }
                if (sources.length === 0) throw new Error(copy.noSources);
            }
            // modelId 未传，后端使用系统默认模型；如需临时切换模型，在设置页更改默认模型。
            await generation.start({ task, ...(includeSources ? { sources } : {}) });
        } catch (caught) {
            setError(readError(caught));
        } finally {
            setBusy(false);
        }
    };
    const decide = async (id: string, decision: "accept" | "reject") => {
        if (decision === "accept" && unsavedEdit) return;
        setBusy(true);
        setError(null);
        try {
            const record = await api.decideStoryAgentCandidate(id, decision);
            setRecords((current) => current?.map((item) => item.candidate.id === id ? record : item) ?? [record]);
            if (decision === "accept") await onAccepted();
        } catch (caught) {
            setError(readError(caught));
        } finally {
            setBusy(false);
        }
    };
    return <section aria-label={copy.section} className="rounded-[var(--radius-card)] border border-border bg-paper p-5 space-y-4">
        <h2 className="font-semibold">{copy.section}</h2>
        <p className="text-sm text-muted-foreground">{copy.hint}</p>
        <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm">{copy.type} <select className="rounded border border-border bg-background p-2" value={task} disabled={generating} onChange={(event) => setTask(event.target.value as StoryAgentTask)}>
                {Object.entries(taskLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeSources} disabled={generating} onChange={(event) => setIncludeSources(event.target.checked)} />{copy.sources}</label>
            <Button size="sm" disabled={generating || !generation.ready || (task !== "story.summarize" && !includeSources)} onClick={() => void propose()}>{copy.generate}</Button>
        </div>
        {generation.generation && <p role="status" className="text-sm [overflow-wrap:anywhere]">{copy.generationStatuses[generation.generation.status]}</p>}
        {generation.error && <div role="alert" className="text-sm"><p>{generation.error}</p>{generation.recoverable && <Button variant="outline" size="sm" disabled={generation.sending} onClick={generation.retry}>{copy.recover}</Button>}</div>}
        {!includeSources && <p className="text-xs text-muted-foreground">{copy.scope}</p>}
        {unsavedEdit && <p role="status" className="text-sm text-muted-foreground">{copy.unsaved}</p>}
        {busy && <p role="status" className="text-sm">{copy.busy}</p>}
        {error && <div role="alert" className="text-sm"><p>{error}</p><Button variant="outline" size="sm" disabled={busy} onClick={() => { setError(null); setAttempt((value) => value + 1); }}>{copy.retry}</Button></div>}
        {!records && !error && <p role="status" className="text-sm">{copy.loading}</p>}
        {records?.length === 0 && <p className="text-sm text-muted-foreground">{copy.empty}</p>}
        {records?.map((record) => <article key={record.candidate.id} className="space-y-3 border-t border-border pt-4 text-sm [overflow-wrap:anywhere]">
            <div className="flex flex-wrap gap-2"><h3 className="font-medium">{taskLabels[record.candidate.proposal.task]}</h3><span className="text-muted-foreground">{copy.statuses[record.status]}</span></div>
            <ProposalPreview record={record} />
            {record.sourceStatus === "superseded" && <p role="status">{copy.sourceSuperseded}</p>}
            {record.sourceStatus === "unavailable" && <p role="status">{copy.sourceUnavailableEvidence}</p>}
            <p className="text-xs text-muted-foreground">{record.candidate.provider} · {record.candidate.model} · {record.candidate.createdAt}</p>
            <details><summary className="cursor-pointer text-xs">{copy.versions}</summary><p className="text-xs">{copy.storyVersion(record.candidate.storyRevisionId)}</p>{record.candidate.inputSources.map((source) => <p className="text-xs" key={`${source.entryRevisionId}:${source.representationVersion}`}>{copy.sourceVersion(source.entryRevisionId, source.representationVersion)}</p>)}</details>
            {record.status === "pending" && <div className="flex flex-wrap gap-2">
                {record.candidate.proposal.task !== "story.review-content-quality" && <Button size="sm" disabled={busy || unsavedEdit || record.sourceStatus === "superseded" || record.sourceStatus === "unavailable"} onClick={() => void decide(record.candidate.id, "accept")}>{copy.accept}</Button>}
                <Button variant="outline" size="sm" disabled={busy} onClick={() => void decide(record.candidate.id, "reject")}>{copy.reject}</Button>
                {record.candidate.proposal.task === "story.review-content-quality" && <p className="text-xs text-muted-foreground">{copy.quality}</p>}
            </div>}
        </article>)}
    </section>;
}
