import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { ResearchStepView, ResearchTaskState } from '@/types/research'

const STATUS_LABEL: Record<ResearchTaskState['status'], string> = {
  created: '已创建',
  planning: '规划中',
  executing: '执行中',
  synthesizing: '生成答案',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
}

const STEP_ICON: Record<ResearchStepView['status'], ReactNode> = {
  pending: <Circle className='size-3.5 text-muted-foreground' />,
  running: <Loader2 className='size-3.5 animate-spin text-primary' />,
  completed: <CheckCircle2 className='size-3.5 text-success' />,
  failed: <XCircle className='size-3.5 text-destructive' />,
}

/** A6：研究任务进度区——计划步骤、工具调用状态、失败原因（答案在消息流，不进这里）。 */
const ResearchTaskView = ({ state }: { state: ResearchTaskState }) => (
  <div className='rounded-xl border border-border bg-background p-3'>
    <div className='flex items-center gap-2'>
      <span className='text-xs font-bold'>研究任务</span>
      <span className='rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary'>
        {STATUS_LABEL[state.status]}
      </span>
    </div>

    {state.error && (
      <div
        className={cn(
          'mt-2 rounded-lg border px-2.5 py-1.5 text-[11.5px]',
          state.error.recoverable
            ? 'border-warning/30 bg-warning/10 text-warning'
            : 'border-destructive/30 bg-destructive/10 text-destructive'
        )}
      >
        [{state.error.code}] {state.error.message}
        {state.error.recoverable && '（已基于现有资料降级回答）'}
      </div>
    )}

    <ul className='mt-2 flex flex-col gap-2'>
      {state.steps.map((step) => (
        <li key={step.id} className='flex flex-col gap-1'>
          <div className='flex items-center gap-1.5 text-[12px] text-foreground'>
            {STEP_ICON[step.status]}
            <span className={cn(step.status === 'pending' && 'text-muted-foreground')}>{step.title}</span>
          </div>
          {step.toolCalls.length > 0 && (
            <div className='flex flex-wrap gap-1 pl-5'>
              {step.toolCalls.map((tc, idx) => (
                <span
                  key={idx}
                  title={tc.error ?? undefined}
                  className={cn(
                    'rounded-md px-1.5 py-0.5 font-mono text-[10.5px]',
                    tc.ok === null && 'bg-muted text-muted-foreground',
                    tc.ok === true && 'bg-success/10 text-success',
                    tc.ok === false && 'bg-destructive/10 text-destructive'
                  )}
                >
                  {tc.tool}
                  {tc.ok === null ? ' …' : tc.ok ? ' ✓' : ' ✗'}
                </span>
              ))}
            </div>
          )}
        </li>
      ))}
    </ul>
  </div>
)

export default ResearchTaskView
