# Application Layer — Roda Router
#
# Exposes two endpoints consumed by the TypeScript CLI:
#
#   GET  /          → health check
#   POST /resolve   → Phase 1: identify which files are relevant
#   POST /edit      → Phase 2: apply LLM edits to a single file

require 'roda'
require 'json'

class App < Roda
  plugin :json   # auto-serializes returned Hash/Array to JSON response

  route do |r|
    # ----------------------------------------------------------
    # GET / — Health check
    # ----------------------------------------------------------
    r.get '' do
      { status: 'ok', message: 'Mindy RStudio CLI API', version: '1.0.0' }
    end

    # ----------------------------------------------------------
    # POST /resolve
    #
    # Request body (JSON):
    #   {
    #     "instruction": "Add error handling to the data loading functions",
    #     "files": [
    #       { "path": "src/load_data.R", "preview": "# first 10 lines..." },
    #       ...
    #     ]
    #   }
    #
    # Response (JSON):
    #   { "target_files": ["src/load_data.R"] }
    # ----------------------------------------------------------
    r.post 'resolve' do
      data = parse_body(request)

      instruction = data['instruction'].to_s.strip
      files       = data['files'] || []

      if instruction.empty?
        response.status = 400
        next({ error: 'instruction is required' })
      end

      target_files = ResolveService.new.call(instruction: instruction, files: files)
      { target_files: target_files }

    rescue => e
      response.status = 500
      { error: e.message }
    end

    # ----------------------------------------------------------
    # POST /edit
    #
    # Request body (JSON):
    #   {
    #     "file_path":   "src/load_data.R",
    #     "content":     "# original file content...",
    #     "instruction": "Add error handling to all functions"
    #   }
    #
    # Response (JSON):
    #   { "modified_content": "# modified file content..." }
    # ----------------------------------------------------------
    r.post 'edit' do
      data = parse_body(request)

      file_path   = data['file_path'].to_s.strip
      content     = data['content'].to_s     # allow empty files
      instruction = data['instruction'].to_s.strip

      if file_path.empty? || instruction.empty?
        response.status = 400
        next({ error: 'file_path and instruction are required' })
      end

      modified_content = EditService.new.call(
        file_path:   file_path,
        content:     content,
        instruction: instruction
      )

      { modified_content: modified_content }

    rescue => e
      response.status = 500
      { error: e.message }
    end
  end

  private

  # Parse JSON request body regardless of Content-Type header
  def parse_body(req)
    body = req.body.read
    return {} if body.nil? || body.empty?

    JSON.parse(body)
  rescue JSON::ParserError
    {}
  end
end
