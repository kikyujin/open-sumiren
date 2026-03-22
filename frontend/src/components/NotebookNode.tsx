// src/components/NotebookNode.tsx
import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'

export type NotebookNodeData = {
  name: string
  llmModel: string
  updatedAt: string | null
}

function NotebookNode({ data }: NodeProps) {
  const d = data as NotebookNodeData
  const updatedLabel = d.updatedAt
    ? new Date(d.updatedAt).toLocaleString('ja-JP', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '\u2014'

  return (
    <div
      style={{
        padding: '12px 16px',
        background: '#fff',
        border: '1px solid #ddd',
        borderRadius: 8,
        minWidth: 180,
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <div style={{ fontWeight: 'bold', fontSize: 14, marginBottom: 4 }}>
        {d.name}
      </div>
      <div style={{ fontSize: 11, color: '#888' }}>{d.llmModel}</div>
      <div style={{ fontSize: 11, color: '#888' }}>更新: {updatedLabel}</div>
      {/* Handle は Phase 3 のエッジ用。今は非表示で配置だけしておく */}
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
    </div>
  )
}

export default memo(NotebookNode)
