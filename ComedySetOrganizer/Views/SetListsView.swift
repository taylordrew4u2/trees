//
//  SetListsView.swift
//  ComedySetOrganizer
//
//  Created by ComedySetOrganizer on 2024.
//

import SwiftUI
import CoreData

struct SetListsView: View {
    @Environment(\.managedObjectContext) private var viewContext
    @FetchRequest(
        sortDescriptors: [NSSortDescriptor(keyPath: \SetList.updatedAt, ascending: false)],
        animation: .default
    ) private var setLists: FetchedResults<SetList>
    
    var body: some View {
        Group {
            if setLists.isEmpty {
                EmptyStateView(
                    title: "No Set Lists",
                    message: "Create your first set list to get started",
                    icon: "music.note.list"
                )
            } else {
                List {
                    ForEach(setLists, id: \.id) { setList in
                        NavigationLink(destination: SetListDetailView(setList: setList)) {
                            SetListRowView(setList: setList)
                        }
                        .accessibilityElement(children: .combine)
                    }
                    .onDelete(perform: deleteSetLists)
                }
            }
        }
        .navigationTitle("Set Lists")
    }
    
    private func deleteSetLists(offsets: IndexSet) {
        withAnimation {
            offsets.map { setLists[$0] }.forEach(viewContext.delete)
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

struct SetListRowView: View {
    let setList: SetList
    
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(setList.name ?? "Untitled Set")
                .font(.headline)
            
            Text("\(setList.jokesArray.count) jokes")
                .font(.subheadline)
                .foregroundColor(.secondary)
            
            if let lastPerformed = setList.lastPerformedAt {
                Text("Last performed: \(lastPerformed, style: .date)")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}

#Preview {
    NavigationView {
        SetListsView()
    }
}
