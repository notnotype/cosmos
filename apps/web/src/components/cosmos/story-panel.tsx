import {X} from "lucide-react";

import type {StoryDetail} from "@cosmos/contracts";

import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";

type StoryPanelProps = {
    onClose: () => void;
    story: StoryDetail;
};

export function StoryPanel({onClose, story}: StoryPanelProps) {
    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between gap-4">
                    <div className="flex flex-col gap-1">
                        <CardTitle>{story.story.title}</CardTitle>
                        <CardDescription>
                            {story.entry.sourceName} · {story.entry.revisions.length} 个 Revision
                        </CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" onClick={onClose}>
                        <X data-icon="inline-start" />
                        关闭
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
                <p className="whitespace-pre-wrap text-sm leading-6">
                    {story.entry.revisions[0]?.contentText ?? "暂无正文"}
                </p>
                <div className="grid gap-3 border-t pt-4 text-sm md:grid-cols-2">
                    <div>
                        <p className="font-medium">Entry</p>
                        <p className="text-muted-foreground">{story.entry.id}</p>
                    </div>
                    <div>
                        <p className="font-medium">Source</p>
                        <p className="text-muted-foreground">
                            {story.entry.sourceName} · {story.entry.sourceKind}
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    {story.entry.revisions.map((revision) => (
                        <Badge key={revision.id} variant="secondary">
                            Revision {revision.revision} · {revision.id}
                        </Badge>
                    ))}
                    {story.entry.observations.map((observation) => (
                        <Badge key={observation.id} variant="outline">
                            Observation · {observation.webUrl ?? "无网页 URL"}
                        </Badge>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
