import type { ActivityExecutionRequest, DeferredActivityStartResult } from "@notnotype/nb-workflow";
import type { ClaimActivityJobInput, CompleteActivityInput, CompleteActivityResult, ConsumeActivityDispatchInput, ConsumeActivityDispatchResult, HeartbeatActivityJobInput, ReleaseActivityJobInput, WorkflowActivityJobClaim } from "@cosmos/application";
import { ActivityClaimOperations } from "./activity-claim.js";
import { ActivityCompletionOperations } from "./activity-completion.js";
import { ActivityExecutionOperations } from "./activity-execution.js";
import { PrismaWorkflowHostRunLeaseStore } from "./run-lease-store.js";

/**
 * Activity 阶段门面：认领 / 执行 / 完成三个协作类各持有一组互不重叠的写路径，
 * 这里只保留继承链中的位置、与 `WorkflowHostStore` 一致的方法签名和委托。
 *
 * 拆开的原因：本文件曾同时承载三类 Job 写路径，越过后整读一次的成本过高。拆分前后的
 * 不变量：每个方法仍只开一个 Prisma 事务；协作类之间不互相调用，也不复用对方的 lease
 * 判定。新增 Activity 方法时进对应阶段的协作类，不要在这里落实现。
 */
export class PrismaWorkflowHostActivityStore extends PrismaWorkflowHostRunLeaseStore {
    private readonly claimOperations = new ActivityClaimOperations(this.prisma);
    private readonly executionOperations = new ActivityExecutionOperations(this.prisma, this.actionRetryPolicies);
    private readonly completionOperations = new ActivityCompletionOperations(this.prisma);

    async startAction(
        request: ActivityExecutionRequest,
    ): Promise<DeferredActivityStartResult> {
        return this.executionOperations.startAction(request);
    }

    async claimActivityJob(
        input: ClaimActivityJobInput,
    ): Promise<WorkflowActivityJobClaim | null> {
        return this.claimOperations.claimActivityJob(input);
    }

    async consumeActivityDispatch(
        input: ConsumeActivityDispatchInput,
    ): Promise<ConsumeActivityDispatchResult> {
        return this.executionOperations.consumeActivityDispatch(input);
    }

    async heartbeatActivityJob(input: HeartbeatActivityJobInput): Promise<boolean> {
        return this.claimOperations.heartbeatActivityJob(input);
    }

    async releaseActivityJob(input: ReleaseActivityJobInput): Promise<boolean> {
        return this.claimOperations.releaseActivityJob(input);
    }

    async completeActivity(input: CompleteActivityInput): Promise<CompleteActivityResult> {
        return this.completionOperations.completeActivity(input);
    }
}
