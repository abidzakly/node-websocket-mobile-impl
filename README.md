## 📡 WebSocket Implementation — Flutter (BLoC) + Node.js

A production-ready, full-duplex WebSocket system built with **Flutter BLoC** on the client and **Node.js (`ws`)** on the server. Designed with Clean Architecture principles, JWT authentication, and robust reconnect handling.

---

### ✨ Features

- 🔌 **Persistent WebSocket connection** — full-duplex, low-latency messaging
- 🔐 **JWT authentication** on handshake — connections rejected before they open
- 🔁 **Exponential backoff reconnect** with jitter — prevents thundering herd on server restart
- ✅ **ACK delivery confirmation** via `requestId` + `Completer` pattern
- 🧱 **Clean Architecture** — domain layer fully decoupled from transport and UI
- 🗂️ **BLoC state management** — reactive UI synced to connection and command states
- 🔒 **Optional HMAC-SHA256 payload signing** for integrity verification
- 📦 **Command routing system** — extensible, enum-based command codes

---

### 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Mobile client | Flutter 3.x + `dart:io WebSocket` |
| State management | BLoC (flutter_bloc) |
| Server | Node.js 18+ + `ws` ^8.x |
| Auth | JWT (`jsonwebtoken`) |
| DI (Flutter) | `get_it` |
| Secure storage | `flutter_secure_storage` |

---

### 🚀 Quick Start

**Server**
```bash
cd node_server
npm install
cp .env.example .env   # set JWT_SECRET
npm run dev
```

**Flutter**
```bash
cd flutter_client
flutter pub get
flutter run
```

> Android emulator? Use `ws://10.0.2.2:8080` instead of `localhost`.

---

### 📂 Architecture

```
Flutter Client                  Node.js Server
─────────────                   ──────────────
Widget (UI)                     ws.Server
  └─ BLoC (State)                 ├─ JWT verifyClient
       └─ Use Cases              └─ Command Router
            └─ Repository
                 └─ WebSocket DataSource
```

---

### 📡 Protocol

Messages are JSON with a `requestId` (UUID v4) for request–response correlation:

```json
// Client → Server
{ "requestId": "uuid", "command": "001", "payload": {} }

// Server → Client
{ "type": "DATA_RESPONSE", "requestId": "uuid", "data": { ... } }
```

**Command codes:** `"001"` → Data A · `"011"` → A+B · `"111"` → A+B+C

---

### 🔐 Security

- Transport: `wss://` (TLS) in production
- Auth: JWT on WebSocket handshake (query param)
- Storage: `flutter_secure_storage` (iOS Keychain / Android Keystore)
- Optional: HMAC-SHA256 payload signatures, certificate pinning

---