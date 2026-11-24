export type SourceDescriptor =
  | { kind: 'local'; path: string; label?: string }
  | { kind: 'remote'; address: string; token: string; label?: string }

export interface SourceStatus {
  active: SourceDescriptor | null
  reachable: boolean
  error: string | null
  recent: SourceDescriptor[]
  portable: boolean
}

export interface ShareStatus {
  running: boolean
  canShare: boolean
  port: number
  host: string
  token: string
  readOnly: boolean
  address: string | null
  error: string | null
}
