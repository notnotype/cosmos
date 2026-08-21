import {Suspense} from "react";
import {notFound} from "next/navigation";

import {ComponentLabWorkbench} from "@/component-lab/workbench";

export default function ComponentLabPage() {
    if (process.env.NODE_ENV !== "development") {
        notFound();
    }

    return (
        <Suspense fallback={<main className="p-6 text-sm text-muted-foreground">Loading component lab…</main>}>
            <ComponentLabWorkbench />
        </Suspense>
    );
}
