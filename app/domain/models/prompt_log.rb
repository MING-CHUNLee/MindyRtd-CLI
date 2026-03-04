require 'sequel'
require 'json'

# Domain Model — PromptLog
#
# Records every request to POST /resolve and POST /edit.
# This is the analytics data source for understanding what users ask.
#
# Table: prompt_logs
#   endpoint       — 'resolve' | 'edit'
#   instruction    — the user's natural language prompt (the key data point)
#   files_sent     — (resolve) how many file previews were submitted
#   target_files   — (resolve) JSON array of paths the LLM selected
#   file_path      — (edit) which file was being edited
#   content_length — (edit) original file size in bytes
#   duration_ms    — LLM round-trip time in milliseconds
#   created_at     — timestamp

class PromptLog < Sequel::Model
  plugin :timestamps, update_on_create: true

  # Parse target_files JSON on read
  def target_files_array
    return [] if target_files.nil? || target_files.empty?
    JSON.parse(target_files)
  rescue JSON::ParserError
    []
  end
end
