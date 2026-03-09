# ⚓ Shipyard

**Shipyard** is a premium, locally-first Kanban-style productivity application built with a distinctive maritime theme and a bold, neo-brutalist design language. It is designed for users who want a powerful, standalone desktop application to manage complex projects, notes, and tasks without relying on a cloud service by default, but with the option to sync when needed.

---

## 🌊 The Idea: A Maritime Approach to Project Management

Traditional Kanban boards use terms like "Workspaces", "Folders", "Boards", "Lists", and "Cards". Shipyard fully embraces a nautical metaphor to make navigation and organization more intuitive and visually cohesive:

*   **Ports (Folders):** The highest level of organization. A Port contains multiple Docks. Think of it as a workspace or a major client.
*   **Docks (Boards):** A specific project or area of focus within a Port. 
*   **Ships (Lists/Columns):** The stages of your workflow inside a Dock (e.g., "In Drydock" for To-Do, "Underway" for In Progress, "Completed Voyage" for Done).
*   **Cargo (Cards/Tasks):** The actual, actionable items inside a Ship. Each Cargo container holds all the details, notes, and sub-tasks required to get the job done.

---

## ✨ Key Features

### 🛠️ Core Kanban & Organization
*   **Drag-and-Drop:** Seamlessly drag Cargo between Ships, reorganize Ships within a Dock, or move Docks between Ports.
*   **Fleet Overview (Home):** A clear, Jira-style dashboard giving you a birds-eye view of your recently active Ships and a structured breakdown of all your Ports and Docks.
*   **Voyage Calendar:** A dedicated calendar view (Month, Week, and Agenda) that aggregates all Cargo deadlines across your entire fleet, complete with color-coded overdue and "due soon" indicators.
*   **Global Search:** A powerful omnipresent search bar in the header to instantly locate any Port, Dock, or Ship across your entire workspace.
*   **Infinite Nesting:** Break tasks down infinitely with sub-tasks inside your Cargo cards, complete with visual progress bars.

### 📝 Obsidian-Class Markdown Editor
Every Cargo card features a powerful, fully-featured Markdown editor (powered by Tiptap) that rivals dedicated note-taking apps:
*   **Wikilinks (`[[...]`):** Instantly link to other Cargo cards or Ships by typing `[[`. Creates an interconnected web of knowledge.
*   **Rich Formatting:** Support for Headings (H1/H2/H3), Bold, Italic, Strikethrough, Underline, and Highlighted text.
*   **Developer Friendly:** Inline code formatting and full syntax-highlighted code blocks.
*   **Task Lists:** Create interactive `- [ ]` checkboxes directly within your notes.
*   **Edit / Preview Modes:** Switch between a raw writing experience and a beautiful, read-only rendered view.

### 🎨 Neo-Brutalist Maritime Design
The UI utilizes a striking, custom Neo-Brutalist design system defined by hard shadows, thick borders, and a carefully curated maritime color palette:
*   **Deep Harbor Blue (`#0B2545`):** Grounding the sidebar and structural elements.
*   **Port Blue (`#1F5F8B`):** Framing the header and structural borders.
*   **Soft Ocean (`#E8F3FA`):** A calming background for your active boards.
*   **Bright Marine (`#2D82B7`):** Punchy, primary action buttons.
*   **Light / Dark Themes:** Full support for both bright daylight sailing and deep night harbor modes.

### 💾 Local-First & Optional Cloud Sync
*   **SQLite Powered:** Your data is entirely yours. Shipyard stores everything locally on your machine using an embedded SQLite database, ensuring lightning-fast performance and total offline capability.
*   **Firebase Integration (Optional):** Want your Docks on multiple computers? Enter your own Firebase Web SDK credentials in the Settings to enable seamless, bidirectional cloud synchronization. 
    *   Features manual Push/Pull controls and automatic 60-second background syncing.
    *   Timestamp-based conflict resolution ensures you never lose data.

---

## 🚀 Tech Stack

Shipyard is built using a modern desktop stack:
*   **Core:** Electron (Cross-platform desktop framework)
*   **Frontend:** React 18, TypeScript, Vite
*   **Styling:** TailwindCSS v4 with a custom Neo-Brutalist CSS configuration
*   **State Management:** Redux Toolkit
*   **Database:** `better-sqlite3` (Local Main Process)
*   **Sync:** Firebase Firestore Web SDK
*   **Editor:** TipTap (Headless ProseMirror wrapper)
*   **Drag & Drop:** `@dnd-kit`

---

## 📦 Getting Started

### Prerequisites
*   [Node.js](https://nodejs.org/) (v18+ recommended)
*   npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Jishnu-Prasad888/Shipyard.git
   cd Shipyard
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Run in development mode**
   ```bash
   npm run dev
   ```

4. **Build for production**
   ```bash
   npm run build:win   # For Windows
   npm run build:mac   # For MacOS
   npm run build:linux # For Linux
   ```

---

## ☁️ Setting up Firebase Sync (Optional)

1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Create a new project and add a "Web App".
3. Initialize a **Firestore Database** in Test Mode (or set up proper security rules).
4. Copy your Firebase SDK configuration.
5. Open **Shipyard > Settings > Firebase Sync**.
6. Paste your credentials, save, and click "Test" to verify the connection.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check the [issues page](https://github.com/Jishnu-Prasad888/Shipyard/issues).

## 📄 License

This project is licensed under the MIT License.
