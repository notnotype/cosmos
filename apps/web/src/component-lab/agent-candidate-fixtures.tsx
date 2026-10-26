import { useMemo, useRef, useState } from "react";
import { StoryAgentCandidatesPanel } from "@/components/cosmos/story-panel/agent-candidates";
import { storyLabFixture } from "./product-fixtures";
import { createAgentCandidateFixtureApi } from "./agent-candidate-fixture-api";

export function AgentCandidateFixture() {
    const [unsaved, setUnsaved] = useState(false);
    const [accepted, setAccepted] = useState(false);
    const [count, setCount] = useState(0);
    const behavior = useRef<{ loseResponse: boolean; hold: boolean; fail: boolean; saveThenFail: boolean; sourceStatus: "current" | "superseded" | "unavailable" }>({ loseResponse: false, hold: false, fail: false, saveThenFail: false, sourceStatus: "current" });
    const story = useMemo(() => storyLabFixture("splittable", "候选验收文章", "现有摘要"), []);
    const api = useMemo(() => createAgentCandidateFixtureApi(story, behavior.current, setCount), [story]);
    return <div className="space-y-4">
        <label><input type="checkbox" checked={unsaved} onChange={(event) => setUnsaved(event.target.checked)} />模拟未保存编辑</label>
        <label><input type="checkbox" onChange={(event) => { behavior.current.loseResponse = event.target.checked; }} />模拟入队响应丢失</label>
        <label><input type="checkbox" onChange={(event) => { behavior.current.hold = event.target.checked; }} />模拟任务运行中</label>
        <label><input type="checkbox" onChange={(event) => { behavior.current.fail = event.target.checked; }} />模拟生成失败</label>
        <label><input type="checkbox" onChange={(event) => { behavior.current.saveThenFail = event.target.checked; }} />模拟候选已保存但回执失败</label>
        <label>模拟来源证据<select aria-label="模拟来源证据" onChange={(event) => {
            const value = event.target.value;
            if (value === "current" || value === "superseded" || value === "unavailable") behavior.current.sourceStatus = value;
        }}><option value="current">当前</option><option value="superseded">旧版</option><option value="unavailable">不可用</option></select></label>
        <output aria-label="生成任务数">{count}</output>
        {accepted && <p role="status">已刷新 Story</p>}
        <StoryAgentCandidatesPanel story={story} unsavedEdit={unsaved} api={api} onAccepted={async () => { setAccepted(true); }} />
    </div>;
}
