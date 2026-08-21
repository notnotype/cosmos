import {Button} from "@/components/ui/button";

import type {LabComponentDefinition} from "./types";

type LabNavProps = {
    definitions: readonly LabComponentDefinition[];
    selectedId: string;
    onSelect: (id: string) => void;
};

export function LabNav({definitions, selectedId, onSelect}: LabNavProps) {
    const categories = [...new Set(definitions.map((definition) => definition.category))];
    return (
        <nav aria-label="组件目录" className="flex flex-col gap-4">
            <div>
                <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
                    Components
                </p>
                <h2 className="mt-1 text-lg font-semibold">组件目录</h2>
            </div>
            {categories.map((category) => (
                <section key={category} className="flex flex-col gap-1">
                    <h3 className="px-2 text-xs font-medium text-muted-foreground">{category}</h3>
                    {definitions
                        .filter((definition) => definition.category === category)
                        .map((definition) => (
                            <Button
                                key={definition.id}
                                aria-current={selectedId === definition.id ? "page" : undefined}
                                className="justify-start"
                                onClick={() => onSelect(definition.id)}
                                size="sm"
                                variant={selectedId === definition.id ? "secondary" : "ghost"}
                            >
                                {definition.label}
                            </Button>
                        ))}
                </section>
            ))}
        </nav>
    );
}
