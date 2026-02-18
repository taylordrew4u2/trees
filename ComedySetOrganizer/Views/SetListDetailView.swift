//
//  SetListDetailView.swift
//  ComedySetOrganizer
//
//  Created by ComedySetOrganizer on 2024.
//

import SwiftUI

struct SetListDetailView: View {
    @Environment(\.managedObjectContext) private var viewContext
    let setList: SetList
    
    @State private var showingRecordView = false
    
    var body: some View {
        List {
            Section {
                ForEach(setList.jokesArray, id: \.id) { joke in
                    NavigationLink(destination: JokeDetailView(joke: joke)) {
                        Text(joke.title ?? "Untitled")
                    }
                }
            } header: {
                Text("Jokes in Set (\(setList.jokesArray.count))")
            }
            
            Section {
                if let createdAt = setList.createdAt {
                    HStack {
                        Text("Created")
                        Spacer()
                        Text(createdAt, style: .date)
                            .foregroundColor(.secondary)
                    }
                }
                
                if let lastPerformed = setList.lastPerformedAt {
                    HStack {
                        Text("Last Performed")
                        Spacer()
                        Text(lastPerformed, style: .date)
                            .foregroundColor(.secondary)
                    }
                }
            } header: {
                Text("Details")
            }
        }
        .navigationTitle(setList.name ?? "Set List")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(action: { showingRecordView = true }) {
                    Label("Record", systemImage: "record.circle")
                }
            }
        }
        .sheet(isPresented: $showingRecordView) {
            RecordSetView(setList: setList)
        }
    }
}
