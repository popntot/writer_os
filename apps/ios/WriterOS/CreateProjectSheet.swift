import SwiftUI

@MainActor
struct CreateProjectSheet: View {
    typealias Submit = (_ title: String, _ type: String?) async -> Void

    let submit: Submit
    @Environment(\.dismiss) private var dismiss
    @State private var title: String = ""
    @State private var type: String = ""
    @State private var submitting = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Project") {
                    TextField("Title", text: $title)
                    TextField("Type (optional)", text: $type)
                }
            }
            .navigationTitle("New project")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(submitting)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") { Task { await onCreate() } }
                        .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty || submitting)
                }
            }
        }
    }

    private func onCreate() async {
        submitting = true
        let trimmedType = type.trimmingCharacters(in: .whitespaces)
        await submit(
            title.trimmingCharacters(in: .whitespaces),
            trimmedType.isEmpty ? nil : trimmedType,
        )
        submitting = false
        dismiss()
    }
}
