import React from 'react'

type Card = {
  id: string
  title: string
  description: string
  tag: string
}

type Column = {
  id: string
  title: string
  cards: Card[]
}

const columns: Column[] = [
  {
    id: 'dock',
    title: 'Dock',
    cards: [
      {
        id: '1',
        title: 'Inspect Hull',
        description: 'Check outer plating for corrosion.',
        tag: 'Maintenance'
      },
      {
        id: '2',
        title: 'Fuel Intake',
        description: 'Verify intake valves and pressure seals.',
        tag: 'Engineering'
      }
    ]
  },
  {
    id: 'assembly',
    title: 'Assembly',
    cards: [
      {
        id: '3',
        title: 'Install Radar',
        description: 'Mount and calibrate navigation array.',
        tag: 'Systems'
      }
    ]
  },
  {
    id: 'departure',
    title: 'Departure',
    cards: [
      {
        id: '4',
        title: 'Final Checklist',
        description: 'Run safety and compliance verification.',
        tag: 'Launch'
      }
    ]
  }
]

export default function App() {
  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="surface px-6 py-4 border-b border-[var(--color-border)]">
        <h1 className="text-xl font-semibold tracking-wide">Ocean Shipyard Board</h1>
        <p className="meta mt-1">Testing custom Tailwind theme tokens & component layers</p>
      </header>

      {/* Board */}
      <main className="flex-1 overflow-x-auto p-6">
        <div className="flex gap-6 h-full">
          {columns.map((column) => (
            <div key={column.id} className="column">
              <h2 className="text-sm font-semibold tracking-wide uppercase text-[var(--color-muted)]">
                {column.title}
              </h2>

              <div className="flex flex-col gap-3">
                {column.cards.map((card) => (
                  <div key={card.id} className="card">
                    <div className="flex items-center justify-between mb-2">
                      <span className="tag">{card.tag}</span>
                      <span className="meta">ID #{card.id}</span>
                    </div>

                    <h3 className="font-medium">{card.title}</h3>
                    <p className="meta mt-1">{card.description}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="surface px-6 py-3 border-t border-[var(--color-border)] text-sm meta">
        Ocean / Shipyard Theme Preview · Tailwind v4 Tokens
      </footer>
    </div>
  )
}
