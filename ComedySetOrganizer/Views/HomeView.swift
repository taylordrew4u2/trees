//
//  HomeView.swift
//  ComedySetOrganizer
//
//  Created by ComedySetOrganizer on 2024.
//

import SwiftUI

struct HomeView: View {
    var body: some View {
        NavigationView {
            ScrollView {
                VStack(spacing: 20) {
                    HomeButton(
                        title: "Jokes",
                        subtitle: "Manage your joke library",
                        icon: "text.bubble",
                        destination: JokesView()
                    )
                    
                    HomeButton(
                        title: "Create Set List",
                        subtitle: "Build a new performance set",
                        icon: "list.bullet",
                        destination: CreateSetListView()
                    )
                    
                    HomeButton(
                        title: "Set Lists",
                        subtitle: "Your saved performance sets",
                        icon: "music.note.list",
                        destination: SetListsView()
                    )
                    
                    HomeButton(
                        title: "Recordings",
                        subtitle: "Review your performances",
                        icon: "waveform",
                        destination: RecordingsView()
                    )
                }
                .padding()
            }
            .navigationTitle("Comedy Set Organizer")
            .accessibilityElement(children: .contain)
        }
        .navigationViewStyle(.stack)
    }
}

struct HomeButton<Destination: View>: View {
    let title: String
    let subtitle: String
    let icon: String
    let destination: Destination
    
    var body: some View {
        NavigationLink(destination: destination) {
            HStack {
                Image(systemName: icon)
                    .font(.title2)
                    .foregroundColor(.accentColor)
                    .frame(width: 44, height: 44)
                    .accessibilityHidden(true)
                
                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.headline)
                        .foregroundColor(.primary)
                    
                    Text(subtitle)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                
                Spacer()
                
                Image(systemName: "chevron.right")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .accessibilityHidden(true)
            }
            .padding()
            .background(Color(.systemBackground))
            .cornerRadius(12)
            .shadow(color: .black.opacity(0.05), radius: 2, x: 0, y: 1)
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isButton)
        }
        .buttonStyle(PlainButtonStyle())
    }
}

#Preview {
    HomeView()
}
