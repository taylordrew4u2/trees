//
//  JokeDetailView.swift
//  ComedySetOrganizer
//
//  Created by ComedySetOrganizer on 2024.
//

import SwiftUI

struct JokeDetailView: View {
    @Environment(\.managedObjectContext) private var viewContext
    let joke: Joke
    
    @State private var showingEditSheet = false
    
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Title")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .textCase(.uppercase)
                    
                    Text(joke.title ?? "Untitled")
                        .font(.title2)
                        .fontWeight(.semibold)
                }
                
                if let body = joke.body, !body.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Content")
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .textCase(.uppercase)
                        
                        Text(body)
                            .font(.body)
                    }
                }
                
                VStack(alignment: .leading, spacing: 8) {
                    Text("Created")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .textCase(.uppercase)
                    
                    if let createdAt = joke.createdAt {
                        Text(createdAt, style: .date)
                            .font(.subheadline)
                    }
                }
                
                if let updatedAt = joke.updatedAt, updatedAt != joke.createdAt {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Last Updated")
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .textCase(.uppercase)
                        
                        Text(updatedAt, style: .date)
                            .font(.subheadline)
                    }
                }
            }
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .navigationTitle("Joke Details")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button("Edit") {
                    showingEditSheet = true
                }
            }
        }
        .sheet(isPresented: $showingEditSheet) {
            AddEditJokeView(joke: joke)
        }
    }
}
