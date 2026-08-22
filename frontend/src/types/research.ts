// Research Agent 前端类型（字段对齐后端协议 backend/app/agent/models.py，snake_case）

export type ResearchTaskStatus =
  | 'created'
  | 'planning'
  | 'executing'
  | 'synthesizing'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type ResearchStepStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface ResearchPlanStep {
  id: string
  title: string
}

export interface ResearchToolCallView {
  tool: string
  ok: boolean | null // null = 已发起未出结果
  error?: string | null
}

export interface ResearchStepView {
  id: string
  title: string
  status: ResearchStepStatus
  toolCalls: ResearchToolCallView[]
}

export interface ResearchTaskState {
  taskId: string
  status: ResearchTaskStatus
  steps: ResearchStepView[]
  error: { code: string; message: string; recoverable: boolean } | null
}

// 9 种固定 SSE 事件（type 判别联合）
export type ResearchEvent =
  | { type: 'task.created'; task_id: string; status: string }
  | { type: 'plan.created'; steps: ResearchPlanStep[] }
  | { type: 'step.started'; step_id: string }
  | { type: 'tool.call'; step_id: string; tool: string; arguments: Record<string, unknown> }
  | {
      type: 'tool.result'
      step_id: string
      tool: string
      ok: boolean
      source_count?: number
      error?: string | null
    }
  | { type: 'step.completed'; step_id: string }
  | { type: 'answer.delta'; content: string }
  | { type: 'task.completed'; task_id: string }
  | { type: 'task.error'; code: string; message: string; recoverable: boolean }
