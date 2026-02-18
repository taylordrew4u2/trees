//
//  Recording+Extensions.swift
//  ComedySetOrganizer
//
//  Created by ComedySetOrganizer on 2024.
//

import CoreData
import Foundation

extension Recording {
    convenience init(context: NSManagedObjectContext, setList: SetList, fileURL: URL, duration: Double) {
        self.init(context: context)
        self.id = UUID()
        self.setListId = setList.id
        self.fileURL = fileURL
        self.durationSec = duration
        self.createdAt = Date()
    }
}
