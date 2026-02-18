//
//  RecordSetView.swift
//  ComedySetOrganizer
//
//  Created by ComedySetOrganizer on 2024.
//

import SwiftUI
import AVFoundation

struct RecordSetView: View {
    @Environment(\.managedObjectContext) private var viewContext
    @Environment(\.dismiss) private var dismiss
    
    let setList: SetList
    @StateObject private var audioRecorder = AudioRecorderManager()
    @State private var showingDiscardAlert = false
    @State private var recordingFileURL: URL?
    
    var body: some View {
        VStack(spacing: 30) {
            // Timer Display
            VStack(spacing: 10) {
                Text(formatTime(audioRecorder.recordingTime))
                    .font(.system(size: 64, weight: .bold, design: .monospaced))
                    .foregroundColor(.primary)
                
                if audioRecorder.isPaused {
                    Text("Paused")
                        .font(.title3)
                        .foregroundColor(.orange)
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel("Recording time: \(formatTimeAccessibility(audioRecorder.recordingTime))")
            
            // Recording Controls
            HStack(spacing: 40) {
                if !audioRecorder.isRecording {
                    Button(action: { Task { await startRecording() } }) {
                        RecordButton(label: "Start Recording", systemImage: "record.circle")
                    }
                    .accessibilityHint("Begin recording your set")
                } else {
                    if audioRecorder.isPaused {
                        Button(action: audioRecorder.resumeRecording) {
                            RecordButton(label: "Resume", systemImage: "play.circle")
                        }
                    } else {
                        Button(action: audioRecorder.pauseRecording) {
                            RecordButton(label: "Pause", systemImage: "pause.circle")
                        }
                    }
                    
                    Button(action: stopRecording) {
                        RecordButton(label: "Stop", systemImage: "stop.circle", color: .red)
                    }
                }
            }
            
            // Set List Preview
            if !setList.jokesArray.isEmpty {
                VStack(alignment: .leading) {
                    Text("Set List Order")
                        .font(.headline)
                    
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 8) {
                            ForEach(setList.jokesArray, id: \.id) { joke in
                                Text(joke.title ?? "Untitled")
                                    .font(.subheadline)
                                    .padding(.horizontal)
                            }
                        }
                    }
                    .frame(maxHeight: 200)
                }
                .padding()
                .background(Color(.systemGray6))
                .cornerRadius(12)
            }
            
            Spacer()
        }
        .padding()
        .navigationTitle("Record Set")
        .navigationBarBackButtonHidden(audioRecorder.isRecording)
        .toolbar {
            if audioRecorder.isRecording {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        if audioRecorder.isRecording {
                            showingDiscardAlert = true
                        } else {
                            dismiss()
                        }
                    }
                }
            }
        }
        .alert("Discard Recording?", isPresented: $showingDiscardAlert) {
            Button("Discard", role: .destructive) {
                _ = audioRecorder.stopRecording()
                dismiss()
            }
            Button("Continue", role: .cancel) {}
        } message: {
            Text("This recording will be permanently deleted.")
        }
        .onDisappear {
            if audioRecorder.isRecording {
                _ = audioRecorder.stopRecording()
            }
        }
    }
    
    private func startRecording() async {
        if let fileURL = await audioRecorder.startRecording(setListName: setList.name ?? "Set") {
            recordingFileURL = fileURL
        }
    }
    
    private func stopRecording() {
        guard let fileURL = audioRecorder.stopRecording() else { return }
        
        let recording = Recording(context: viewContext)
        recording.id = UUID()
        recording.setListId = setList.id
        recording.fileURL = fileURL
        recording.durationSec = audioRecorder.recordingTime
        recording.createdAt = Date()
        
        setList.lastPerformedAt = Date()
        
        do {
            try viewContext.save()
            dismiss()
        } catch {
            print("Error saving recording: \(error)")
        }
    }
    
    private func formatTime(_ time: TimeInterval) -> String {
        let minutes = Int(time) / 60
        let seconds = Int(time) % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }
    
    private func formatTimeAccessibility(_ time: TimeInterval) -> String {
        let minutes = Int(time) / 60
        let seconds = Int(time) % 60
        return "\(minutes) minutes \(seconds) seconds"
    }
}

struct RecordButton: View {
    let label: String
    let systemImage: String
    var color: Color = .accentColor
    
    var body: some View {
        VStack {
            Image(systemName: systemImage)
                .font(.system(size: 50))
                .foregroundColor(color)
            Text(label)
                .font(.caption)
                .foregroundColor(color)
        }
        .frame(width: 100, height: 100)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isButton)
    }
}
