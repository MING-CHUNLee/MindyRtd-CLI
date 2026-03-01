# Application Layer — Use Case Service
#
# ResolveService answers: "Given this instruction, which files need to change?"
#
# It sends a lightweight payload to Gemini (file names + first ~10 lines each)
# and parses the response into an array of file paths.
# This mirrors Phase 1 in agent.ts → LLMController.resolveFiles()

require 'json'

class ResolveService
  SYSTEM_PROMPT = <<~PROMPT.freeze
    You are a code analyst for R projects.

    Given a list of R files (each with their file path and a short preview),
    and a natural language instruction, identify ONLY the files that would need
    to be modified to fulfil that instruction.

    Rules:
    - Respond with ONLY a valid JSON array of file paths.
    - Example: ["src/load_data.R", "analysis/model.Rmd"]
    - If no files are relevant, respond with an empty array: []
    - Include ONLY paths that appear in the provided file list.
    - Do NOT include any explanation, commentary, or markdown — just the JSON array.
  PROMPT

  def initialize(gemini: GeminiApi.new)
    @gemini = gemini
  end

  # @param instruction [String]          Natural language instruction from the user
  # @param files       [Array<Hash>]     Array of { "path" => String, "preview" => String }
  # @return            [Array<String>]   Relevant file paths
  def call(instruction:, files:)
    return [] if files.empty?

    user_prompt = build_prompt(instruction, files)
    raw = @gemini.generate(system_prompt: SYSTEM_PROMPT, user_prompt: user_prompt)
    parse_file_list(raw)
  end

  private

  def build_prompt(instruction, files)
    file_sections = files.map do |f|
      <<~SECTION
        ### #{f['path']}
        #{f['preview']}
      SECTION
    end.join("\n")

    <<~PROMPT
      Instruction: #{instruction}

      Available files:
      #{file_sections}

      Return a JSON array of file paths that need to be modified:
    PROMPT
  end

  def parse_file_list(text)
    # Extract the first JSON array from the response (LLMs sometimes add extra text)
    match = text.match(/\[[\s\S]*?\]/)
    return [] unless match

    JSON.parse(match[0])
  rescue JSON::ParserError
    []
  end
end
