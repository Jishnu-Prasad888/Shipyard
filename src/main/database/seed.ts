import { DatabaseService } from './database.service.js'
import { v4 as uuidv4 } from 'uuid'

export async function seedDatabase(dbService: DatabaseService) {
  console.log('====== STARTING DATABASE SEED ======')
  const _db = (dbService as any).db

  // First clear everything except settings
  const tables = ['subcards', 'connections', 'sync_queue', 'cards', 'statuses', 'lists', 'boards', 'docks', 'folders', 'tags']
  for (const table of tables) {
    _db.exec(`DELETE FROM ${table};`)
  }

  const now = Date.now()

  // ── 1. Create Ports (Folders) ──
  const port1 = { id: uuidv4(), name: 'Engineering Base', color: '#2D82B7', parentId: null, createdAt: now }
  const port2 = { id: uuidv4(), name: 'Operations', color: '#3FA796', parentId: null, createdAt: now }
  const subPort = { id: uuidv4(), name: 'Archived Projects', parentId: port2.id, color: '#D97B66', createdAt: now }
  
  await dbService.create('folders', port1)
  await dbService.create('folders', port2)
  await dbService.create('folders', subPort)

  // ── 2. Create Docks ──
  const dock1 = { id: uuidv4(), name: 'Alpha Platform', description: 'Core product development', folderId: port1.id, color: '#2D82B7', tags: JSON.stringify(['Core']), createdAt: now, updatedAt: now }
  const dock2 = { id: uuidv4(), name: 'Beta API', description: 'V2 Migration rollout', folderId: port1.id, color: '#1F5F8B', tags: JSON.stringify(['API']), createdAt: now, updatedAt: now }
  const dock3 = { id: uuidv4(), name: 'Marketing Launch', description: '', folderId: port2.id, color: '#5FA8D3', tags: JSON.stringify(['Marketing']), createdAt: now, updatedAt: now }
  
  await dbService.create('docks', dock1)
  await dbService.create('docks', dock2)
  await dbService.create('docks', dock3)

  // ── 3. Create Ships (Boards) ──
  const ship1 = { id: uuidv4(), name: 'Frontend Rewrite', description: 'React 18 & Vite', dockId: dock1.id, color: '#5FA8D3', tags: JSON.stringify(['UI']), createdAt: now, updatedAt: now }
  const ship2 = { id: uuidv4(), name: 'Security Audit', description: 'Q3 Penetration Testing', dockId: dock1.id, color: '#D97B66', tags: JSON.stringify(['Sec']), createdAt: now, updatedAt: now }
  const ship3 = { id: uuidv4(), name: 'User Research', description: 'Interviews & Data', dockId: dock2.id, color: '#3FA796', tags: JSON.stringify([]), createdAt: now, updatedAt: now }

  await dbService.create('boards', ship1)
  await dbService.create('boards', ship2)
  await dbService.create('boards', ship3)

  // ── 4. Create Statuses (per board) ──
  const sInfoId = uuidv4()
  const sProgId = uuidv4()
  const sBlockId = uuidv4()
  const sDoneId = uuidv4()

  await dbService.create('statuses', { id: sInfoId, name: 'Triage', color: '#5FA8D3', boardId: ship1.id, createdAt: now, updatedAt: now })
  await dbService.create('statuses', { id: sProgId, name: 'Active', color: '#2D82B7', boardId: ship1.id, createdAt: now, updatedAt: now })
  await dbService.create('statuses', { id: sBlockId, name: 'Blocked', color: '#D97B66', boardId: ship1.id, createdAt: now, updatedAt: now })
  await dbService.create('statuses', { id: sDoneId, name: 'Shipped', color: '#3FA796', boardId: ship1.id, createdAt: now, updatedAt: now })

  // ── 5. Create Manifests (Lists) ──
  const list1 = { id: uuidv4(), name: 'Backlog', boardId: ship1.id, "order": 0, color: '#1F5F8B', createdAt: now, updatedAt: now }
  const list2 = { id: uuidv4(), name: 'In Progress', boardId: ship1.id, "order": 1, color: '#2D82B7', createdAt: now, updatedAt: now }
  const list3 = { id: uuidv4(), name: 'Review', boardId: ship1.id, "order": 2, color: '#5FA8D3', createdAt: now, updatedAt: now }
  const list4 = { id: uuidv4(), name: 'Done', boardId: ship1.id, "order": 3, color: '#3FA796', createdAt: now, updatedAt: now }

  await dbService.create('lists', list1)
  await dbService.create('lists', list2)
  await dbService.create('lists', list3)
  await dbService.create('lists', list4)

  // ── 6. Create Global Tags ──
  const tag1 = { id: uuidv4(), name: 'High Priority', color: '#D97B66', createdAt: now }
  const tag2 = { id: uuidv4(), name: 'Bug', color: '#c0392b', createdAt: now }
  const tag3 = { id: uuidv4(), name: 'Enhancement', color: '#2D82B7', createdAt: now }

  await dbService.create('tags', tag1)
  await dbService.create('tags', tag2)
  await dbService.create('tags', tag3)

  // ── 7. Create Cargo (Cards) ──
  const card1Id = uuidv4()
  const card2Id = uuidv4()
  const card3Id = uuidv4()
  const card4Id = uuidv4()

  const sampleMd = `
<h1>Refactor Core Setup</h1>
<p>Current implementation has significant drift.</p>

<h2>Action Items</h2>
<ul>
<li><p>Update dependencies to latest</p></li>
<li><p>Migrate settings store</p></li>
<li><p>Test offline support</p></li>
</ul>

<h3>Notes</h3>
<p>This relies on <span data-wiki-link="Fix Auth Token Leak" data-target="Fix Auth Token Leak" class="wiki-link">Fix Auth Token Leak</span> being resolved first.</p>
`

  const sampleMd2 = `
<ul data-type="taskList">
  <li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked="checked"></label><div><p>Installed packages</p></div></li>
  <li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked="checked"></label><div><p>Created CSS</p></div></li>
  <li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked="checked"></label><div><p>Tied up wikilinks</p></div></li>
</ul>
`

  const card1 = {
    id: card1Id, title: 'Upgrade React to 18', description: 'Concurrent features needed',
    listId: list1.id, boardId: ship1.id, "order": 0, color: '#2D82B7',
    deadline: now + 86400000 * 3, status: JSON.stringify({id: sProgId, name: 'Active', color: '#2D82B7'}),
    notes: sampleMd, tags: JSON.stringify([tag3]),
    subCards: JSON.stringify([]), connectedCardIds: JSON.stringify([]), connectedListIds: JSON.stringify([]),
    createdAt: now, updatedAt: now
  }

  const card2 = {
    id: card2Id, title: 'Fix Auth Token Leak', description: 'Critical security issue in JWT rotation',
    listId: list2.id, boardId: ship1.id, "order": 0, color: '#D97B66',
    deadline: now + 86400000, status: JSON.stringify({id: sProgId, name: 'Active', color: '#2D82B7'}),
    notes: '<p>See ticket SEC-941</p>', tags: JSON.stringify([tag1, tag2]),
    subCards: JSON.stringify([]), connectedCardIds: JSON.stringify([card1Id]), connectedListIds: JSON.stringify([]),
    createdAt: now, updatedAt: now
  }

  const card3 = {
    id: card3Id, title: 'Implement Obsidian Markdown', description: 'Setup TipTap extensions',
    listId: list4.id, boardId: ship1.id, "order": 0, color: '#3FA796',
    deadline: now - 86400000, status: JSON.stringify({id: sDoneId, name: 'Shipped', color: '#3FA796'}),
    notes: sampleMd2, tags: JSON.stringify([tag3]),
    subCards: JSON.stringify([]), connectedCardIds: JSON.stringify([]), connectedListIds: JSON.stringify([]),
    createdAt: now, updatedAt: now
  }

  const card4 = {
    id: card4Id, title: 'Write Comprehensive README', description: '',
    listId: list3.id, boardId: ship1.id, "order": 0, color: '#5FA8D3',
    status: JSON.stringify({id: sInfoId, name: 'Triage', color: '#5FA8D3'}),
    notes: '', tags: JSON.stringify([]),
    subCards: JSON.stringify([]), connectedCardIds: JSON.stringify([]), connectedListIds: JSON.stringify([]),
    createdAt: now, updatedAt: now
  }

  await dbService.create('cards', card1)
  await dbService.create('cards', card2)
  await dbService.create('cards', card3)
  await dbService.create('cards', card4)

  const card1updated = { ...card1, connectedCardIds: JSON.stringify([card2Id]) }
  await dbService.update('cards', card1Id, card1updated)

  // ── 8. Create SubCards ──
  await dbService.create('subcards', { id: uuidv4(), title: 'Draft v1', completed: 1, cardId: card4Id, createdAt: now })
  await dbService.create('subcards', { id: uuidv4(), title: 'Add Screenshots', completed: 0, cardId: card4Id, createdAt: now })
  await dbService.create('subcards', { id: uuidv4(), title: 'Link to License', completed: 0, cardId: card4Id, createdAt: now })

  console.log('====== DATABASE SEEDED ======')
}
