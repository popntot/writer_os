import Foundation

struct Project: Codable, Identifiable, Equatable {
    let id: String
    let title: String
    let type: String?
    let createdAt: String
    let archivedAt: String?
    let mentorRef: String?
}

struct CreateProjectRequest: Codable {
    let title: String
    let type: String?
}
