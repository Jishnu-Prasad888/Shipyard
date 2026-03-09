import React from 'react'

interface FirebaseConfigProps {
  config: any
  onConfigChange: (config: any) => void
}

const FIELDS = [
  { key: 'apiKey',            label: 'API Key',             placeholder: 'AIzaSy...',               type: 'text' },
  { key: 'authDomain',        label: 'Auth Domain',          placeholder: 'project.firebaseapp.com',  type: 'text' },
  { key: 'projectId',         label: 'Project ID',           placeholder: 'my-project-id',            type: 'text' },
  { key: 'storageBucket',     label: 'Storage Bucket',       placeholder: 'project.appspot.com',      type: 'text' },
  { key: 'messagingSenderId', label: 'Messaging Sender ID',  placeholder: '123456789',                type: 'text' },
  { key: 'appId',             label: 'App ID',               placeholder: '1:123456:web:abc',         type: 'text' }
]

export const FirebaseConfig: React.FC<FirebaseConfigProps> = ({ config, onConfigChange }) => {
  const currentConfig = config || {}

  const handleChange = (key: string, value: string) => {
    onConfigChange({ ...currentConfig, [key]: value })
  }

  const hasConfig = FIELDS.slice(0, 3).every(f => !!currentConfig[f.key])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[9px] font-black uppercase tracking-widest" style={{ color: 'var(--color-muted)' }}>
          Firebase Web SDK Config
        </p>
        {hasConfig && (
          <span
            className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 border"
            style={{ borderColor: '#059669', color: '#059669', background: '#05966912' }}
          >
            Config Ready ✓
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {FIELDS.map((field) => {
          const filled = !!currentConfig[field.key]
          return (
            <div key={field.key} className={field.key === 'apiKey' ? 'col-span-2' : ''}>
              <label
                className="block text-[9px] font-black uppercase tracking-wider mb-0.5"
                style={{ color: filled ? 'var(--color-primary)' : 'var(--color-muted)' }}
              >
                {field.label}
                {['apiKey', 'authDomain', 'projectId'].includes(field.key) && (
                  <span className="text-red-500 ml-0.5">*</span>
                )}
              </label>
              <input
                type="text"
                value={currentConfig[field.key] || ''}
                onChange={(e) => handleChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                spellCheck={false}
                className="w-full px-2 py-1.5 border-2 bg-transparent text-xs font-mono focus:outline-none transition-all"
                style={{
                  borderColor: filled ? 'var(--color-primary)' : 'var(--color-border)',
                  color: 'var(--color-text)',
                  boxShadow: filled ? 'inset 2px 2px 0 var(--color-primary-soft)' : 'none'
                }}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--color-primary)'; e.currentTarget.style.boxShadow = '2px 2px 0 var(--color-primary)' }}
                onBlur={e => {
                  e.currentTarget.style.borderColor = filled ? 'var(--color-primary)' : 'var(--color-border)'
                  e.currentTarget.style.boxShadow = 'none'
                }}
              />
            </div>
          )
        })}
      </div>

      <p className="text-[9px] font-bold mt-1" style={{ color: 'var(--color-muted)' }}>
        Find this in Firebase Console → Project Settings → Your Apps → Web App → SDK snippet
      </p>
    </div>
  )
}
