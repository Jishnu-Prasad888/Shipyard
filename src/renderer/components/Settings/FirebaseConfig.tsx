import React from 'react'

interface FirebaseConfigProps {
  config: any
  onConfigChange: (config: any) => void
}

const FIELDS = [
  { key: 'apiKey', label: 'API Key', placeholder: 'AIzaSy...' },
  { key: 'authDomain', label: 'Auth Domain', placeholder: 'project.firebaseapp.com' },
  { key: 'projectId', label: 'Project ID', placeholder: 'my-project-id' },
  { key: 'storageBucket', label: 'Storage Bucket', placeholder: 'project.appspot.com' },
  { key: 'messagingSenderId', label: 'Messaging Sender ID', placeholder: '123456789' },
  { key: 'appId', label: 'App ID', placeholder: '1:123:web:abc' }
]

export const FirebaseConfig: React.FC<FirebaseConfigProps> = ({ config, onConfigChange }) => {
  const currentConfig = config || {}

  const handleChange = (key: string, value: string) => {
    onConfigChange({ ...currentConfig, [key]: value })
  }

  return (
    <div className="space-y-3 p-4 rounded-lg border border-border">
      <h4 className="text-sm font-medium text-muted">Firebase Configuration</h4>

      {FIELDS.map((field) => (
        <div key={field.key}>
          <label className="block text-xs font-medium mb-1 text-muted">{field.label}</label>
          <input
            type="text"
            value={currentConfig[field.key] || ''}
            onChange={(e) => handleChange(field.key, e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-lg bg-surface text-text text-sm focus:outline-none focus:border-primary"
            placeholder={field.placeholder}
          />
        </div>
      ))}
    </div>
  )
}
