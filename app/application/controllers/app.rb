require 'roda'
require 'json'

class App < Roda
  plugin :json

  route do |r|
    # ----------------------------------------------------------
    # GET / — Health check
    # ----------------------------------------------------------
    r.get '' do
      { status: 'ok', message: 'Mindy RStudio CLI API', version: '1.0.0' }
    end

    # ----------------------------------------------------------
    # POST /resolve
    # Phase 1: identify which files are relevant to the instruction
    # ----------------------------------------------------------
    r.post 'resolve' do
      data        = parse_body(request)
      instruction = data['instruction'].to_s.strip
      files       = data['files'] || []

      if instruction.empty?
        response.status = 400
        next({ error: 'instruction is required' })
      end

      started_at = Time.now
      target_files = ResolveService.new.call(instruction: instruction, files: files)
      duration_ms  = ((Time.now - started_at) * 1000).round

      # --- Analytics log ---
      PromptLog.create(
        endpoint:     'resolve',
        instruction:  instruction,
        files_sent:   files.size,
        target_files: target_files.to_json,
        duration_ms:  duration_ms,
        created_at:   Time.now
      )

      { target_files: target_files }

    rescue => e
      response.status = 500
      { error: e.message }
    end

    # ----------------------------------------------------------
    # POST /edit
    # Phase 2: apply LLM edits to a single file
    # ----------------------------------------------------------
    r.post 'edit' do
      data        = parse_body(request)
      file_path   = data['file_path'].to_s.strip
      content     = data['content'].to_s
      instruction = data['instruction'].to_s.strip

      if file_path.empty? || instruction.empty?
        response.status = 400
        next({ error: 'file_path and instruction are required' })
      end

      started_at       = Time.now
      modified_content = EditService.new.call(
        file_path:   file_path,
        content:     content,
        instruction: instruction
      )
      duration_ms = ((Time.now - started_at) * 1000).round

      # --- Analytics log ---
      PromptLog.create(
        endpoint:       'edit',
        instruction:    instruction,
        file_path:      file_path,
        content_length: content.bytesize,
        duration_ms:    duration_ms,
        created_at:     Time.now
      )

      { modified_content: modified_content }

    rescue => e
      response.status = 500
      { error: e.message }
    end

    # ----------------------------------------------------------
    # GET /analytics
    # Dashboard: aggregated stats on collected prompt data
    # ----------------------------------------------------------
    r.get 'analytics' do
      logs = PromptLog.order(Sequel.desc(:created_at))

      # Most common instructions (top 10 by frequency)
      top_instructions = DB[:prompt_logs]
        .select(:instruction, Sequel.function(:count, :id).as(:count))
        .group(:instruction)
        .order(Sequel.desc(:count))
        .limit(10)
        .map { |r| { instruction: r[:instruction], count: r[:count] } }

      # Most targeted files from /edit calls (top 10)
      top_files = DB[:prompt_logs]
        .where(endpoint: 'edit')
        .exclude(file_path: nil)
        .select(:file_path, Sequel.function(:count, :id).as(:count))
        .group(:file_path)
        .order(Sequel.desc(:count))
        .limit(10)
        .map { |r| { file: r[:file_path], count: r[:count] } }

      # Average LLM duration per endpoint
      avg_duration = {
        resolve: DB[:prompt_logs].where(endpoint: 'resolve').avg(:duration_ms)&.round,
        edit:    DB[:prompt_logs].where(endpoint: 'edit').avg(:duration_ms)&.round
      }

      # Recent 20 logs
      recent = logs.limit(20).map do |log|
        {
          id:             log.id,
          endpoint:       log.endpoint,
          instruction:    log.instruction,
          file_path:      log.file_path,
          files_sent:     log.files_sent,
          target_files:   log.target_files_array,
          content_length: log.content_length,
          duration_ms:    log.duration_ms,
          created_at:     log.created_at&.iso8601
        }
      end

      {
        total_requests:   PromptLog.count,
        by_endpoint: {
          resolve: PromptLog.where(endpoint: 'resolve').count,
          edit:    PromptLog.where(endpoint: 'edit').count
        },
        avg_duration_ms:      avg_duration,
        top_instructions:     top_instructions,
        most_edited_files:    top_files,
        recent:               recent
      }

    rescue => e
      response.status = 500
      { error: e.message }
    end
  end

  private

  def parse_body(req)
    body = req.body.read
    return {} if body.nil? || body.empty?
    JSON.parse(body)
  rescue JSON::ParserError
    {}
  end
end
