export const schema = `
-- Dock Folders
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,
  parentId TEXT,
  createdAt INTEGER NOT NULL,
  FOREIGN KEY (parentId) REFERENCES folders(id) ON DELETE CASCADE
);

-- Docks (Project Groups)
CREATE TABLE IF NOT EXISTS docks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  folderId TEXT,
  tags TEXT,
  color TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  boardIds TEXT,
  FOREIGN KEY (folderId) REFERENCES folders(id) ON DELETE SET NULL
);

-- Boards (Kanban Boards within Docks)
CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  dockId TEXT NOT NULL,
  color TEXT,
  tags TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  FOREIGN KEY (dockId) REFERENCES docks(id) ON DELETE CASCADE
);

-- Lists (Columns within Boards)
CREATE TABLE IF NOT EXISTS lists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  boardId TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  color TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  FOREIGN KEY (boardId) REFERENCES boards(id) ON DELETE CASCADE
);

-- Cards
CREATE TABLE IF NOT EXISTS cards (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  listId TEXT NOT NULL,
  boardId TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  color TEXT,
  deadline INTEGER,
  status TEXT,
  notes TEXT,
  tags TEXT,
  connectedCardIds TEXT,
  connectedListIds TEXT,
  subCards TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  FOREIGN KEY (listId) REFERENCES lists(id) ON DELETE CASCADE
);

-- SubCards (Subtasks)
CREATE TABLE IF NOT EXISTS subcards (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  completed INTEGER DEFAULT 0,
  cardId TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  FOREIGN KEY (cardId) REFERENCES cards(id) ON DELETE CASCADE
);

-- Statuses (per board)
CREATE TABLE IF NOT EXISTS statuses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,
  boardId TEXT NOT NULL,
  createdAt INTEGER,
  updatedAt INTEGER,
  FOREIGN KEY (boardId) REFERENCES boards(id) ON DELETE CASCADE
);

-- Connections (card-to-card arrows)
CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY,
  fromId TEXT NOT NULL,
  toId TEXT NOT NULL,
  type TEXT NOT NULL,
  points TEXT,
  boardId TEXT NOT NULL,
  FOREIGN KEY (boardId) REFERENCES boards(id) ON DELETE CASCADE
);

-- Tags (global tag registry)
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,
  createdAt INTEGER NOT NULL
);

-- Settings
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updatedAt INTEGER NOT NULL
);

-- Sync Queue
CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY,
  operation TEXT NOT NULL,
  "table" TEXT NOT NULL,
  recordId TEXT NOT NULL,
  data TEXT,
  timestamp INTEGER NOT NULL,
  synced INTEGER DEFAULT 0
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cards_list ON cards(listId);
CREATE INDEX IF NOT EXISTS idx_cards_board ON cards(boardId);
CREATE INDEX IF NOT EXISTS idx_lists_board ON lists(boardId);
CREATE INDEX IF NOT EXISTS idx_boards_dock ON boards(dockId);
CREATE INDEX IF NOT EXISTS idx_subcards_card ON subcards(cardId);
CREATE INDEX IF NOT EXISTS idx_sync_queue_synced ON sync_queue(synced);
CREATE INDEX IF NOT EXISTS idx_docks_folder ON docks(folderId);
`
