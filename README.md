# Comedy Set Organizer

An iOS app for comedians to manage their jokes, create set lists, and record performances.

## Features

- **Joke Library**: Store and organize all your comedy material
- **Set List Builder**: Create performance sets by reordering jokes  
- **Audio Recorder**: Record your sets with professional quality
- **Performance Tracking**: Track what works and needs improvement
- **100% Local**: No sign-in required, no tracking, works offline
- **Accessibility**: Full VoiceOver and Dynamic Type support

## Project Structure

```
ComedySetOrganizer/
├── ComedySetOrganizerApp.swift    # Main app entry point
├── Models/                         # Core Data models and extensions
│   ├── CoreDataStack.swift
│   ├── Joke+Extensions.swift
│   ├── SetList+Extensions.swift
│   └── Recording+Extensions.swift
├── Views/                          # SwiftUI views
│   ├── HomeView.swift
│   ├── JokesView.swift
│   ├── AddEditJokeView.swift
│   ├── JokeDetailView.swift
│   ├── CreateSetListView.swift
│   ├── SetListsView.swift
│   ├── SetListDetailView.swift
│   ├── RecordSetView.swift
│   ├── RecordingsView.swift
│   └── EmptyStateView.swift
├── Managers/                       # Business logic
│   └── AudioRecorderManager.swift
├── Resources/                      # Assets and metadata
│   ├── privacy-policy.html
│   └── APP_STORE_METADATA.md
├── ComedySetOrganizer.xcdatamodeld/  # Core Data model
└── Info.plist                      # App configuration
```

## Core Data Model

The app uses Core Data with three main entities:

- **Joke**: Stores individual jokes with title, body, and timestamps
- **SetList**: Organizes jokes into performance sets with custom ordering
- **Recording**: Stores audio recordings linked to set lists

## Privacy

This app collects NO personal data. All content is stored locally on the user's device. Microphone access is only used for recording performances, and recordings are saved locally.

## Requirements

- iOS 15.0+
- Xcode 14.0+
- Swift 5.7+

## App Store

See [APP_STORE_METADATA.md](ComedySetOrganizer/Resources/APP_STORE_METADATA.md) for App Store submission details.