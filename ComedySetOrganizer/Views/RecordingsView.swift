//
//  RecordingsView.swift
//  ComedySetOrganizer
//
//  Created by ComedySetOrganizer on 2024.
//

import SwiftUI
import CoreData

struct RecordingsView: View {
    @Environment(\.managedObjectContext) private var viewContext
    @FetchRequest(
        sortDescriptors: [NSSortDescriptor(keyPath: \Recording.createdAt, ascending: false)],
        animation: .default
    ) private var recordings: FetchedResults<Recording>
    
    var body: some View {
        Group {
            if recordings.isEmpty {
                EmptyStateView(
                    title: "No Recordings",
                    message: "Record a set to get started",
                    icon: "waveform"
                )
            } else {
                List {
                    ForEach(recordings, id: \.id) { recording in
                        RecordingRowView(recording: recording)
                            .accessibilityElement(children: .combine)
                    }
                    .onDelete(perform: deleteRecordings)
                }
            }
        }
        .navigationTitle("Recordings")
    }
    
    private func deleteRecordings(offsets: IndexSet) {
        withAnimation {
            offsets.map { recordings[$0] }.forEach { recording in
                // Delete the audio file
                if let fileURL = recording.fileURL {
                    try? FileManager.default.removeItem(at: fileURL)
                }
                viewContext.delete(recording)
            }
            saveContext()
        }
    }
    
    private func saveContext() {
        do {
            try viewContext.save()
        } catch {
            print("Error saving context: \(error)")
        }
    }
}

struct RecordingRowView: View {
    let recording: Recording
    
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let createdAt = recording.createdAt {
                Text(createdAt, style: .date)
                    .font(.headline)
            }
            
            HStack {
                Image(systemName: "waveform")
                    .foregroundColor(.accentColor)
                Text(formatDuration(recording.durationSec))
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            
            if let fileURL = recording.fileURL {
                Text(fileURL.lastPathComponent)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(1)
            }
        }
        .padding(.vertical, 4)
    }
    
    private func formatDuration(_ duration: Double) -> String {
        let minutes = Int(duration) / 60
        let seconds = Int(duration) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}

#Preview {
    NavigationView {
        RecordingsView()
    }
}
