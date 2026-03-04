Sequel.migration do
  change do
    create_table(:prompt_logs) do
      primary_key :id

      # Which endpoint was called
      String   :endpoint,      null: false  # 'resolve' | 'edit'

      # The user's original instruction (the data we're collecting)
      Text     :instruction,   null: false

      # /resolve specific
      Integer  :files_sent,    default: 0   # how many file previews were sent
      Text     :target_files               # JSON array of paths the LLM selected

      # /edit specific
      String   :file_path                  # which file was edited
      Integer  :content_length, default: 0 # original file size (bytes)

      # Performance
      Integer  :duration_ms                # LLM round-trip time

      DateTime :created_at,    null: false
    end
  end
end
