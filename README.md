# MergeFlow

MergeFlow is a real-time collaborative code editor featuring a VS Code-style UI, powered by a Go backend and a React/TypeScript frontend.

## Architecture

MergeFlow follows a client-server architecture designed for low-latency synchronization of text and user presence.

### Backend (Go)
The backend is implemented in Go and manages the authoritative state of shared documents.
- **Session Management**: Handles document rooms and client connections.
- **Concurrency Control**: Uses mutexes to manage access to document state and client lists within each room.
- **Transport Layer**: Utilizes WebSockets for full-duplex communication.

### Frontend (React + TypeScript)
The frontend provides a rich editor experience.
- **Editor**: Built using the Monaco Editor (the engine behind VS Code).
- **State Management**: Uses Zustand for lightweight global state and Yjs/CRDT logic for conflict-free text synchronization.
- **Styling**: Tailwind CSS for a modern, responsive UI.

## WebSockets and Synchronization

The application uses a custom WebSocket protocol to synchronize state between clients and the server.

### Communication Flow
1. **Join**: A client connects and sends a `join` message with a document ID and user identity.
2. **Snapshot**: The server responds with a `snapshot` containing the current full text of the document and a list of active users.
3. **Operations (Ops)**: Text changes are sent as `op` messages (insert/delete). The server applies these operations to the document and broadcasts them to all other clients in the room.
4. **Presence**: Cursor positions and user metadata are synchronized via `presence` and `cursor` messages, allowing users to see each other in real-time.

### Protocol Schema
Messages are JSON-encoded and categorized into:
- **Client to Server**: `join`, `op`, `cursor`.
- **Server to Client**: `snapshot`, `op`, `presence`, `cursor`, `leave`, `error`.

## Getting Started

### Prerequisites
- Go 1.26.5 or later
- Node.js (LTS recommended)
- npm

### Local Development

#### 1. Start the Backend
```bash
# Navigate to the root directory
go run cmd/gateway/main.go
```
The backend will start the WebSocket server (typically on port 8080 or as configured in `main.go`).

#### 2. Start the Frontend
```bash
# Navigate to the web directory
cd web
npm install
npm run dev
```
Once the development server is running, you can view the application by opening the provided URL (usually `http://localhost:5173`) in your web browser.

## Testing

### Backend Tests
Run Go tests using the standard toolchain:
```bash
go test ./...
```

### Frontend Tests
Run WebSocket protocol and connection tests:
```bash
cd web
npm run test:ws
```
