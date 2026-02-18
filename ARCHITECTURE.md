# Comedy Set Organizer - Architecture Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                     Comedy Set Organizer                        │
│                         iOS App                                 │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│                        App Layer                                │
├────────────────────────────────────────────────────────────────┤
│  ComedySetOrganizerApp.swift                                   │
│  - @main entry point                                            │
│  - Initializes CoreDataStack                                    │
│  - Injects managedObjectContext into environment                │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                        View Layer (SwiftUI)                     │
├────────────────────────────────────────────────────────────────┤
│  HomeView.swift                                                 │
│  ├── JokesView → AddEditJokeView → JokeDetailView             │
│  ├── CreateSetListView                                          │
│  ├── SetListsView → SetListDetailView → RecordSetView         │
│  └── RecordingsView                                             │
│                                                                  │
│  EmptyStateView (reusable component)                            │
└────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
┌─────────────────────────────┐  ┌──────────────────────────┐
│      Manager Layer          │  │    Model Layer           │
├─────────────────────────────┤  ├──────────────────────────┤
│ AudioRecorderManager.swift  │  │  CoreDataStack.swift     │
│  - AVAudioRecorder          │  │  - NSPersistentContainer │
│  - Start/Pause/Resume/Stop  │  │  - viewContext           │
│  - Timer management         │  │                          │
│  - Permission handling      │  │  Entity Extensions:      │
│  - @Published state         │  │  - Joke+Extensions       │
└─────────────────────────────┘  │  - SetList+Extensions    │
                                  │  - Recording+Extensions  │
                                  └──────────────────────────┘
                                              │
                                              ▼
┌────────────────────────────────────────────────────────────────┐
│                 Core Data Model (.xcdatamodeld)                 │
├────────────────────────────────────────────────────────────────┤
│  Entities:                                                      │
│                                                                  │
│  Joke                    SetList                  Recording     │
│  ├── id: UUID            ├── id: UUID             ├── id: UUID │
│  ├── title: String       ├── name: String         ├── setListId│
│  ├── body: String        ├── jokeOrder: [UUID]    ├── fileURL  │
│  ├── createdAt: Date     ├── createdAt: Date      ├── duration │
│  └── updatedAt: Date     ├── updatedAt: Date      └── createdAt│
│                          └── lastPerformedAt       │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                      Local Storage                              │
├────────────────────────────────────────────────────────────────┤
│  SQLite Database (Core Data)                                    │
│  - Jokes, Set Lists, Recording metadata                         │
│                                                                  │
│  File System (Documents Directory)                              │
│  - Audio recordings (.m4a files)                                │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│                    System Frameworks                            │
├────────────────────────────────────────────────────────────────┤
│  SwiftUI         - UI framework                                 │
│  CoreData        - Data persistence                             │
│  AVFoundation    - Audio recording                              │
│  Combine         - Reactive programming                         │
└────────────────────────────────────────────────────────────────┘

Key Features:
═════════════
✓ Offline-first architecture
✓ No network calls or tracking
✓ Local data persistence with Core Data
✓ Audio recording with AVFoundation
✓ Reactive UI with SwiftUI and Combine
✓ Accessibility support (VoiceOver, Dynamic Type)
✓ Privacy-focused (no data collection)

User Flow:
══════════
1. Add jokes to library
2. Create set lists by selecting and ordering jokes
3. Record performances with audio
4. Review recordings and track progress
5. Edit/delete content as needed

All data stays on device. No sign-in required.
