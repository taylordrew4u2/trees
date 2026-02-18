//
//  AddEditJokeView.swift
//  ComedySetOrganizer
//
//  Created by ComedySetOrganizer on 2024.
//

import SwiftUI
import CoreData

struct AddEditJokeView: View {
    @Environment(\.managedObjectContext) private var viewContext
    @Environment(\.dismiss) private var dismiss
    
    var joke: Joke?
    
    @State private var title: String = ""
    @State private var body: String = ""
    
    private var isEditing: Bool {
        joke != nil
    }
    
    private var isValid: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    
    var body: some View {
        NavigationView {
            Form {
                Section {
                    TextField("Joke Title", text: $title)
                        .accessibilityLabel("Joke title")
                } header: {
                    Text("Title")
                } footer: {
                    Text("Required")
                        .foregroundColor(.secondary)
                }
                
                Section {
                    TextEditor(text: $body)
                        .frame(minHeight: 150)
                        .accessibilityLabel("Joke content")
                } header: {
                    Text("Content")
                } footer: {
                    Text("Optional")
                        .foregroundColor(.secondary)
                }
            }
            .navigationTitle(isEditing ? "Edit Joke" : "Add Joke")
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Save") {
                        saveJoke()
                    }
                    .disabled(!isValid)
                }
            }
        }
        .onAppear {
            if let joke = joke {
                title = joke.title ?? ""
                body = joke.body ?? ""
            }
        }
    }
    
    private func saveJoke() {
        if let existingJoke = joke {
            existingJoke.title = title.trimmingCharacters(in: .whitespacesAndNewlines)
            existingJoke.body = body
            existingJoke.updatedAt = Date()
        } else {
            let newJoke = Joke(context: viewContext, title: title, body: body)
        }
        
        do {
            try viewContext.save()
            dismiss()
        } catch {
            print("Error saving joke: \(error)")
        }
    }
}

#Preview {
    AddEditJokeView()
}
