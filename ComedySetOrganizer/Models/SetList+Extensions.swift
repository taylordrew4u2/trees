//
//  SetList+Extensions.swift
//  ComedySetOrganizer
//
//  Created by ComedySetOrganizer on 2024.
//

import CoreData
import Foundation

extension SetList {
    convenience init(context: NSManagedObjectContext, name: String, jokes: [Joke] = []) {
        self.init(context: context)
        self.id = UUID()
        self.name = name.trimmingCharacters(in: .whitespacesAndNewlines)
        self.jokeOrder = jokes.map { $0.id! } as NSArray
        self.createdAt = Date()
        self.updatedAt = Date()
    }
    
    var jokesArray: [Joke] {
        guard let context = self.managedObjectContext,
              let jokeOrder = jokeOrder as? [UUID] else { return [] }
        return jokeOrder.compactMap { uuid in
            let request: NSFetchRequest<Joke> = Joke.fetchRequest()
            request.predicate = NSPredicate(format: "id == %@", uuid as CVarArg)
            return try? context.fetch(request).first
        }
    }
}
