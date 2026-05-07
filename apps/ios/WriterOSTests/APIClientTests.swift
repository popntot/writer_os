import XCTest
@testable import WriterOS

final class APIClientTests: XCTestCase {
    func testProjectDecodesFromAPIShape() throws {
        let json = """
        {
          "id": "abc-123",
          "title": "Essay collection",
          "type": "book",
          "createdAt": "2026-05-06T22:00:00.000Z",
          "archivedAt": null,
          "mentorRef": null
        }
        """.data(using: .utf8)!

        let project = try JSONDecoder().decode(Project.self, from: json)

        XCTAssertEqual(project.id, "abc-123")
        XCTAssertEqual(project.title, "Essay collection")
        XCTAssertEqual(project.type, "book")
        XCTAssertNil(project.archivedAt)
        XCTAssertNil(project.mentorRef)
    }

    func testCreateProjectRequestEncodesTitleAndType() throws {
        let request = CreateProjectRequest(title: "Walk thinking", type: "essay")
        let data = try JSONEncoder().encode(request)
        let dict = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(dict["title"] as? String, "Walk thinking")
        XCTAssertEqual(dict["type"] as? String, "essay")
    }

    func testCreateProjectRequestOmitsNilTypeKey() throws {
        // The Worker's POST /projects validates `type` only when present — an
        // absent key is the canonical "no type" signal. Swift's default
        // JSONEncoder omits nil optional fields, which lines up with this.
        let request = CreateProjectRequest(title: "Walk thinking", type: nil)
        let data = try JSONEncoder().encode(request)
        let dict = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(dict["title"] as? String, "Walk thinking")
        XCTAssertNil(dict["type"])
    }
}
