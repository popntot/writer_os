import SwiftUI

struct DumpView: View {
    var body: some View {
        SystemView()
    }
}

struct InboxDumpComposer: View {
    @Binding var text: String
    let isSubmitting: Bool
    let onSubmit: () async -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            TextEditor(text: $text)
                .frame(minHeight: 140)
                .textInputAutocapitalization(.sentences)
                .overlay {
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(.quaternary)
                }

            Button {
                Task { await onSubmit() }
            } label: {
                if isSubmitting {
                    ProgressView()
                } else {
                    Text("Submit")
                }
            }
            .disabled(isSubmitting || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
    }
}
