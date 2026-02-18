//
//  CreateSetListView.swift
//  ComedySetOrganizer
//
//  Created by ComedySetOrganizer on 2024.
//

import SwiftUI
import CoreData

struct CreateSetListView: View {
    @Environment(\.managedObjectContext) private var viewContext
    @Environment(\.dismiss) private var dismiss
    
    @State private var setName = ""
    @State private var selectedJokes: [Joke] = []
    @State private var availableJokes: [Joke] = []
    
    @FetchRequest(
        sortDescriptors: [NSSortDescriptor(keyPath: \Joke.title, ascending: true)],
        animation: .default
    ) private var allJokes: FetchedResults<Joke>
    
    private var isValidSet: Bool {
        !setName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && 
        selectedJokes.count >= 1
    }
    
    var body: some View {
        NavigationView {
            Form {
                Section {
                    TextField("Set List Name", text: $setName)
                        .accessibilityLabel("Set list name")
                } header: {
                    Text("Set List Details")
                } footer: {
                    Text("1-50 characters")
                        .foregroundColor(.secondary)
                }
                
                if !selectedJokes.isEmpty {
                    Section {
                        ForEach(selectedJokes, id: \.id) { joke in
                            Text(joke.title ?? "Untitled")
                        }
                        .onMove(perform: moveJokes)
                        .onDelete(perform: removeSelectedJokes)
                    } header: {
                        Text("Selected Jokes (\(selectedJokes.count))")
                    }
                }
                
                Section {
                    if allJokes.isEmpty {
                        Text("No jokes available. Add jokes first.")
                            .foregroundColor(.secondary)
                            .italic()
                    } else {
                        ForEach(Array(allJokes), id: \.id) { joke in
                            HStack {
                                Text(joke.title ?? "Untitled")
                                Spacer()
                                if selectedJokes.contains(where: { $0.id == joke.id }) {
                                    Image(systemName: "checkmark")
                                        .foregroundColor(.accentColor)
                                        .accessibilityLabel("Added")
                                }
                            }
                            .contentShape(Rectangle())
                            .onTapGesture {
                                toggleJokeSelection(joke)
                            }
                            .accessibilityAddTraits(.isButton)
                        }
                    }
                } header: {
                    Text("Available Jokes")
                }
            }
            .navigationTitle("Create Set List")
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Save") {
                        saveSetList()
                    }
                    .disabled(!isValidSet)
                }
            }
        }
        .onAppear {
            availableJokes = Array(allJokes)
        }
    }
    
    private func toggleJokeSelection(_ joke: Joke) {
        if let index = selectedJokes.firstIndex(where: { $0.id == joke.id }) {
            selectedJokes.remove(at: index)
        } else {
            selectedJokes.append(joke)
        }
    }
    
    private func moveJokes(from source: IndexSet, to destination: Int) {
        selectedJokes.move(fromOffsets: source, toOffset: destination)
    }
    
    private func removeSelectedJokes(offsets: IndexSet) {
        selectedJokes.remove(atOffsets: offsets)
    }
    
    private func saveSetList() {
        let setList = SetList(context: viewContext)
        setList.id = UUID()
        setList.name = setName.trimmingCharacters(in: .whitespacesAndNewlines)
        setList.jokeOrder = selectedJokes.compactMap { $0.id } as NSArray
        setList.createdAt = Date()
        setList.updatedAt = Date()
        
        do {
            try viewContext.save()
            dismiss()
        } catch {
            print("Error saving set list: \(error)")
        }
    }
}

#Preview {
    CreateSetListView()
}
