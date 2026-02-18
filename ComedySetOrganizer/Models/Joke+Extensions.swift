//
//  Joke+Extensions.swift
//  ComedySetOrganizer
//
//  Created by ComedySetOrganizer on 2024.
//

import CoreData
import Foundation

extension Joke {
    convenience init(context: NSManagedObjectContext, title: String, body: String = "") {
        self.init(context: context)
        self.id = UUID()
        self.title = title.trimmingCharacters(in: .whitespacesAndNewlines)
        self.body = body
        self.createdAt = Date()
        self.updatedAt = Date()
    }
    
    static func fetchRequestForAllJokes() -> NSFetchRequest<Joke> {
        let request: NSFetchRequest<Joke> = Joke.fetchRequest()
        request.sortDescriptors = [NSSortDescriptor(keyPath: \Joke.updatedAt, ascending: false)]
        return request
    }
}
