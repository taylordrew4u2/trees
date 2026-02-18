//
//  CoreDataStack.swift
//  ComedySetOrganizer
//
//  Created by ComedySetOrganizer on 2024.
//

import CoreData
import Foundation

class CoreDataStack: ObservableObject {
    static let shared = CoreDataStack()
    
    let container: NSPersistentContainer
    
    init() {
        container = NSPersistentContainer(name: "ComedySetOrganizer")
        
        container.loadPersistentStores { description, error in
            if let error = error {
                fatalError("Core Data store failed to load: \(error.localizedDescription)")
            }
        }
        
        // Ensure UUIDs are generated automatically
        container.viewContext.mergePolicy = NSMergeByPropertyObjectTrumpMergePolicy
    }
}
