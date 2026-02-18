//
//  JokesView.swift
//  ComedySetOrganizer
//
//  Created by ComedySetOrganizer on 2024.
//

import SwiftUI
import CoreData

struct JokesView: View {
    @Environment(\.managedObjectContext) private var viewContext
    @FetchRequest(
        sortDescriptors: [NSSortDescriptor(keyPath: \Joke.updatedAt, ascending: false)],
        animation: .default
    ) private var jokes: FetchedResults<Joke>
    
    @State private var searchText = ""
    @State private var showingAddJoke = false
    
    private var filteredJokes: [Joke] {
        if searchText.isEmpty {
            return Array(jokes)
        }
        return jokes.filter { joke in
            let titleContains = joke.title?.localizedCaseInsensitiveContains(searchText) ?? false
            let bodyContains = joke.body?.localizedCaseInsensitiveContains(searchText) ?? false
            return titleContains || bodyContains
        }
    }
    
    var body: some View {
        Group {
            if jokes.isEmpty {
                EmptyStateView(
                    title: "No Jokes Yet",
                    message: "Add your first joke to get started",
                    icon: "text.bubble"
                )
            } else {
                List {
                    ForEach(filteredJokes, id: \.id) { joke in
                        NavigationLink(destination: JokeDetailView(joke: joke)) {
                            JokeRowView(joke: joke)
                        }
                        .accessibilityElement(children: .combine)
                    }
                    .onDelete(perform: deleteJokes)
                }
                .searchable(text: $searchText, prompt: "Search jokes...")
            }
        }
        .navigationTitle("Jokes")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(action: { showingAddJoke = true }) {
                    Image(systemName: "plus")
                        .accessibilityLabel("Add new joke")
                }
            }
        }
        .sheet(isPresented: $showingAddJoke) {
            AddEditJokeView()
        }
    }
    
    private func deleteJokes(offsets: IndexSet) {
        withAnimation {
            offsets.map { filteredJokes[$0] }.forEach(viewContext.delete)
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

struct JokeRowView: View {
    let joke: Joke
    
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(joke.title ?? "Untitled")
                .font(.headline)
                .lineLimit(1)
            
            if let body = joke.body, !body.isEmpty {
                Text(body)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .lineLimit(2)
            }
        }
        .padding(.vertical, 4)
    }
}

#Preview {
    NavigationView {
        JokesView()
    }
}
