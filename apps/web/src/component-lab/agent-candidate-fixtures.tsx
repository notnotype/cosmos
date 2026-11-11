import { useMemo, useState } from "react";
import { StoryAgentCandidatesPanel } from "@/components/cosmos/story-panel/agent-candidates";
import { storyLabFixture } from "./product-fixtures";
import { createAgentCandidateFixtureApi, type AgentCandidateFixtureBehavior } from "./agent-candidate-fixture-api";

export function AgentCandidateFixture() {
    const [unsaved, setUnsaved] = useState(false);
    const [accepted, setAccepted] = useState(false);
    const [count, setCount] = useState(0);
    const [behavior, setBehavior] = useState<AgentCandidateFixtureBehavior>({ loseResponse: false, hold: false, fail: false, saveThenFail: false, sourceStatus: "current", costMode: "known" });
    const story = useMemo(() => storyLabFixture("splittable", "候选验收文章", "现有摘要"), []);
    const api = useMemo(() => createAgentCandidateFixtureApi(story, behavior, setCount), [story, behavior]);
    return <div className="space-y-4">
        <label><input type="checkbox" checked={unsaved} onChange={(event) => setUnsaved(event.target.checked)} />模拟未保存编辑</label>
        <label><input type="checkbox" onChange={(event) => setBehavior((current) => ({ ...current, loseResponse: event.target.checked }))} />模拟入队响应丢失</label>
        <label><input type="checkbox" onChange={(event) => setBehavior((current) => ({ ...current, hold: event.target.checked }))} />模拟任务运行中</label>
        <label><input type="checkbox" onChange={(event) => setBehavior((current) => ({ ...current, fail: event.target.checked }))} />模拟生成失败</label>
        <label><input type="checkbox" onChange={(event) => setBehavior((current) => ({ ...current, saveThenFail: event.target.checked }))} />模拟候选已保存但回执失败</label>
        <label>模拟来源证据<select aria-label="模拟来源证据" onChange={(event) => {
            const value = event.target.value;
            if (value === "current" || value === "superseded" || value === "unavailable") setBehavior((current) => ({ ...current, sourceStatus: value }));
        }}><option value="current">当前</option><option value="superseded">旧版</option><option value="unavailable">不可用</option></select></label>
        <label>模拟实际成本<select aria-label="模拟实际成本" value={behavior.costMode} onChange={(event) => {
            const value = event.target.value;
            if (value === "known" || value === "zero" || value === "missing") setBehavior((current) => ({ ...current, costMode: value }));
        }}><option value="known">已知金额</option><option value="zero">零金额</option><option value="missing">未提供金额</option></select></label>
        <output aria-label="生成任务数">{count}</output>
        {accepted && <p role="status">已刷新 Story</p>}
        <StoryAgentCandidatesPanel story={story} unsavedEdit={unsaved} api={api} onAccepted={async () => { setAccepted(true); }} />
    </div>;
}
